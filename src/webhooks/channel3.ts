import { WakeshiftError } from "@wakeshift/sdk";
import { z } from "zod";

import { cancelSubscription, retrieveSubscription } from "../channel3/subscriptions";
import type { Bindings } from "../types";
import type { WakeshiftApp } from "../wakeshift";
import { type WatchEvents, watchArgs } from "../wakeshift/events";

// Channel3 signs webhooks with Standard Webhooks (Svix): HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{raw body}" keyed by the base64 part of whsec_…
const TOLERANCE_SECONDS = 5 * 60;
// Only reap a Channel3 subscription nobody watches once it's past the window in which
// watch_product may still be subscribing conversations to it.
const REAP_AFTER_MS = 60 * 60 * 1000;

export async function verifyWebhook(
	secret: string,
	headers: Headers,
	body: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
	const id = headers.get("svix-id");
	const timestamp = headers.get("svix-timestamp");
	const signatures = headers.get("svix-signature");
	if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
	if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

	let keyBytes: Uint8Array;
	try {
		keyBytes = Uint8Array.from(atob(secret.trim().replace(/^whsec_/, "")), (c) =>
			c.charCodeAt(0),
		);
	} catch {
		console.error("CHANNEL3_WEBHOOK_SECRET is not a whsec_ secret");
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const expected = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(`${id}.${timestamp}.${body}`),
		),
	);
	for (const entry of signatures.split(" ")) {
		const [version, sig] = entry.split(",", 2);
		if (version !== "v1" || !sig) continue;
		let given: Uint8Array;
		try {
			given = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
		} catch {
			continue;
		}
		if (timingSafeEqual(expected, given)) return true;
	}
	return false;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

const priceSchema = z.object({
	price: z.number(),
	compare_at_price: z.number().nullish(),
	currency: z.string(),
});

const subjectSchema = z.object({
	product_id: z.string(),
	domain: z.string(),
	selection: z.array(z.object({ name: z.string(), label: z.string() })).nullish(),
});

const envelopeSchema = z.object({
	id: z.string(),
	timestamp: z.string(),
	type: z.string(),
	data: z.looseObject({ subscription_id: z.string(), subject: subjectSchema }),
});

const priceDataSchema = z.object({ previous: priceSchema, current: priceSchema });
const availabilityDataSchema = z.object({
	previous: z.enum(["InStock", "OutOfStock"]),
	current: z.enum(["InStock", "OutOfStock"]),
});

const lifecycleDataSchema = z.object({
	offer: z.object({
		price: priceSchema,
		availability: z.enum(["InStock", "OutOfStock"]),
	}),
});

type Envelope = z.infer<typeof envelopeSchema>;

function subjectOf(event: Envelope) {
	const { product_id, domain, selection } = event.data.subject;
	return {
		watch_id: event.data.subscription_id,
		product_id,
		domain,
		selection: selection?.map(({ name, label }) => ({ name, label })) ?? null,
		changed_at: event.timestamp,
	};
}

const normPrice = (p: z.infer<typeof priceSchema>) => ({
	price: p.price,
	compare_at_price: p.compare_at_price ?? null,
	currency: p.currency,
});

// Emits a Channel3 event to its watchers, or returns null for types we don't relay.
// Redeliveries carry the same event id; Wakeshift emits an id once per day.
export async function relay(events: WatchEvents, event: Envelope) {
	const args = watchArgs(event.data.subscription_id);
	if (event.type === "offer.price.changed") {
		const d = priceDataSchema.parse(event.data);
		return events.price.emit(
			args,
			{ ...subjectOf(event), previous: normPrice(d.previous), current: normPrice(d.current) },
			{ id: event.id },
		);
	}
	if (event.type === "offer.availability.changed") {
		const d = availabilityDataSchema.parse(event.data);
		return events.availability.emit(
			args,
			{
				...subjectOf(event),
				change: "stock",
				previous: d.previous,
				current: d.current,
				price: null,
			},
			{ id: event.id },
		);
	}
	if (event.type === "offer.created") {
		const { offer } = lifecycleDataSchema.parse(event.data);
		return events.availability.emit(
			args,
			{
				...subjectOf(event),
				change: "listed",
				previous: null,
				current: offer.availability,
				price: normPrice(offer.price),
			},
			{ id: event.id },
		);
	}
	if (event.type === "offer.deleted") {
		const { offer } = lifecycleDataSchema.parse(event.data);
		return events.availability.emit(
			args,
			{
				...subjectOf(event),
				change: "delisted",
				previous: offer.availability,
				current: null,
				price: null,
			},
			{ id: event.id },
		);
	}
	return null;
}

// Cancels a Channel3 subscription no conversation watches anymore (for either event),
// so its product stops being refreshed on our account.
async function reapIfUnwatched(
	env: Bindings,
	events: WatchEvents,
	subscriptionId: string,
): Promise<void> {
	try {
		const args = watchArgs(subscriptionId);
		for (const event of [events.price, events.availability]) {
			if ((await event.status(args)).subscriptions > 0) return;
		}
		const sub = await retrieveSubscription(env, subscriptionId);
		if (sub.status !== "active") return;
		if (Date.now() - new Date(sub.created_at).getTime() < REAP_AFTER_MS) return;
		await cancelSubscription(env, subscriptionId);
		console.log(
			JSON.stringify({
				event: "channel3_subscription_reaped",
				subscription_id: subscriptionId,
			}),
		);
	} catch (err) {
		console.error("channel3 subscription reap failed", subscriptionId, String(err));
	}
}

function abort(status: number, message: string): Response {
	// Tells Svix not to retry a delivery that can never succeed.
	return new Response(message, { status, headers: { "webhook-delivery": "abort-message" } });
}

export async function handleChannel3Webhook(
	request: Request,
	env: Bindings,
	app: WakeshiftApp,
	waitUntil: (p: Promise<unknown>) => void,
): Promise<Response> {
	const body = await request.text();
	if (!(await verifyWebhook(env.CHANNEL3_WEBHOOK_SECRET, request.headers, body))) {
		return new Response("invalid signature", { status: 400 });
	}

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return abort(400, "invalid JSON");
	}
	const envelope = envelopeSchema.safeParse(json);
	if (!envelope.success) return abort(400, "unrecognized event");
	const event = envelope.data;

	try {
		const out = await relay(app.events, event);
		if (!out) return Response.json({ received: true, relayed: false });
		console.log(
			JSON.stringify({
				event: "channel3_webhook_relayed",
				type: event.type,
				event_id: event.id,
				subscription_id: event.data.subscription_id,
				matched: out.matched,
				duplicate: out.duplicate,
			}),
		);
		if (!out.duplicate && out.matched === 0) {
			waitUntil(reapIfUnwatched(env, app.events, event.data.subscription_id));
		}
		return Response.json({ received: true, relayed: true, matched: out.matched });
	} catch (err) {
		console.error("channel3 webhook relay failed", event.id, String(err));
		if (err instanceof z.ZodError) return abort(400, "unrecognized event data");
		const permanent =
			err instanceof WakeshiftError &&
			err.status >= 400 &&
			err.status < 500 &&
			err.status !== 429 &&
			err.status !== 401;
		return permanent
			? abort(422, "event rejected")
			: new Response("relay failed", { status: 503 });
	}
}

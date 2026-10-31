import { z } from "zod";

import { cancelSubscription, retrieveSubscription } from "../channel3/subscriptions";
import type { Bindings } from "../types";
import { isWakeshiftCode, type WakeshiftClient, WakeshiftError } from "../wakeshift/client";
import {
	AVAILABILITY_EVENT,
	type AvailabilityPayload,
	availabilityText,
	ensureManifest,
	PRICE_EVENT,
	type PricePayload,
	priceText,
	resetManifest,
	WAKE_EVENTS,
	type WakeEventName,
	watchArgs,
} from "../wakeshift/events";

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

type Occurrence = {
	name: WakeEventName;
	payload: PricePayload | AvailabilityPayload;
	text: string;
};

// The Wakeshift occurrence for a Channel3 event, or null for event types we don't relay.
export function toOccurrence(event: z.infer<typeof envelopeSchema>): Occurrence | null {
	const subject = {
		product_id: event.data.subject.product_id,
		domain: event.data.subject.domain,
		selection:
			event.data.subject.selection?.map(({ name, label }) => ({ name, label })) ?? null,
		changed_at: event.timestamp,
	};
	if (event.type === "offer.price.changed") {
		const d = priceDataSchema.parse(event.data);
		const norm = (p: z.infer<typeof priceSchema>) => ({
			price: p.price,
			compare_at_price: p.compare_at_price ?? null,
			currency: p.currency,
		});
		const payload: PricePayload = {
			...subject,
			previous: norm(d.previous),
			current: norm(d.current),
		};
		return { name: PRICE_EVENT, payload, text: priceText(payload) };
	}
	if (event.type === "offer.availability.changed") {
		const d = availabilityDataSchema.parse(event.data);
		const payload: AvailabilityPayload = {
			...subject,
			previous: d.previous,
			current: d.current,
		};
		return { name: AVAILABILITY_EVENT, payload, text: availabilityText(payload) };
	}
	return null;
}

type EmitResult = { matched?: number; duplicate?: boolean };

async function emit(wake: WakeshiftClient, body: Record<string, unknown>): Promise<EmitResult> {
	await ensureManifest(wake);
	try {
		return await wake.request<EmitResult>("POST", "/events/emit", body);
	} catch (err) {
		// Another deploy may have replaced the manifest since this isolate sent it.
		if (!isWakeshiftCode(err, "unknown_event")) throw err;
		resetManifest();
		await ensureManifest(wake);
		return wake.request<EmitResult>("POST", "/events/emit", body);
	}
}

// Cancels a Channel3 subscription no conversation watches anymore (for either event),
// so its product stops being refreshed on our account.
async function reapIfUnwatched(
	env: Bindings,
	wake: WakeshiftClient,
	productId: string,
	subscriptionId: string,
): Promise<void> {
	try {
		const args = watchArgs(productId, subscriptionId);
		for (const name of WAKE_EVENTS) {
			const status = await wake.request<{ subscriptions?: number }>(
				"POST",
				"/events/status",
				{
					name,
					arguments: args,
				},
			);
			if ((status.subscriptions ?? 0) > 0) return;
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
	wake: WakeshiftClient,
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

	let occurrence: Occurrence | null;
	try {
		occurrence = toOccurrence(envelope.data);
	} catch {
		return abort(400, "unrecognized event data");
	}
	if (!occurrence) return Response.json({ received: true, relayed: false });

	const event = envelope.data;
	try {
		const out = await emit(wake, {
			name: occurrence.name,
			arguments: watchArgs(event.data.subject.product_id, event.data.subscription_id),
			payload: occurrence.payload,
			text: occurrence.text,
			// Redeliveries carry the same event id; Wakeshift emits an id once per day.
			id: event.id,
		});
		console.log(
			JSON.stringify({
				event: "channel3_webhook_relayed",
				type: event.type,
				event_id: event.id,
				subscription_id: event.data.subscription_id,
				matched: out.matched ?? 0,
				duplicate: Boolean(out.duplicate),
			}),
		);
		if (!out.duplicate && (out.matched ?? 0) === 0) {
			waitUntil(
				reapIfUnwatched(
					env,
					wake,
					event.data.subject.product_id,
					event.data.subscription_id,
				),
			);
		}
		return Response.json({ received: true, relayed: true, matched: out.matched ?? 0 });
	} catch (err) {
		console.error("channel3 webhook relay failed", event.id, String(err));
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

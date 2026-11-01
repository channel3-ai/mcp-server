import type { Wakeshift } from "@wakeshift/sdk";
import { z } from "zod";

// Each subscriber's arguments name the Channel3 product and the Channel3 product
// subscription (whose ID pins its exact scope: merchant domains and variant selection),
// so an occurrence reaches exactly the conversations watching that scope.

// Wakeshift routes on argument values made of a-z 0-9 . _ -, and Channel3 IDs are
// mixed-case. This encoding is injective: [a-z0-9.] pass through, an uppercase letter
// becomes "_" + its lowercase, and anything else (including "_" and "-") becomes "-" + 4 hex.
export function toArgValue(id: string): string {
	let out = "";
	for (const ch of id) {
		if (/[a-z0-9.]/.test(ch)) out += ch;
		else if (/[A-Z]/.test(ch)) out += `_${ch.toLowerCase()}`;
		else out += `-${(ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;
	}
	return out;
}

export function watchArgs(productId: string, subscriptionId: string) {
	return { product: toArgValue(productId), subscription: toArgValue(subscriptionId) };
}

// An agent stops a watch by watch_id: unsubscribing needs the exact arguments, and without
// sign-in Wakeshift can't list a conversation's subscriptions. Every alert repeats it.
export function toWatchId(productId: string, subscriptionId: string): string {
	return `${productId}:${subscriptionId}`;
}

export function parseWatchId(
	watchId: string,
): { productId: string; subscriptionId: string } | null {
	const i = watchId.indexOf(":");
	if (i <= 0 || i === watchId.length - 1) return null;
	return { productId: watchId.slice(0, i), subscriptionId: watchId.slice(i + 1) };
}

const argsSchema = z.object({
	product: z.string().describe("The Channel3 product ID, encoded"),
	subscription: z.string().describe("The Channel3 product subscription ID, encoded"),
});

const subjectShape = {
	watch_id: z.string().describe("Pass to unwatch_product to stop this watch"),
	product_id: z.string().describe("Channel3 product ID"),
	domain: z.string().describe("Merchant domain of the offer, e.g. nike.com"),
	selection: z
		.array(z.object({ name: z.string(), label: z.string() }))
		.nullable()
		.describe("The pinned variant configuration, or null for the offer as a whole"),
	changed_at: z.string().describe("When the change was committed (ISO 8601)"),
};

const priceSchema = z.object({
	price: z.number(),
	compare_at_price: z.number().nullable(),
	currency: z.string(),
});

const availabilitySchema = z.enum(["InStock", "OutOfStock"]);

const pricePayloadSchema = z.object({
	...subjectShape,
	previous: priceSchema,
	current: priceSchema,
});

const availabilityPayloadSchema = z.object({
	...subjectShape,
	previous: availabilitySchema,
	current: availabilitySchema,
});

export type PricePayload = z.infer<typeof pricePayloadSchema>;
export type AvailabilityPayload = z.infer<typeof availabilityPayloadSchema>;

function money(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
	} catch {
		return `${amount} ${currency}`;
	}
}

function variant(selection: { label: string }[] | null): string {
	return selection?.length ? ` (${selection.map((s) => s.label).join(", ")})` : "";
}

const followUp = (p: { watch_id: string }) =>
	`Call get_products with this product ID for current offers. To stop this alert, call unwatch_product with watch_id ${p.watch_id}.`;

// The line the woken agent reads first. Wakeshift caps it at 1000 bytes.
export function priceText(p: PricePayload): string {
	const from = money(p.previous.price, p.previous.currency);
	const to = money(p.current.price, p.current.currency);
	const verb =
		p.current.price < p.previous.price
			? "dropped"
			: p.current.price > p.previous.price
				? "rose"
				: "changed";
	return `Price ${verb} on Channel3 product ${p.product_id}${variant(p.selection)} at ${p.domain}: ${from} → ${to}. ${followUp(p)}`.slice(
		0,
		1000,
	);
}

export function availabilityText(p: AvailabilityPayload): string {
	const state = p.current === "InStock" ? "back in stock" : "out of stock";
	return `Channel3 product ${p.product_id}${variant(p.selection)} is ${state} at ${p.domain}. ${followUp(p)}`.slice(
		0,
		1000,
	);
}

export function defineWatchEvents(wake: Wakeshift) {
	return {
		price: wake.defineEvent("product.price.changed", {
			description: "A watched product's price changed at a retailer",
			args: argsSchema,
			payload: pricePayloadSchema,
			text: priceText,
		}),
		availability: wake.defineEvent("product.availability.changed", {
			description: "A watched product went in or out of stock at a retailer",
			args: argsSchema,
			payload: availabilityPayloadSchema,
			text: availabilityText,
		}),
	};
}

export type WatchEvents = ReturnType<typeof defineWatchEvents>;

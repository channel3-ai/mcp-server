import type { WakeshiftClient } from "./client";

// Wakeshift events this server offers. Each subscriber's arguments name the Channel3
// product and the Channel3 product subscription (whose ID pins its exact scope: merchant
// domains and variant selection), so an occurrence reaches exactly the conversations
// watching that scope.

export const PRICE_EVENT = "product.price.changed";
export const AVAILABILITY_EVENT = "product.availability.changed";
export type WakeEventName = typeof PRICE_EVENT | typeof AVAILABILITY_EVENT;
export const WAKE_EVENTS: readonly WakeEventName[] = [PRICE_EVENT, AVAILABILITY_EVENT];

export type WatchArgs = { product: string; subscription: string };

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

export function fromArgValue(value: string): string {
	return value.replace(/_([a-z])|-([0-9a-f]{4})/g, (_m, upper: string, hex: string) =>
		upper ? upper.toUpperCase() : String.fromCodePoint(Number.parseInt(hex, 16)),
	);
}

export function watchArgs(productId: string, subscriptionId: string): WatchArgs {
	return { product: toArgValue(productId), subscription: toArgValue(subscriptionId) };
}

const ARGUMENTS_SCHEMA = {
	type: "object",
	properties: {
		product: { type: "string", description: "The Channel3 product ID, encoded" },
		subscription: {
			type: "string",
			description: "The Channel3 product subscription ID, encoded",
		},
	},
	required: ["product", "subscription"],
	additionalProperties: false,
};

const SUBJECT_PROPERTIES = {
	product_id: { type: "string", description: "Channel3 product ID" },
	domain: { type: "string", description: "Merchant domain of the offer, e.g. nike.com" },
	selection: {
		type: ["array", "null"],
		description: "The pinned variant configuration, or null for the offer as a whole",
		items: {
			type: "object",
			properties: { name: { type: "string" }, label: { type: "string" } },
			required: ["label", "name"],
		},
	},
	changed_at: { type: "string", description: "When the change was committed (ISO 8601)" },
};

const PRICE_SCHEMA = {
	type: "object",
	properties: {
		price: { type: "number" },
		compare_at_price: { type: ["number", "null"] },
		currency: { type: "string" },
	},
	required: ["currency", "price"],
};

const AVAILABILITY_VALUES = { type: "string", enum: ["InStock", "OutOfStock"] };

export type PricePayload = {
	product_id: string;
	domain: string;
	selection: { name: string; label: string }[] | null;
	changed_at: string;
	previous: { price: number; compare_at_price: number | null; currency: string };
	current: { price: number; compare_at_price: number | null; currency: string };
};

export type AvailabilityPayload = {
	product_id: string;
	domain: string;
	selection: { name: string; label: string }[] | null;
	changed_at: string;
	previous: "InStock" | "OutOfStock";
	current: "InStock" | "OutOfStock";
};

function manifestEvent(name: WakeEventName, description: string, payloadProps: object) {
	return {
		name,
		description,
		arguments: ARGUMENTS_SCHEMA,
		payload: {
			type: "object",
			properties: { ...SUBJECT_PROPERTIES, ...payloadProps },
			required: ["changed_at", "current", "domain", "previous", "product_id", "selection"],
		},
		// One topic segment per required argument, in name order (as @wakeshift/sdk derives it).
		topic: `ev/${name}/{product}/{subscription}`,
	};
}

export const MANIFEST_EVENTS = [
	manifestEvent(PRICE_EVENT, "A watched product's price changed at a retailer", {
		previous: PRICE_SCHEMA,
		current: PRICE_SCHEMA,
	}),
	manifestEvent(AVAILABILITY_EVENT, "A watched product went in or out of stock at a retailer", {
		previous: AVAILABILITY_VALUES,
		current: AVAILABILITY_VALUES,
	}),
];

// Merge (never replace) our events into the app's manifest once per isolate, as
// @wakeshift/sdk's attach does. A failed send is retried on the next call.
let manifestSent: Promise<void> | null = null;

export function ensureManifest(client: WakeshiftClient): Promise<void> {
	manifestSent ??= client
		.request("POST", "/manifest/merge", { events: MANIFEST_EVENTS })
		.then(() => undefined)
		.catch((err) => {
			manifestSent = null;
			throw err;
		});
	return manifestSent;
}

export function resetManifest(): void {
	manifestSent = null;
}

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
	return (
		`Price ${verb} on Channel3 product ${p.product_id}${variant(p.selection)} at ${p.domain}: ` +
		`${from} → ${to}. Call get_products with this product ID for current offers.`
	).slice(0, 1000);
}

export function availabilityText(p: AvailabilityPayload): string {
	const state = p.current === "InStock" ? "back in stock" : "out of stock";
	return (
		`Channel3 product ${p.product_id}${variant(p.selection)} is ${state} at ${p.domain}. ` +
		"Call get_products with this product ID for current offers."
	).slice(0, 1000);
}

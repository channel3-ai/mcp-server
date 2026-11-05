import { type Channel3Api, Channel3Error } from "@channel3/sdk";

import type { Bindings } from "../types";
import { createClient } from "./client";

// Offer events every watch subscribes to on Channel3. Keeping one fixed set means
// conversations watching the same product scope share one Channel3 subscription.
export const WATCH_EVENTS: Channel3Api.CreateProductSubscriptionRequestEventsItem[] = [
	"offer.price.changed",
	"offer.availability.changed",
	"offer.created",
	"offer.deleted",
];

// Channel3 returns 422 naming what's wrong, including the values a product with variant options
// needs, in terms of its own `selection` field. The agent knows that field as selected_options.
function rejectionMessage(err: unknown): string | null {
	if (!(err instanceof Channel3Error) || err.statusCode !== 422) return null;
	const detail = (err.body as { detail?: unknown } | undefined)?.detail;
	if (typeof detail !== "string") return null;
	return `${detail.replaceAll("`selection`", "selected_options")}. Call watch_product again with these plus every other option the user asked for, such as a color: an option you leave out can stay on this product's default. If they haven't chosen, ask them first.`;
}

// Channel3 delivers webhooks to the endpoints of the account that owns the subscription,
// so watches are always created on this server's own account, whatever key the caller uses.
function serverClient(env: Bindings) {
	return createClient(env.DEFAULT_CHANNEL3_API_KEY, env.CHANNEL3_BASE_URL || undefined);
}

export async function createWatchSubscription(
	env: Bindings,
	params: {
		productId: string;
		domains?: string[];
		selection?: { name: string; label: string }[];
	},
): Promise<Channel3Api.ProductSubscriptionResponse> {
	try {
		return await serverClient(env).productSubscriptions.create({
			product_id: params.productId,
			events: WATCH_EVENTS,
			...(params.domains?.length ? { domains: params.domains } : {}),
			...(params.selection?.length ? { selection: params.selection } : {}),
		});
	} catch (err) {
		const message = rejectionMessage(err);
		throw message ? new Error(message) : err;
	}
}

export async function retrieveSubscription(env: Bindings, subscriptionId: string) {
	return serverClient(env).productSubscriptions.retrieve({ subscription_id: subscriptionId });
}

export async function cancelSubscription(env: Bindings, subscriptionId: string) {
	return serverClient(env).productSubscriptions.cancel({ subscription_id: subscriptionId });
}

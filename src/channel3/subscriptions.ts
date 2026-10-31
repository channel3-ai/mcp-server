import type { Channel3Api } from "@channel3/sdk";

import type { Bindings } from "../types";
import { createClient } from "./client";

// Offer events every watch subscribes to on Channel3. Keeping one fixed set means
// conversations watching the same product scope share one Channel3 subscription.
export const WATCH_EVENTS: Channel3Api.CreateProductSubscriptionRequestEventsItem[] = [
	"offer.price.changed",
	"offer.availability.changed",
];

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
	return serverClient(env).productSubscriptions.create({
		product_id: params.productId,
		events: WATCH_EVENTS,
		...(params.domains?.length ? { domains: params.domains } : {}),
		...(params.selection?.length ? { selection: params.selection } : {}),
	});
}

export async function retrieveSubscription(env: Bindings, subscriptionId: string) {
	return serverClient(env).productSubscriptions.retrieve({ subscription_id: subscriptionId });
}

export async function cancelSubscription(env: Bindings, subscriptionId: string) {
	return serverClient(env).productSubscriptions.cancel({ subscription_id: subscriptionId });
}

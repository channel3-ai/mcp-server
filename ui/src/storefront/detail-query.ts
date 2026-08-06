import type { StorefrontBridge } from "@/storefront/bridge";

export function detailQueryOptions(bridge: StorefrontBridge, id: string) {
	return {
		queryKey: ["details", id] as const,
		queryFn: () => bridge.getProduct(id),
	};
}

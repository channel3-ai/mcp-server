import type { GetProductOptions, StorefrontBridge } from "@/storefront/bridge";

export function detailQueryOptions(
	bridge: StorefrontBridge,
	id: string,
	options?: GetProductOptions,
) {
	return {
		queryKey: ["details", id, options?.selectedOptions ?? null] as const,
		queryFn: () => bridge.getProduct(id, options),
		staleTime: 5 * 60_000,
	};
}

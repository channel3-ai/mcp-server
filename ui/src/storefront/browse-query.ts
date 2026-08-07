import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { BrowsePage, StorefrontBridge } from "@/storefront/bridge";

export interface BrowseCriteria {
	query?: string;
	imageUrl?: string;
}

export function browseQueryOptions(bridge: StorefrontBridge, criteria: BrowseCriteria) {
	const query = criteria.query ?? "";
	const imageUrl = criteria.imageUrl ?? null;
	return {
		queryKey: ["browse", query, imageUrl] as const,
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			bridge.browse({ query, imageUrl: criteria.imageUrl, pageToken: pageParam }),
		initialPageParam: undefined as string | undefined,
	};
}

export function browseFirstPageData(
	page: BrowsePage,
): InfiniteData<BrowsePage, string | undefined> {
	return { pages: [page], pageParams: [undefined] };
}

export function seedBrowseFirstPage(
	queryClient: QueryClient,
	bridge: StorefrontBridge,
	criteria: BrowseCriteria,
	page: BrowsePage,
): void {
	queryClient.setQueryData(
		browseQueryOptions(bridge, criteria).queryKey,
		browseFirstPageData(page),
	);
}

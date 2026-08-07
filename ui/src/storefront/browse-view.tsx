import type { ProductDetail } from "@channel3/sdk/resources";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductGrid } from "@/registry/default/components/product-grid";
import { useInViewport } from "@/registry/default/hooks/use-in-viewport";
import type { StorefrontBridge } from "@/storefront/bridge";
import { browseQueryOptions } from "@/storefront/browse-query";
import { ProductSaveToggle } from "@/storefront/save-toggle";
import type { SavedProducts } from "@/storefront/use-saved-products";

export function BrowseGridSkeleton({ caption }: { caption?: string }) {
	return (
		<div className="flex min-h-full flex-col gap-3 p-4" aria-busy="true">
			{caption ? <p className="text-muted-foreground text-sm">{caption}</p> : null}
			<ProductGrid products={[]} loading />
		</div>
	);
}

export function BrowseView({
	bridge,
	saved,
	initialQuery,
	initialImageUrl,
	initialResults,
	initialNextPageToken = null,
	onSelect,
	onPrefetchProduct,
	onResultsChange,
	onBack,
	onExit,
	locale,
}: {
	bridge: StorefrontBridge;
	saved: SavedProducts;
	initialQuery?: string;
	initialImageUrl?: string;
	initialResults?: ProductDetail[];
	initialNextPageToken?: string | null;
	onSelect: (product: ProductDetail) => void;
	onPrefetchProduct?: (product: ProductDetail) => void;
	onResultsChange?: (products: ProductDetail[]) => void;
	onBack?: () => void;
	onExit?: () => void;
	locale?: string;
}) {
	const query = initialQuery ?? "";
	const criteria = Boolean(query.trim() || initialImageUrl);

	const search = useInfiniteQuery({
		...browseQueryOptions(bridge, { query: initialQuery, imageUrl: initialImageUrl }),
		getNextPageParam: (last) => last.nextPageToken ?? undefined,
		enabled: criteria,
		initialData: initialResults?.length
			? {
					pages: [{ products: initialResults, nextPageToken: initialNextPageToken }],
					pageParams: [undefined],
				}
			: undefined,
		placeholderData: (previous) => previous,
	});
	const results = React.useMemo(
		() => search.data?.pages.flatMap((page) => page.products) ?? [],
		[search.data],
	);
	React.useEffect(() => {
		onResultsChange?.(results);
	}, [results, onResultsChange]);
	const searching = criteria && search.isPending && !search.isPlaceholderData;

	const [sentinel, setSentinel] = React.useState<HTMLDivElement | null>(null);
	const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = search;
	useInViewport(sentinel, () => void fetchNextPage(), {
		// Without the error gate, re-subscribing on settle refires immediately and storms.
		enabled: hasNextPage && !isFetchingNextPage && !isFetchNextPageError,
		rootMargin: "200px",
	});

	const hasHeader = Boolean(onBack || onExit);

	return (
		<div className="flex min-h-full flex-col starting:opacity-0 transition-opacity duration-200 ease-out">
			{hasHeader ? (
				<div className="sticky top-0 z-10 flex items-center gap-2 bg-background px-4 pt-4 pb-2">
					{onBack ? (
						<Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
							<ArrowLeft className="size-4" />
						</Button>
					) : null}
					<div className="flex-1" />
					{onExit ? (
						<Button variant="ghost" size="sm" className="shrink-0" onClick={onExit}>
							Close
						</Button>
					) : null}
				</div>
			) : null}

			<div
				className={cn("flex flex-col gap-6 px-4 pb-4", hasHeader ? "pt-1" : "pt-4")}
				aria-busy={searching}
			>
				{searching ? (
					<ProductGrid products={[]} loading />
				) : (
					<ProductGrid
						products={results}
						onSelect={onSelect}
						onPreload={onPrefetchProduct}
						cardAction={(product) => (
							<ProductSaveToggle product={product} saved={saved} />
						)}
						showSwatches={false}
						locale={locale}
						emptyState={
							<p className="py-16 text-center text-muted-foreground text-sm">
								{criteria
									? "No products found. Ask in the chat to refine your search."
									: "Ask for something in the chat to see products here."}
							</p>
						}
					/>
				)}
				{isFetchingNextPage ? (
					<ProductGrid products={[]} loading skeletonCount={4} />
				) : null}
				{isFetchNextPageError ? (
					<div
						role="status"
						className="flex items-center justify-center gap-3 py-4 text-muted-foreground text-sm"
					>
						<span>Couldn't load more products.</span>
						<Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
							Retry
						</Button>
					</div>
				) : null}
				{hasNextPage ? <div ref={setSentinel} aria-hidden className="h-px" /> : null}
			</div>
		</div>
	);
}

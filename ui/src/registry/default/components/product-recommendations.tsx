import type { ProductDetail, SearchFilters } from "@channel3/sdk/resources";
import type * as React from "react";

import { cn } from "@/lib/utils";
import { ProductGrid } from "@/registry/default/components/product-grid";
import {
	type SimilarFetcher,
	useProductRecommendations,
} from "@/registry/default/hooks/use-product-recommendations";

type OptionValue = ProductDetail.Variants.Option.Value;

export interface ProductRecommendationsProps
	extends Omit<React.ComponentProps<"section">, "onSelect" | "title"> {
	/** Canonical id of the product on the page (the PDP's `product.id`). */
	productId: string | undefined;
	/** Server-side fetcher wrapping `client.products.findSimilar`. */
	fetchSimilar: SimilarFetcher;
	/** Heading above the grid. Defaults to "You might also like". */
	title?: React.ReactNode;
	/** Max recommendations to request. Defaults to 12. */
	limit?: number;
	/** Optional filters forwarded to the fetcher (e.g. same gender/brand). */
	filters?: SearchFilters;
	/** Fetch on mount instead of when the section scrolls into view. */
	eager?: boolean;
	/** Suspend fetching entirely (e.g. a feature flag). Defaults to `true`. */
	enabled?: boolean;
	/** Number of skeleton cards shown while loading. Defaults to 8. */
	skeletonCount?: number;
	/** Per-product destination URL; makes each card a crawlable `<a href>`. */
	getHref?: (product: ProductDetail) => string;
	/** Forwarded to each card. */
	onSelect?: (product: ProductDetail) => void;
	/** Forwarded to each card; prefetch hook on hover/focus/touch. */
	onPreload?: (product: ProductDetail) => void;
	/** Forwarded to each card for color-swatch navigation. */
	onSelectVariant?: (product: ProductDetail, value: OptionValue) => void;
	/** Show color swatches below the price on each card. */
	showSwatches?: boolean;
	/** Locale override for price formatting. */
	locale?: string;
}

/**
 * Lazy "you might also like" grid for a PDP. Defers the `findSimilar` fetch
 * until the section scrolls into view (so it never blocks the page), shows a
 * skeleton grid while loading, and renders nothing once it's known there are no
 * recommendations. Reuses {@link ProductGrid} so the section matches browse
 * results and shoppers can keep scrolling down through the full set.
 */
export function ProductRecommendations({
	productId,
	fetchSimilar,
	title = "You might also like",
	limit = 12,
	filters,
	eager = false,
	enabled = true,
	skeletonCount = 8,
	getHref,
	onSelect,
	onPreload,
	onSelectVariant,
	showSwatches,
	locale,
	className,
	...props
}: ProductRecommendationsProps) {
	const { ref, products, isLoading, hasLoaded } = useProductRecommendations({
		productId,
		fetchSimilar,
		limit,
		filters,
		eager,
		enabled,
	});

	// Once loaded with nothing to show, collapse entirely.
	if (hasLoaded && products.length === 0) {
		return null;
	}

	// Until the fetch starts, render only the observed section so the heading
	// doesn't sit above an empty grid.
	const showGrid = isLoading || products.length > 0;

	return (
		<section
			ref={ref}
			data-slot="product-recommendations"
			className={cn("w-full", className)}
			{...props}
		>
			{showGrid ? (
				<>
					<div className="mb-3 text-base font-medium">{title}</div>
					<ProductGrid
						products={products}
						loading={isLoading && products.length === 0}
						skeletonCount={skeletonCount}
						getHref={getHref}
						onSelect={onSelect}
						onPreload={onPreload}
						onSelectVariant={onSelectVariant}
						showSwatches={showSwatches}
						locale={locale}
					/>
				</>
			) : null}
		</section>
	);
}

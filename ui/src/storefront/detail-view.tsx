import type { Product } from "@channel3/sdk/resources";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	ProductDetailsAttributes,
	ProductDetailsDescription,
	ProductDetailsGallery,
	ProductDetailsHeader,
	ProductDetailsOffers,
	ProductDetailsPriceHistory,
	ProductDetailsRecommendations,
	ProductDetailsRoot,
	ProductDetailsVariants,
} from "@/registry/default/components/product-details";
import type { VariantResolver } from "@/registry/default/hooks/use-variant-selection";
import { useVariantSelection } from "@/registry/default/hooks/use-variant-selection";
import { trackEvent } from "@/storefront/analytics";
import type { StorefrontBridge } from "@/storefront/bridge";
import { detailQueryOptions } from "@/storefront/detail-query";
import { ProductSaveRow } from "@/storefront/save-toggle";
import type { PriceFocusStats } from "@/storefront/types";
import type { SavedProducts } from "@/storefront/use-saved-products";

export interface DetailFocus {
	product: Product;
	priceStats?: PriceFocusStats;
}

export function DetailView({
	product: initialProduct,
	bridge,
	saved,
	onSelect,
	onBack,
	onFocusChange,
	locale,
}: {
	product: Product;
	bridge: StorefrontBridge;
	saved: SavedProducts;
	onSelect: (product: Product) => void;
	onBack?: () => void;
	onFocusChange?: (focus: DetailFocus) => void;
	locale?: string;
}) {
	const queryClient = useQueryClient();
	const details = useQuery(detailQueryOptions(bridge, initialProduct.id));
	const priceHistoryQuery = useQuery({
		queryKey: ["price-history", initialProduct.id],
		queryFn: () => bridge.getPriceHistory(initialProduct.id),
	});

	const base = details.data ?? initialProduct;
	const hydrating = details.isPending;
	const priceHistory = priceHistoryQuery.data;

	const resolveVariant = React.useCallback<VariantResolver>(
		({ product, value, selection }) => {
			const productId = value.product_id ?? product.id;
			const selectedOptions = value.product_id ? undefined : selection;
			return queryClient.fetchQuery(
				detailQueryOptions(
					bridge,
					productId,
					selectedOptions ? { selectedOptions } : undefined,
				),
			);
		},
		[bridge, queryClient],
	);

	const { product, selection, isResolving, select } = useVariantSelection({
		product: base,
		resolve: resolveVariant,
	});

	const stats = priceHistory?.statistics;
	React.useEffect(() => {
		onFocusChange?.({
			product,
			priceStats: stats
				? {
						currency: stats.currency,
						currentPrice: stats.current_price,
						minPrice: stats.min_price,
						maxPrice: stats.max_price,
						mean: stats.mean,
						status: stats.current_status,
					}
				: undefined,
		});
	}, [product, stats, onFocusChange]);

	const trackedViewRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (trackedViewRef.current === product.id) return;
		trackedViewRef.current = product.id;
		trackEvent("pdp_viewed", {
			product_id: product.id,
			title: product.title,
			brand: product.brands?.[0]?.name,
		});
	}, [product]);

	const fetchSimilar = React.useCallback(
		({ productId, limit }: { productId: string; limit: number }) =>
			bridge.getSimilar(productId, limit),
		[bridge],
	);

	const interceptLinks = (event: React.MouseEvent<HTMLDivElement>) => {
		const anchor = (event.target as HTMLElement).closest("a[href]");
		if (!anchor) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const url = anchor.getAttribute("href");
		if (url) {
			trackEvent("buy_link_clicked", {
				product_id: product.id,
				title: product.title,
				url,
			});
			void bridge.openLink(url);
		}
	};

	if (hydrating && !base.images?.length && !base.offers?.length) {
		return (
			<div className="flex flex-col gap-6 p-4" aria-busy="true">
				<Skeleton className="h-8 w-8 rounded-md" />
				<div className="grid gap-8 md:grid-cols-2">
					<Skeleton className="aspect-square w-full rounded-md" />
					<div className="flex flex-col gap-3">
						<Skeleton className="h-4 w-1/4" />
						<Skeleton className="h-7 w-4/5" />
						<Skeleton className="h-8 w-1/3" />
						<Skeleton className="h-12 w-full rounded-lg" />
						<Skeleton className="h-12 w-full rounded-lg" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-full flex-col gap-2 p-4 starting:opacity-0 transition-opacity duration-200 ease-out">
			{onBack ? (
				<div>
					<Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
						<ArrowLeft className="size-4" />
					</Button>
				</div>
			) : null}
			<div onClickCapture={interceptLinks} aria-busy={hydrating || isResolving}>
				<ProductDetailsRoot
					product={product}
					selection={selection}
					onSelectVariant={select}
					onOfferClick={(offer) => {
						trackEvent("buy_link_clicked", {
							product_id: product.id,
							title: product.title,
							url: offer.url,
							domain: offer.domain,
							price: offer.price.price,
							currency: offer.price.currency,
						});
						void bridge.openLink(offer.url);
					}}
					buyLinkRel="sponsored noopener noreferrer"
					priceHistory={priceHistory}
					isResolving={isResolving || hydrating}
					locale={locale}
					fetchSimilar={fetchSimilar}
					recommendations={{ showSwatches: false, eager: true, onSelect }}
				>
					<div className="flex flex-col gap-12">
						<div className="grid gap-8 md:grid-cols-2 md:items-start lg:gap-12">
							<ProductDetailsGallery className="self-start md:sticky md:top-4" />
							<div className="flex flex-col gap-6">
								<ProductDetailsHeader />
								<ProductDetailsVariants />
								<ProductSaveRow product={product} saved={saved} />
								<ProductDetailsOffers />
								<ProductDetailsDescription />
								<ProductDetailsAttributes />
								<ProductDetailsPriceHistory />
							</div>
						</div>
						<ProductDetailsRecommendations locale={locale} className="pb-4" />
					</div>
				</ProductDetailsRoot>
			</div>
		</div>
	);
}

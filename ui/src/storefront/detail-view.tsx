import type { ProductDetail } from "@channel3/sdk/resources";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChart } from "@/storefront/price-chart";
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
import type { StorefrontBridge } from "@/storefront/bridge";

export function DetailView({
	product: initialProduct,
	bridge,
	onSelect,
	onBack,
	locale,
}: {
	product: ProductDetail;
	bridge: StorefrontBridge;
	onSelect: (product: ProductDetail) => void;
	onBack?: () => void;
	locale?: string;
}) {
	const queryClient = useQueryClient();
	const details = useQuery({
		queryKey: ["details", initialProduct.id],
		queryFn: () => bridge.getProduct(initialProduct.id),
	});
	const priceHistoryQuery = useQuery({
		queryKey: ["price-history", initialProduct.id],
		queryFn: () => bridge.getPriceHistory(initialProduct.id),
	});

	const base = details.data ?? initialProduct;
	const hydrating = details.isPending;
	const priceHistory = priceHistoryQuery.data?.history ?? [];
	const showPriceHistory = Boolean(priceHistoryQuery.data?.statistics) || priceHistory.length > 0;

	const resolveVariant = React.useCallback<VariantResolver>(
		({ product, value }) => {
			const productId = value.product_id;
			return productId
				? queryClient.fetchQuery({
						queryKey: ["details", productId],
						queryFn: () => bridge.getProduct(productId),
					})
				: Promise.resolve(product);
		},
		[bridge, queryClient],
	);

	const { product, selection, isResolving, select } = useVariantSelection({
		product: base,
		resolve: resolveVariant,
	});

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
		<div className="flex min-h-full flex-col gap-2 p-4">
			{onBack ? (
				<div className="flex items-center">
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
					onOfferClick={(offer) => void bridge.openLink(offer.url)}
					buyLinkRel="sponsored noopener noreferrer"
					priceHistory={priceHistoryQuery.data}
					isResolving={isResolving || hydrating}
					locale={locale}
					fetchSimilar={fetchSimilar}
					recommendations={{ showSwatches: false, onSelect }}
				>
					<div className="flex flex-col gap-12">
						<div className="grid gap-8 md:grid-cols-2 md:items-start lg:gap-12">
							<ProductDetailsGallery className="self-start md:sticky md:top-4" />
							<div className="flex flex-col gap-6">
								<ProductDetailsHeader />
								<ProductDetailsVariants />
								<ProductDetailsOffers />
								<ProductDetailsDescription />
								<ProductDetailsAttributes />
								{showPriceHistory ? (
									<>
										<Separator />
										<ProductDetailsPriceHistory>
											{priceHistory.length > 0 ? (
												<PriceChart
													history={priceHistory}
													locale={locale}
												/>
											) : null}
										</ProductDetailsPriceHistory>
									</>
								) : null}
							</div>
						</div>
						<ProductDetailsRecommendations locale={locale} className="pb-4" />
					</div>
				</ProductDetailsRoot>
			</div>
		</div>
	);
}

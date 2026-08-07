import type { ProductDetail } from "@channel3/sdk/resources";
import { ArrowRight, Bookmark } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
	wheelGesturesPlugin,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { ProductCard, ProductCardSkeleton } from "@/registry/default/components/product-card";
import { ProductSaveToggle } from "@/storefront/save-toggle";
import type { SavedProducts } from "@/storefront/use-saved-products";

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

const CARD_BASIS = "basis-60 sm:basis-64";
const MAX_INLINE_PRODUCTS = 8;

export function InlineSearchSkeleton() {
	return (
		<div className="flex gap-4 overflow-hidden">
			{SKELETON_KEYS.map((key) => (
				<ProductCardSkeleton key={key} className={cn(CARD_BASIS, "shrink-0")} />
			))}
		</div>
	);
}

export function InlineError({ message }: { message: string }) {
	return (
		<div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
			<p className="mb-1 font-medium text-foreground">That didn't work.</p>
			<p className="mb-2 text-xs opacity-80">{message}</p>
			<p className="text-xs">Ask again in the chat to retry.</p>
		</div>
	);
}

export function InlineResults({
	products,
	saved,
	onSelect,
	onBrowseAll,
	onShowSaved,
	onPrefetchProduct,
	locale,
}: {
	products: ProductDetail[];
	saved: SavedProducts;
	onSelect: (product: ProductDetail) => void;
	onBrowseAll: () => void;
	onShowSaved: () => void;
	onPrefetchProduct?: (product: ProductDetail) => void;
	locale?: string;
}) {
	const [bumpKey, setBumpKey] = React.useState(0);
	const prevCountRef = React.useRef(saved.count);
	React.useEffect(() => {
		if (saved.count > prevCountRef.current) {
			setBumpKey((key) => key + 1);
		}
		prevCountRef.current = saved.count;
	}, [saved.count]);

	return (
		<div className="flex flex-col gap-3 starting:opacity-0 transition-opacity duration-200 ease-out">
			<div className="flex items-center justify-end gap-2">
				{saved.count > 0 ? (
					<button
						type="button"
						onClick={onShowSaved}
						aria-label={`Show saved products (${saved.count})`}
						className="relative flex items-center gap-1 p-1 text-muted-foreground text-sm transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-foreground"
					>
						<Bookmark className="size-4 fill-current" />
						<span
							key={bumpKey}
							className={cn("tabular-nums", bumpKey > 0 && "animate-count-bump")}
						>
							{saved.count}
						</span>
					</button>
				) : null}
				<Button variant="outline" size="sm" onClick={onBrowseAll}>
					Shop all
					<ArrowRight className="size-4" />
				</Button>
			</div>
			<Carousel opts={{ align: "start", dragFree: true }} plugins={[wheelGesturesPlugin]}>
				<CarouselContent>
					{products.slice(0, MAX_INLINE_PRODUCTS).map((product, index) => (
						<CarouselItem key={product.id} className={CARD_BASIS}>
							<div className="relative h-full">
								<ProductCard
									product={product}
									onSelect={onSelect}
									onPreload={onPrefetchProduct}
									showSwatches={false}
									priority={index < 4}
									locale={locale}
								/>
								<ProductSaveToggle product={product} saved={saved} />
							</div>
						</CarouselItem>
					))}
				</CarouselContent>
				<CarouselPrevious className="left-1 bg-background/80" />
				<CarouselNext className="right-1 bg-background/80" />
			</Carousel>
		</div>
	);
}

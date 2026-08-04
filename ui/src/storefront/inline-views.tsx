import type { ProductDetail } from "@channel3/sdk/resources";
import { ArrowRight } from "lucide-react";

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
		<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
			<p className="mb-1 font-medium text-foreground">That didn't work.</p>
			<p className="mb-2 text-xs opacity-80">{message}</p>
			<p className="text-xs">Ask again in the chat to retry.</p>
		</div>
	);
}

export function InlineResults({
	products,
	onSelect,
	onBrowseAll,
	onPrefetchProduct,
	locale,
}: {
	products: ProductDetail[];
	onSelect: (product: ProductDetail) => void;
	onBrowseAll: () => void;
	onPrefetchProduct?: (product: ProductDetail) => void;
	locale?: string;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-end">
				<Button variant="outline" size="sm" onClick={onBrowseAll}>
					Shop all
					<ArrowRight className="size-4" />
				</Button>
			</div>
			<Carousel opts={{ align: "start", dragFree: true }} plugins={[wheelGesturesPlugin]}>
				<CarouselContent>
					{products.slice(0, MAX_INLINE_PRODUCTS).map((product, index) => (
						<CarouselItem key={product.id} className={CARD_BASIS}>
							<ProductCard
								product={product}
								onSelect={onSelect}
								onPreload={onPrefetchProduct}
								showSwatches={false}
								priority={index < 4}
								locale={locale}
							/>
						</CarouselItem>
					))}
				</CarouselContent>
				<CarouselPrevious className="left-1 bg-background/80" />
				<CarouselNext className="right-1 bg-background/80" />
			</Carousel>
		</div>
	);
}

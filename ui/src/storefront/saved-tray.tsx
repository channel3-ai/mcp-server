import type { ProductDetail } from "@channel3/sdk/resources";
import { PanelRightClose, Scale } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPrice, leadOffer } from "@shared/format";
import type { SavedItem, SavedProducts } from "@/storefront/use-saved-products";

const SavedRow = React.memo(function SavedRow({
	item,
	onSelect,
}: {
	item: SavedItem;
	onSelect: (product: ProductDetail) => void;
}) {
	const offer = item.product ? leadOffer(item.product.offers) : null;
	const productBrands = item.product?.brands?.map((brand) => brand.name);
	const brands = productBrands?.length ? productBrands : item.entry.brands;
	return (
		<li>
			<button
				type="button"
				disabled={!item.product}
				onClick={() => item.product && onSelect(item.product)}
				className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors enabled:hover:bg-muted disabled:opacity-60"
			>
				{item.entry.imageUrl ? (
					<img
						src={item.entry.imageUrl}
						alt=""
						className="size-11 shrink-0 rounded-md border bg-muted object-cover"
					/>
				) : (
					<div className="size-11 shrink-0 rounded-md border bg-muted" />
				)}
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm">{item.entry.title}</p>
					{brands?.length ? (
						<p className="truncate text-xs text-muted-foreground">
							{brands.join(", ")}
						</p>
					) : null}
					{item.status === "pending" ? (
						<Skeleton className="mt-1 h-3 w-14" />
					) : item.status === "unavailable" ? (
						<p className="text-xs text-muted-foreground">Unavailable</p>
					) : offer?.price ? (
						<p className="text-xs text-muted-foreground">{formatPrice(offer.price)}</p>
					) : null}
				</div>
			</button>
		</li>
	);
});

export function SavedTray({
	saved,
	open,
	onSelect,
	onCompare,
	onClose,
}: {
	saved: SavedProducts;
	open: boolean;
	onSelect: (product: ProductDetail) => void;
	onCompare: () => void;
	onClose: () => void;
}) {
	return (
		<aside
			inert={!open}
			className={cn(
				"min-h-0 overflow-hidden bg-background",
				"absolute inset-y-0 right-0 z-30 w-full transition-transform duration-300 ease-drawer",
				open ? "translate-x-0" : "translate-x-full",
				"sm:static sm:inset-auto sm:z-auto sm:translate-x-0 sm:shrink-0 sm:transition-[width,opacity] sm:duration-300 sm:ease-drawer",
				open ? "sm:w-64 sm:border-l sm:opacity-100" : "sm:w-0 sm:opacity-0",
			)}
		>
			<div className="flex h-full min-h-0 w-full flex-col sm:w-64">
				<div className="flex items-center gap-2 border-b px-4 py-3">
					<h2 className="min-w-0 flex-1 truncate text-sm font-medium">
						Saved ({saved.count})
					</h2>
					<Button
						variant="outline"
						size="sm"
						disabled={saved.count < 2}
						title={
							saved.count < 2 ? "Save at least two products to compare" : undefined
						}
						onClick={onCompare}
					>
						<Scale className="size-4" />
						Compare
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Close saved"
						onClick={onClose}
					>
						<PanelRightClose className="size-4" />
					</Button>
				</div>
				{saved.count === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-muted-foreground">
						Nothing saved yet. Tap the bookmark on any product to keep it here.
					</p>
				) : (
					<ul className="scrollbar-hidden min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
						{saved.items.map((item) => (
							<SavedRow key={item.entry.id} item={item} onSelect={onSelect} />
						))}
					</ul>
				)}
			</div>
		</aside>
	);
}

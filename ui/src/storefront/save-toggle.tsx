import type { ProductDetail } from "@channel3/sdk/resources";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAVED_CAP } from "@/storefront/saved-store";
import type { SavedProducts } from "@/storefront/use-saved-products";

export function SaveToggle({
	saved,
	canSave,
	onToggle,
	className,
}: {
	saved: boolean;
	canSave: boolean;
	onToggle: () => void;
	className?: string;
}) {
	const disabled = !saved && !canSave;
	const label = saved ? "Remove from saved" : "Save product";
	return (
		<Button
			variant="secondary"
			size="icon"
			aria-pressed={saved}
			aria-label={label}
			title={disabled ? `Saved list is full (${SAVED_CAP})` : label}
			disabled={disabled}
			className={cn(
				"relative size-9 rounded-full bg-background/90 shadow-sm before:absolute before:-inset-1 before:content-['']",
				className,
			)}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			{saved ? (
				<Bookmark className="size-4 fill-current text-primary" />
			) : (
				<Bookmark className="size-4" />
			)}
		</Button>
	);
}

export function ProductSaveToggle({
	product,
	saved,
	className,
}: {
	product: ProductDetail;
	saved: SavedProducts;
	className?: string;
}) {
	return (
		<SaveToggle
			saved={saved.isSaved(product.id)}
			canSave={saved.canSave}
			onToggle={() => saved.toggle(product)}
			className={cn("absolute top-2 left-2 z-10", className)}
		/>
	);
}

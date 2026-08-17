import type { Product } from "@channel3/sdk/resources";
import { Bookmark } from "lucide-react";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAVED_CAP } from "@/storefront/saved-store";
import type { SavedProducts } from "@/storefront/use-saved-products";

interface SaveControlProps {
	saved: boolean;
	canSave: boolean;
	onToggle: () => void;
	className?: string;
}

function saveControl({ saved, canSave, onToggle }: SaveControlProps) {
	const disabled = !saved && !canSave;
	const capTitle = disabled ? `Saved list is full (${SAVED_CAP})` : undefined;
	const onClick = (event: MouseEvent) => {
		event.stopPropagation();
		onToggle();
	};
	return { disabled, capTitle, onClick };
}

function SaveBookmarkIcon({ saved }: { saved: boolean }) {
	return (
		<Bookmark
			key={saved ? "saved" : "unsaved"}
			className={cn(
				"size-4",
				saved ? "animate-save-pop fill-current text-primary" : "text-muted-foreground",
			)}
		/>
	);
}

export function SaveToggle(props: SaveControlProps) {
	const { saved, className } = props;
	const { disabled, capTitle, onClick } = saveControl(props);
	const label = saved ? "Remove from saved" : "Save product";
	return (
		<Button
			variant="secondary"
			size="icon"
			aria-pressed={saved}
			aria-label={label}
			title={capTitle ?? label}
			disabled={disabled}
			className={cn(
				"relative size-9 rounded-full border border-border bg-background shadow-md before:absolute before:-inset-1 before:content-[''] hoverable:hover:scale-105",
				saved && "border-primary/50",
				className,
			)}
			onClick={onClick}
		>
			<SaveBookmarkIcon saved={saved} />
		</Button>
	);
}

export function SaveRow(props: SaveControlProps) {
	const { saved, className } = props;
	const { disabled, capTitle, onClick } = saveControl(props);
	return (
		<Button
			variant="ghost"
			type="button"
			aria-pressed={saved}
			title={capTitle}
			disabled={disabled}
			className={cn(
				"h-auto w-full rounded-lg border p-3 hover:bg-muted/50 dark:hover:bg-muted/50",
				saved ? "border-primary/40 text-primary hover:text-primary" : "text-foreground",
				className,
			)}
			onClick={onClick}
		>
			<SaveBookmarkIcon saved={saved} />
			{saved ? "Saved" : "Save"}
		</Button>
	);
}

export function ProductSaveToggle({
	product,
	saved,
	className,
}: {
	product: Product;
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

export function ProductSaveRow({
	product,
	saved,
	className,
}: {
	product: Product;
	saved: SavedProducts;
	className?: string;
}) {
	return (
		<SaveRow
			saved={saved.isSaved(product.id)}
			canSave={saved.canSave}
			onToggle={() => saved.toggle(product)}
			className={className}
		/>
	);
}

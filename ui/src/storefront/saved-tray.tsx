import type { Product } from "@channel3/sdk/resources";
import { ArrowLeftRight, PanelRightClose, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDomain, formatPrice, leadOffer } from "@/registry/default/lib/format";
import type { SavedItem, SavedProducts } from "@/storefront/use-saved-products";

const SavedRow = React.memo(function SavedRow({
	item,
	highlighted,
	onSelect,
	onRemove,
}: {
	item: SavedItem;
	highlighted: boolean;
	onSelect: (product: Product) => void;
	onRemove: (id: string) => void;
}) {
	const offer = item.product ? leadOffer(item.product.offers) : null;
	const offerCount = item.product?.offers?.length ?? 0;
	const productBrands = item.product?.brands?.map((brand) => brand.name);
	const brands = productBrands?.length ? productBrands : item.entry.brands;
	return (
		<li className="relative">
			<button
				type="button"
				disabled={!item.product}
				onClick={() => item.product && onSelect(item.product)}
				className={cn(
					"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 pr-9 text-left transition-colors enabled:hover:bg-muted disabled:opacity-60",
					highlighted && "animate-highlight-fade",
				)}
			>
				{item.entry.imageUrl ? (
					<img
						src={item.entry.imageUrl}
						alt=""
						className="size-16 shrink-0 rounded-md border bg-muted object-cover"
					/>
				) : (
					<div className="size-16 shrink-0 rounded-md border bg-muted" />
				)}
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-sm leading-snug">{item.entry.title}</p>
					{brands?.length ? (
						<p className="truncate text-muted-foreground text-xs">
							{brands.join(", ")}
						</p>
					) : null}
					{item.status === "pending" ? (
						<Skeleton className="mt-1 h-3 w-14" />
					) : item.status === "unavailable" ? (
						<p className="mt-0.5 text-muted-foreground text-xs">Unavailable</p>
					) : offer?.price ? (
						<p className="mt-0.5 truncate text-muted-foreground text-xs">
							<span className="font-medium text-foreground">
								{formatPrice(offer.price)}
							</span>
							{` · ${formatDomain(offer.domain)}`}
							{offerCount > 1
								? ` + ${offerCount - 1} other${offerCount > 2 ? "s" : ""}`
								: null}
						</p>
					) : null}
				</div>
			</button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={`Remove ${item.entry.title} from saved`}
				title="Remove from saved"
				onClick={() => onRemove(item.entry.id)}
				className="absolute top-1 right-1 text-muted-foreground"
			>
				<X className="size-4" />
			</Button>
		</li>
	);
});

const HIGHLIGHT_RECENT_MS = 3_000;

export function SavedTray({
	saved,
	open,
	onSelect,
	onCompare,
	onClose,
}: {
	saved: SavedProducts;
	open: boolean;
	onSelect: (product: Product) => void;
	onCompare: () => void;
	onClose: () => void;
}) {
	const [hasOpened, setHasOpened] = React.useState(false);
	React.useEffect(() => {
		if (open) {
			setHasOpened(true);
		}
	}, [open]);

	React.useEffect(() => {
		if (!open) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	const [highlightId, setHighlightId] = React.useState<string | null>(null);
	const lastAdded = saved.lastAdded;
	React.useEffect(() => {
		if (!lastAdded) {
			return;
		}
		const remaining = HIGHLIGHT_RECENT_MS - (Date.now() - lastAdded.at);
		if (remaining <= 0) {
			return;
		}
		setHighlightId(lastAdded.id);
		const timer = setTimeout(() => setHighlightId(null), remaining);
		return () => clearTimeout(timer);
	}, [lastAdded]);

	const listRef = React.useRef<HTMLUListElement>(null);
	React.useEffect(() => {
		if (open && highlightId) {
			listRef.current?.scrollTo({ top: 0 });
		}
	}, [open, highlightId]);

	return (
		<>
			<button
				type="button"
				inert={!open}
				aria-label="Close saved products"
				onClick={onClose}
				className={cn(
					"absolute inset-0 z-20 bg-foreground/15 transition-opacity duration-300 ease-out",
					open ? "opacity-100" : "opacity-0",
				)}
			/>
			<aside
				inert={!open}
				className={cn(
					"absolute inset-y-0 right-0 z-30 w-full border-l bg-background shadow-2xl transition-transform duration-300 ease-drawer sm:w-96",
					open ? "translate-x-0" : "translate-x-full",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex items-center gap-2 border-b px-4 py-3">
						<h2 className="min-w-0 flex-1 truncate font-medium text-sm">
							Saved ({saved.count})
						</h2>
						<Button
							variant="ghost"
							size="sm"
							disabled={saved.count < 2}
							title={
								saved.count < 2
									? "Save at least two products to compare"
									: `Ask the assistant to compare all ${saved.count} saved products`
							}
							onClick={onCompare}
						>
							<ArrowLeftRight className="size-4" />
							{saved.count >= 2 ? `Compare ${saved.count}` : "Compare"}
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
						<p className="px-4 py-6 text-center text-muted-foreground text-sm">
							Nothing saved yet. Tap the bookmark on any product to keep it here.
						</p>
					) : hasOpened ? (
						<ul
							ref={listRef}
							className="scrollbar-hidden min-h-0 flex-1 space-y-1 overflow-y-auto p-2 pb-[calc(3rem+var(--inset-bottom,0px))]"
						>
							{saved.items.map((item) => (
								<SavedRow
									key={item.entry.id}
									item={item}
									highlighted={item.entry.id === highlightId}
									onSelect={onSelect}
									onRemove={saved.remove}
								/>
							))}
						</ul>
					) : null}
				</div>
			</aside>
		</>
	);
}

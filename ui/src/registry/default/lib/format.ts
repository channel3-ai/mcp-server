import type {
	AvailabilityStatus,
	Price,
	ProductImage,
	ProductOffer,
} from "@channel3/sdk/resources";
import { isInStock } from "@shared/format";

// Lead-offer selection and price formatting are shared with the worker (tool
// summaries quote the same "best price" the cards show); re-exported here so
// kit components keep a single import home.
export { currencyFormatter, formatCurrency, formatPrice, isInStock, leadOffer } from "@shared/format";

/** True when the price carries a higher pre-discount `compare_at_price`. */
export function isOnSale(price: Price): boolean {
	return typeof price.compare_at_price === "number" && price.compare_at_price > price.price;
}

/**
 * Whole-number discount percentage derived from `compare_at_price`, or `null`
 * when the item isn't discounted.
 */
export function discountPercent(price: Price): number | null {
	if (!isOnSale(price) || !price.compare_at_price) {
		return null;
	}
	return Math.round(((price.compare_at_price - price.price) / price.compare_at_price) * 100);
}

/** Strip protocol and a leading `www.` from a retailer domain for display. */
export function formatDomain(domain: string): string {
	return domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
	InStock: "In stock",
	LimitedAvailability: "Limited availability",
	PreOrder: "Pre-order",
	BackOrder: "Back-order",
	SoldOut: "Sold out",
	OutOfStock: "Out of stock",
	Discontinued: "Discontinued",
	Unknown: "Unavailable",
};

/** Human-readable label for an availability status. */
export function availabilityLabel(status: AvailabilityStatus): string {
	return AVAILABILITY_LABELS[status];
}

/** API cleaned square lives on `cleaned_url`. */
type Image = ProductImage & { cleaned_url?: string | null };

export function preferCleanedImages(images: ReadonlyArray<Image> | undefined): ProductImage[] {
	if (!images?.length) {
		return [];
	}
	return images.map((image) =>
		image.cleaned_url ? { ...image, url: image.cleaned_url } : image,
	);
}

/**
 * Pick the best image to show for a product.
 *
 * `preferCleaned` favors cleaned shots (square, uniform background) for
 * grid/card contexts; otherwise the main image (or first image) wins.
 */
export function pickImage(
	images: ReadonlyArray<Image> | undefined,
	{ preferCleaned = false }: { preferCleaned?: boolean } = {},
): ProductImage | undefined {
	if (!images?.length) {
		return undefined;
	}
	if (preferCleaned) {
		const cleaned = images.find((image) => image.cleaned_url || image.is_cleaned_image);
		if (cleaned) {
			return cleaned.cleaned_url ? { ...cleaned, url: cleaned.cleaned_url } : cleaned;
		}
	}
	return images.find((image) => image.is_main_image) ?? images[0];
}

/**
 * Hover/secondary image priority: a contextual shot (product worn or in use)
 * makes a far more compelling crossfade than another clean studio angle. Shot
 * types are tried in this order, then any remaining image.
 */
const HOVER_SHOT_PRIORITY: ReadonlyArray<NonNullable<ProductImage["shot_type"]>> = [
	"on_model",
	"lifestyle",
	"in_use",
	"flat_lay",
	"angle_view",
];

function withCleanedDisplayUrl(image: Image): ProductImage {
	return image.cleaned_url ? { ...image, url: image.cleaned_url } : image;
}

function isSameDisplay(image: Image, excludeUrl: string | undefined): boolean {
	return (
		excludeUrl != null && (image.url === excludeUrl || image.cleaned_url === excludeUrl)
	);
}

/**
 * Pick the best image to crossfade to on hover, preferring contextual shots
 * (see {@link HOVER_SHOT_PRIORITY}). Returns `undefined` only when there is no
 * other image at all.
 *
 * `excludeUrl` is the primary image's display URL; an image is excluded when
 * either its raw `url` or its `cleaned_url` matches, so the hover never
 * crossfades to the uncleaned twin of a cleaned primary (or vice versa).
 */
export function pickHoverImage(
	images: ReadonlyArray<Image> | undefined,
	{ excludeUrl }: { excludeUrl?: string } = {},
): ProductImage | undefined {
	if (!images || images.length === 0) {
		return undefined;
	}
	const candidates = images.filter((image) => !isSameDisplay(image, excludeUrl));
	if (candidates.length === 0) {
		return undefined;
	}
	for (const shot of HOVER_SHOT_PRIORITY) {
		const match = candidates.find((image) => image.shot_type === shot);
		if (match) {
			return withCleanedDisplayUrl(match);
		}
	}
	return withCleanedDisplayUrl(candidates[0]);
}

/** True when offers exist but none are in stock. */
export function isSoldOut(offers: ReadonlyArray<ProductOffer> | undefined): boolean {
	return Boolean(offers && offers.length > 0 && !offers.some((o) => isInStock(o.availability)));
}

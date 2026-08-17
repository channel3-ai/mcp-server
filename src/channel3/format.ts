import { formatCurrency, leadOffer } from "../../shared/format";
import type { Product, ProductOffer } from "@channel3/sdk/resources";

const CDN_IMAGE_PREFIX = "https://cdn.trychannel3.com/";

type ProductImage = {
	url: string;
	cleaned_url?: string | null;
	is_main_image?: boolean;
};

function isCdnImage(image: { url: string }): boolean {
	return image.url.startsWith(CDN_IMAGE_PREFIX);
}

function cdnImages<T extends { url: string }>(images: T[] | undefined): T[] | undefined {
	return images?.filter(isCdnImage);
}

function withCleanedDisplayUrl(image: ProductImage): ProductImage {
	return image.cleaned_url ? { ...image, url: image.cleaned_url } : image;
}

function summaryImages(product: Product): ProductImage[] {
	const images = cdnImages(product.images as ProductImage[] | undefined);
	if (!images?.length) {
		return [];
	}
	const primarySource =
		images.find((image) => image.cleaned_url != null) ??
		images.find((image) => image.is_main_image) ??
		images[0];
	const primary = withCleanedDisplayUrl(primarySource);
	const second = images.find(
		(image) =>
			image !== primarySource &&
			image.url !== primary.url &&
			image.cleaned_url !== primary.url,
	);
	return second ? [primary, withCleanedDisplayUrl(second)] : [primary];
}

export function formatOffer(offer: ProductOffer) {
	const { max_commission_rate, ...rest } = offer;
	return rest;
}

export function formatOffers(offers: ProductOffer[] | undefined) {
	return (offers ?? []).map(formatOffer);
}

export function formatProductSummary(product: Product) {
	return {
		id: product.id,
		title: product.title,
		brands: product.brands,
		images: summaryImages(product),
		offers: formatOffers(product.offers),
	};
}

export function toPublicProduct(product: Product): Product {
	return { ...product, images: cdnImages(product.images), offers: formatOffers(product.offers) };
}

export function formatProductDetail(product: Product): Product {
	const stripped = toPublicProduct(product);
	return {
		...stripped,
		images: stripped.images?.slice(0, 5),
		description: product.description,
	};
}

export type ProductSummary = ReturnType<typeof formatProductSummary>;

type AnchorProduct = {
	id: string;
	title: string;
	brands?: { name: string }[] | null;
	offers?: Pick<ProductOffer, "availability" | "domain" | "price">[] | null;
};

export function productAnchorLine(product: AnchorProduct): string {
	const best = leadOffer(product.offers);
	const parts = [`"${product.title}"`];
	const brands = (product.brands ?? []).map((b) => b.name).join(", ");
	if (brands) {
		parts.push(brands);
	}
	if (best) {
		parts.push(`${formatCurrency(best.price.price, best.price.currency)} at ${best.domain}`);
	}
	return `- ${parts.join(" — ")} [id: ${product.id}]`;
}

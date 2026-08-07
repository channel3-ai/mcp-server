import { formatCurrency, leadOffer } from "../../shared/format";
import type { ProductDetail, ProductOffer } from "./client";

const CDN_IMAGE_PREFIX = "https://cdn.trychannel3.com/";

type ProductImage = {
	url: string;
	cleaned_url?: string | null;
	is_cleaned_image?: boolean;
	is_main_image?: boolean;
};

function isCdnImage(image: { url: string }): boolean {
	return image.url.startsWith(CDN_IMAGE_PREFIX);
}

function cdnImages<T extends { url: string }>(images: T[] | undefined): T[] | undefined {
	return images?.filter(isCdnImage);
}


function summaryImage(product: ProductDetail): ProductImage | undefined {
	const images = cdnImages(product.images as ProductImage[] | undefined);
	if (!images?.length) {
		return undefined;
	}
	const cleaned = images.find((image) => image.cleaned_url || image.is_cleaned_image);
	if (cleaned) {
		return cleaned.cleaned_url ? { ...cleaned, url: cleaned.cleaned_url } : cleaned;
	}
	return images.find((image) => image.is_main_image) ?? images[0];
}

export function formatOffer(offer: ProductOffer) {
	const { max_commission_rate, ...rest } = offer;
	return rest;
}

export function formatOffers(offers: ProductOffer[] | undefined) {
	return (offers ?? []).map(formatOffer);
}

export function formatProductSummary(product: ProductDetail) {
	const image = summaryImage(product);
	return {
		id: product.id,
		title: product.title,
		brands: product.brands,
		images: image ? [image] : [],
		offers: formatOffers(product.offers),
	};
}

export function toPublicProduct(product: ProductDetail): ProductDetail {
	return { ...product, images: cdnImages(product.images), offers: formatOffers(product.offers) };
}

export function formatProductDetail(product: ProductDetail): ProductDetail {
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

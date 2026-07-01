import type { ProductDetail, ProductOffer } from "./client";

function mainImageUrl(product: ProductDetail): string | undefined {
	return product.images?.find((i) => i.is_main_image)?.url ?? product.images?.[0]?.url;
}

// `max_commission_rate` is a developer field; strip it from user-facing output.
export function formatOffer(offer: ProductOffer) {
	const { max_commission_rate, ...rest } = offer;
	return rest;
}

export function formatProductSummary(product: ProductDetail) {
	return {
		id: product.id,
		title: product.title,
		brand: product.brands?.map((b) => b.name).join(", "),
		category: product.category?.title,
		gender: product.gender,
		age: product.age,
		image: mainImageUrl(product),
		structured_attributes: product.structured_attributes,
		offers: (product.offers ?? []).map(formatOffer),
		description: product.description?.slice(0, 280),
	};
}

export function formatProductDetail(product: ProductDetail) {
	const main = mainImageUrl(product);
	const others =
		product.images
			?.filter((i) => !i.is_main_image)
			.slice(0, 4)
			.map((i) => i.url) ?? [];
	const { images: _images, offers: _offers, ...rest } = product;
	return {
		...rest,
		images: main ? [main, ...others] : others,
		offers: (product.offers ?? []).map(formatOffer),
	};
}

export type ProductSummary = ReturnType<typeof formatProductSummary>;
export type ProductDetailFormatted = ReturnType<typeof formatProductDetail>;

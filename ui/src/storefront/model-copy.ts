import type { ProductDetail } from "@channel3/sdk/resources";
import { formatCurrency, leadOffer } from "@shared/format";

import type { ModelContextSync, SyncedProduct } from "@/storefront/types";

type SyncSource = Pick<ProductDetail, "id" | "title" | "brands" | "offers">;

export function toSyncedProduct(product: SyncSource): SyncedProduct {
	const best = leadOffer(product.offers);
	return {
		id: product.id,
		title: product.title,
		brand: product.brands?.[0]?.name,
		price: best
			? {
					amount: best.price.price,
					currency: best.price.currency,
					compareAt: best.price.compare_at_price,
				}
			: undefined,
		offerCount: product.offers?.length ?? 0,
	};
}

function productLine(product: SyncedProduct, position: number): string {
	const parts = [`"${product.title}"`];
	if (product.brand) {
		parts.push(product.brand);
	}
	if (product.price) {
		const price = formatCurrency(product.price.amount, product.price.currency);
		const was =
			product.price.compareAt != null && product.price.compareAt > product.price.amount
				? ` (was ${formatCurrency(product.price.compareAt, product.price.currency)})`
				: "";
		parts.push(`${price}${was}`);
	}
	parts.push(`${product.offerCount} offer${product.offerCount === 1 ? "" : "s"}`);
	return `${position}. ${parts.join(" — ")} [id: ${product.id}]`;
}

export function contextMarkdown({ viewing }: ModelContextSync): string {
	switch (viewing?.kind) {
		case "product":
			return [
				`The shopper is viewing the product page for "${viewing.title}"${viewing.brand ? ` (${viewing.brand})` : ""} [id: ${viewing.id}].`,
				"Images, description, offers, and the 30-day price history are visible on their screen — reference them, don't restate them.",
				"",
				"Call get_products with that id for full details.",
			].join("\n");
		case "search": {
			const what = viewing.query
				? ` for "${viewing.query}"`
				: viewing.imageUrl
					? " by image"
					: "";
			return [
				`The shopper is browsing ${viewing.products.length} product cards${what}; each card already shows the image, title, brand, and price, so don't re-list them in chat. Everything they have scrolled to so far:`,
				"",
				...viewing.products.map((product, index) => productLine(product, index + 1)),
				"",
				"Call get_products with any product id for full offers, descriptions, and attributes.",
			].join("\n");
		}
		case undefined:
			return "The shopper has the storefront open with no products in view.";
		default: {
			const exhaustive: never = viewing;
			return exhaustive;
		}
	}
}

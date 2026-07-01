import type { Channel3Client, ProductDetail } from "./client";

const URL_PATTERN = /^https?:\/\//i;

export function isUrl(input: string): boolean {
	return URL_PATTERN.test(input.trim());
}

/** Extract a Channel3 product ID from a trychannel3.com buy link or product page URL, else null. */
export function extractChannel3ProductId(input: string): string | null {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}

	const host = url.hostname.toLowerCase();

	if (host === "buy.trychannel3.com") {
		const segment = url.pathname.split("/").filter(Boolean)[0];
		if (!segment) return null;
		const id = segment.split("-")[0];
		return id || null;
	}

	if (host === "trychannel3.com" || host === "www.trychannel3.com") {
		const parts = url.pathname.split("/").filter(Boolean);
		if (parts[0] === "products" && parts[1]) {
			return parts[1];
		}
		return null;
	}

	return null;
}

/** Resolve a product ID or URL to a full product detail. */
export async function resolveProductDetail(
	client: Channel3Client,
	input: string,
): Promise<ProductDetail> {
	if (isUrl(input)) {
		const channelId = extractChannel3ProductId(input);
		if (channelId) {
			return client.products.retrieve(channelId);
		}
		const response = await client.products.lookup({ url: input.trim() });
		return response.product;
	}
	return client.products.retrieve(input);
}

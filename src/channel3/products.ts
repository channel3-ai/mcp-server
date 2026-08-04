import type { z } from "zod";

import type { GetProductsRequestSchema, SearchRequestSchema } from "../schemas";
import { type Channel3Client, createClient, type ProductDetail } from "./client";
import { formatProductDetail, formatProductSummary, type ProductSummary } from "./format";
import { resolveProductDetail } from "./resolve";

export interface SearchPageInput {
	query?: string;
	image_url?: string;
	page_token?: string;
	limit: number;
}

export function searchProductsPage(client: Channel3Client, params: SearchPageInput) {
	return client.products.search({
		query: params.query,
		image_url: params.image_url,
		page_token: params.page_token,
		filters: { availability: ["InStock"] },
		limit: params.limit,
		config: { mode: "agentic" },
	});
}

export function findSimilarProductsPage(
	client: Channel3Client,
	params: { product_id: string; limit: number },
) {
	return client.products.findSimilar({
		product_id: params.product_id,
		limit: params.limit,
		filters: { availability: ["InStock"] },
	});
}

export function combineSearchQueries(queries: readonly string[] | undefined): string | undefined {
	const normalized = queries?.map((query) => query.trim()).filter(Boolean) ?? [];
	return normalized.length > 0 ? normalized.join(" or ") : undefined;
}

export async function searchProducts(
	apiKey: string,
	params: z.infer<typeof SearchRequestSchema>,
	baseURL?: string,
): Promise<{ products: ProductSummary[]; next_page_token: string | null }> {
	const page = await searchProductsPage(createClient(apiKey, baseURL), {
		query: combineSearchQueries(params.queries),
		image_url: params.image_url,
		limit: 8,
	});
	return {
		products: page.products.map(formatProductSummary),
		next_page_token: page.next_page_token,
	};
}

export async function getProducts(
	apiKey: string,
	params: z.infer<typeof GetProductsRequestSchema>,
	baseURL?: string,
): Promise<{ products: ProductDetail[]; unresolved?: string[] }> {
	const client = createClient(apiKey, baseURL);
	const results = await Promise.allSettled(
		params.product_ids.map((id) => resolveProductDetail(client, id)),
	);
	const products = results
		.filter(
			(result): result is PromiseFulfilledResult<ProductDetail> =>
				result.status === "fulfilled",
		)
		.map((result) => formatProductDetail(result.value));
	if (products.length === 0) {
		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		const reason = rejected[0]?.reason;
		throw reason instanceof Error ? reason : new Error(String(reason));
	}
	const unresolved = params.product_ids.filter(
		(_, index) => results[index].status === "rejected",
	);
	return unresolved.length > 0 ? { products, unresolved } : { products };
}

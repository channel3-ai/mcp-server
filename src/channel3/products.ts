import type { z } from "zod";

import type { GetProductRequestSchema, SearchRequestSchema } from "../schemas";
import { createClient } from "./client";
import {
	formatProductDetail,
	formatProductSummary,
	type ProductDetailFormatted,
	type ProductSummary,
} from "./format";
import { resolveProductDetail } from "./resolve";

export async function searchProducts(
	apiKey: string,
	params: z.infer<typeof SearchRequestSchema>,
	baseURL?: string,
): Promise<ProductSummary[]> {
	const client = createClient(apiKey, baseURL);

	const page = await client.products.search({
		query: params.query,
		image_url: params.image_url,
		limit: 10,
		config: { mode: "agentic" },
	});

	return page.products.map(formatProductSummary);
}

export async function getProduct(
	apiKey: string,
	params: z.infer<typeof GetProductRequestSchema>,
	baseURL?: string,
): Promise<ProductDetailFormatted> {
	const client = createClient(apiKey, baseURL);
	const product = await resolveProductDetail(client, params.product_id);
	return formatProductDetail(product);
}

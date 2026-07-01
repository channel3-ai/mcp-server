import type { z } from "zod";

import type { GetProductRequestSchema, SearchRequestSchema } from "../schemas";
import type { SearchConfig } from "./client";
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

	// `mode` is not yet typed on SearchConfig in the SDK; cast to pass it through `config` to the backend.
	const page = await client.products.search({
		query: params.query,
		image_url: params.image_url,
		limit: 10,
		config: { mode: "agentic" } as SearchConfig,
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

import { z } from "zod";

const searchCriteria = {
	query: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			"One product type and its constraints in natural language " +
				"(brand, color, material, size, price, gender).\n" +
				'Good: "red leather jacket under $200"; "leather golf glove under $40".\n' +
				'Bad: "gift ideas for dad"; "cool sneakers"; "golf glove or rangefinder".',
		),
	image_url: z
		.string()
		.optional()
		.describe("Public image URL for visual search. Combine with `query` for text + image."),
};

export const SearchRequestSchema = z
	.object(searchCriteria)
	.refine((data) => Boolean(data.query || data.image_url), {
		message: "At least one of `query` or `image_url` is required.",
	});

export const GetProductsRequestSchema = z.object({
	product_ids: z
		.array(z.string().describe("Product ID (from a `search_products` result) or URL."))
		.min(1)
		.max(40)
		.describe("Products to fetch in parallel."),
});

export const BrowseProductsSchema = z
	.object({
		...searchCriteria,
		page_token: z
			.string()
			.optional()
			.describe("Token from a previous response's next_page_token."),
		limit: z.number().int().min(1).max(30).default(20),
	})
	.refine((data) => Boolean(data.query || data.image_url || data.page_token), {
		message: "At least one of `query`, `image_url`, or `page_token` is required.",
	});

export const GetSimilarSchema = z.object({
	product_id: z.string().describe("Canonical product ID to find similar products for."),
	limit: z.number().int().min(1).max(30).default(20),
});

export const ProductIdRequestSchema = z.object({
	product_id: z.string().describe("Canonical product ID."),
});

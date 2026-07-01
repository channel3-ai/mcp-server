import { z } from "zod";

export const SearchRequestSchema = z
	.object({
		query: z
			.string()
			.optional()
			.describe(
				"Natural-language product search. Include any constraints inline (brand, " +
					"retailer, category, color, size, price range, gender, etc.). Required unless " +
					"`image_url` is given.",
			),
		image_url: z
			.string()
			.optional()
			.describe(
				"Public image URL for visual search. Combine with `query` for text+image search.",
			),
	})
	.refine((data) => Boolean(data.query || data.image_url), {
		message: "At least one of `query` or `image_url` is required.",
	});

export const GetProductRequestSchema = z.object({
	product_id: z.string().describe("Product ID (from a `search_products` result) or URL."),
});

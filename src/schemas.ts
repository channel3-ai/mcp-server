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
	// inputSchema must be object-shaped, so the query/image_url check stays server-side.
	.refine((data) => Boolean(data.query || data.image_url), {
		message: "At least one of `query` or `image_url` is required.",
	});

export const GetProductRequestSchema = z.object({
	product_id: z.string().describe("Product ID (from a `search_products` result) or URL."),
});

const PriceSchema = z.object({
	currency: z.string(),
	price: z.number(),
	compare_at_price: z.number().nullish(),
});

// Loose: tolerate new Channel3 SDK fields without breaking validation.
export const ProductOfferSchema = z.looseObject({
	availability: z.enum(["InStock", "OutOfStock"]),
	domain: z.string(),
	price: PriceSchema,
	url: z.string(),
});

export const ProductSummarySchema = z.looseObject({
	id: z.string(),
	title: z.string(),
	brand: z.string().optional(),
	category: z.string().nullish(),
	gender: z.string().nullish(),
	age: z.string().nullish(),
	image: z.string().optional(),
	structured_attributes: z.record(z.string(), z.array(z.string())).optional(),
	offers: z.array(ProductOfferSchema).optional(),
	description: z.string().nullish(),
});

export const SearchProductsResultSchema = z.object({
	products: z.array(ProductSummarySchema),
});

export const ProductDetailResultSchema = z.looseObject({
	id: z.string(),
});

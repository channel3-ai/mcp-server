import type { PriceHistoryPoint, PriceStatistics, ProductOffer } from "@channel3/sdk/resources";
import { z } from "zod";

const SearchQuerySchema = z.string().trim().min(1);
const ImageUrlSchema = z.string();

const searchCriteria = {
	query: SearchQuerySchema.optional().describe(
		"Product type(s) and constraints in natural language " +
			"(brand, color, material, size, price, gender).\n" +
			'Good: "red leather jacket under $200"; "leather golf glove or rangefinder under $40".\n' +
			'Bad: "gift ideas for dad"; "cool sneakers" (name products, not occasions or opinions).',
	),
	image_url: ImageUrlSchema.optional().describe(
		"Public image URL for visual search. Combine with `query` for text + image.",
	),
};

export const SearchRequestSchema = z
	.object({
		queries: z
			.array(
				SearchQuerySchema.describe(
					"One concrete product type with its relevant constraints.",
				),
			)
			.min(1)
			.max(8)
			.optional()
			.describe(
				"All product searches for this user request. Put every product type or " +
					"alternative in this one array. Use one item for a single-product request.",
			),
		image_url: ImageUrlSchema.optional().describe(
			"Public image URL for visual search. Combine with `queries` for text + image.",
		),
	})
	.refine((data) => Boolean(data.queries?.length || data.image_url), {
		message: "At least one of `queries` or `image_url` is required.",
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

const PriceSchema = z.object({
	currency: z.string(),
	price: z.number(),
	compare_at_price: z.number().nullish(),
});

export const ProductOfferSchema = z.looseObject({
	availability: z.enum(["InStock", "OutOfStock"]),
	domain: z.string(),
	price: PriceSchema,
	url: z.string(),
});

export const ProductSummarySchema = z.looseObject({
	id: z.string(),
	title: z.string(),
	brands: z.array(z.looseObject({ id: z.string(), name: z.string() })).optional(),
	category: z
		.looseObject({ slug: z.string(), title: z.string(), has_children: z.boolean() })
		.nullish(),
	gender: z.enum(["male", "female", "unisex"]).nullish(),
	age: z.enum(["newborn", "infant", "toddler", "kids", "adult"]).nullish(),
	images: z.array(z.looseObject({ url: z.string() })).optional(),
	structured_attributes: z.record(z.string(), z.array(z.string())).optional(),
	offers: z.array(ProductOfferSchema).optional(),
	description: z.string().nullish(),
});

const RawProductSchema = z.looseObject({
	id: z.string(),
	title: z.string(),
});

export const ProductsPageResultSchema = z.object({
	products: z.array(RawProductSchema),
	next_page_token: z.string().nullable(),
});

const PriceHistoryPointSchema = z.object({
	currency: z.string(),
	price: z.number(),
	timestamp: z.string(),
});

const PriceStatisticsSchema = z.object({
	currency: z.string(),
	current_price: z.number(),
	current_status: z.enum(["low", "typical", "high"]),
	max_price: z.number(),
	mean: z.number(),
	min_price: z.number(),
	std_dev: z.number(),
});

type AlignsWith<Sdk, Wire> = Sdk extends Wire ? true : false;
type Assert<T extends true> = T;
type _ProductOfferAlign = Assert<AlignsWith<z.infer<typeof ProductOfferSchema>, ProductOffer>>;
type _PriceHistoryPointAlign = Assert<
	AlignsWith<PriceHistoryPoint, z.infer<typeof PriceHistoryPointSchema>>
>;
type _PriceStatisticsAlign = Assert<
	AlignsWith<PriceStatistics, z.infer<typeof PriceStatisticsSchema>>
>;

export const GetDetailsResultSchema = z.object({
	product: RawProductSchema,
});

export const GetPriceHistoryResultSchema = z.object({
	history: z.array(PriceHistoryPointSchema),
	statistics: PriceStatisticsSchema.nullable(),
});

const AsOfSchema = z
	.string()
	.describe("ISO timestamp of when this result was produced; prices are live as of this moment.");

export const SearchProductsResultSchema = z.object({
	products: z.array(ProductSummarySchema),
	next_page_token: z
		.string()
		.nullable()
		.describe("Opaque pagination token used by the storefront UI; not usable via this tool."),
	as_of: AsOfSchema,
});

export const GetProductsResultSchema = z.object({
	products: z.array(RawProductSchema),
	unresolved: z.array(z.string()).optional(),
	as_of: AsOfSchema,
});

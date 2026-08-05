import type {
	PriceHistory,
	PriceHistoryPoint,
	PriceStatistics,
	ProductDetail,
	ProductOffer,
} from "@channel3/sdk/resources";
import { z } from "zod";

type AlignsWith<Sdk, Wire> = Sdk extends Wire ? true : false;
type Assert<T extends true> = T;

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
	images: z.array(z.looseObject({ url: z.string() })).optional(),
	offers: z.array(ProductOfferSchema).optional(),
});

// The SDK owns the product shape, so results validate the two fields every consumer
// keys on and pass the rest through. `_ProductAligns` keeps that identity a subset of
// the SDK type, which is what lets a parsed product widen to `ProductDetail`.
const ProductIdentitySchema = z.object({
	id: z.string(),
	title: z.string(),
});

const ProductSchema = ProductIdentitySchema.loose();

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

const AsOfSchema = z
	.string()
	.describe("ISO timestamp of when this result was produced; prices are live as of this moment.");

// Echoed back in results so a widget holding several result sets can pair each one
// with the search that produced it; host tool notifications carry no call ID.
const searchCriteria = {
	query: z.string().optional().describe("The text query this result answers."),
	image_url: z.string().optional().describe("The image URL this result answers."),
};

export const SearchCriteriaSchema = z.object(searchCriteria);

const seqSchema = { seq: z.number().int().optional() };

export const SearchProductsResultSchema = z.object({
	...searchCriteria,
	products: z.array(ProductSummarySchema),
	next_page_token: z
		.string()
		.nullable()
		.describe("Opaque pagination token used by the storefront UI; not usable via this tool."),
	as_of: AsOfSchema,
	...seqSchema,
});

export const GetProductsResultSchema = z.object({
	products: z.array(ProductSchema),
	unresolved: z.array(z.string()).optional(),
	as_of: AsOfSchema,
});

export const ProductsPageResultSchema = z.object({
	products: z.array(ProductSchema),
	next_page_token: z.string().nullable(),
});

export const GetDetailsResultSchema = z.object({
	product: ProductSchema,
});

export const GetPriceHistoryResultSchema = z.object({
	history: z.array(PriceHistoryPointSchema),
	statistics: PriceStatisticsSchema.nullable(),
});

// What a widget needs from whichever tool mounted it: search and get_products both
// return products, and only search echoes its criteria.
export const MountResultSchema = z.object({
	...searchCriteria,
	products: z.array(ProductSchema),
	next_page_token: z.string().nullable().optional(),
	as_of: z.string().optional(),
	...seqSchema,
});

export type ProductsPageResult = { products: ProductDetail[]; next_page_token: string | null };
export type GetDetailsResult = { product: ProductDetail };
export type GetPriceHistoryResult = Pick<PriceHistory, "history" | "statistics">;
export type MountResult = Omit<z.infer<typeof MountResultSchema>, "products"> & {
	products: ProductDetail[];
};

type _ProductAligns = Assert<AlignsWith<ProductDetail, z.infer<typeof ProductIdentitySchema>>>;
type _ProductOfferAligns = Assert<AlignsWith<z.infer<typeof ProductOfferSchema>, ProductOffer>>;
type _PriceHistoryPointAligns = Assert<
	AlignsWith<PriceHistoryPoint, z.infer<typeof PriceHistoryPointSchema>>
>;
type _PriceStatisticsAligns = Assert<
	AlignsWith<PriceStatistics, z.infer<typeof PriceStatisticsSchema>>
>;

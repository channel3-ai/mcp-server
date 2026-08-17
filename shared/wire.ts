import type {
	PriceHistoryResponse,
	PriceStatistics,
	Product,
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
// the SDK type, which is what lets a parsed product widen to `Product`.
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

const threadIdResult = z
	.string()
	.describe(
		"Conversation thread ID. Pass it back unchanged as `thread_id` on every follow-up call in this conversation.",
	);

export const MCP_SESSION_HEADER = "mcp-session-id";

const analyticsFields = {
	session_id: z.string().optional().describe("PostHog MCP session ID for analytics correlation."),
	server_origin: z
		.string()
		.optional()
		.describe("Origin of this MCP server; the storefront UI posts analytics events here."),
};

export const SearchProductsResultSchema = z.object({
	...searchCriteria,
	products: z.array(ProductSummarySchema),
	next_page_token: z
		.string()
		.nullable()
		.describe("Opaque pagination token used by the storefront UI; not usable via this tool."),
	as_of: AsOfSchema,
	...analyticsFields,
	thread_id: threadIdResult,
	...seqSchema,
});

export const GetProductsResultSchema = z.object({
	products: z.array(ProductSchema),
	unresolved: z.array(z.string()).optional(),
	as_of: AsOfSchema,
	...analyticsFields,
	thread_id: threadIdResult,
});

export const ProductsPageResultSchema = z.object({
	products: z.array(ProductSchema),
	next_page_token: z.string().nullable(),
});

export const GetDetailsResultSchema = z.object({
	product: ProductSchema,
});

export const GetPriceHistoryResultSchema = z.object({
	canonical_product_id: z.string(),
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
	...analyticsFields,
	thread_id: z.string().optional(),
	...seqSchema,
});

export type ProductsPageResult = { products: Product[]; next_page_token: string | null };
export type GetDetailsResult = { product: Product };
export type GetPriceHistoryResult = Pick<
	PriceHistoryResponse,
	"canonical_product_id" | "history" | "statistics"
>;
export type MountResult = Omit<z.infer<typeof MountResultSchema>, "products"> & {
	products: Product[];
};

type _ProductAligns = Assert<AlignsWith<Product, z.infer<typeof ProductIdentitySchema>>>;
type _ProductOfferAligns = Assert<AlignsWith<z.infer<typeof ProductOfferSchema>, ProductOffer>>;
type _PriceStatisticsAligns = Assert<
	AlignsWith<PriceStatistics, z.infer<typeof PriceStatisticsSchema>>
>;

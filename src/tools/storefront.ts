import { serialization } from "@channel3/sdk";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
	type GetDetailsResult,
	GetDetailsResultSchema,
	GetPriceHistoryResultSchema,
	type ProductsPageResult,
	ProductsPageResultSchema,
} from "../../shared/wire";
import { createClient } from "../channel3/client";
import { toPublicProduct } from "../channel3/format";
import {
	findSimilarProductsPage,
	isExhaustedPageTokenError,
	searchProductsPage,
} from "../channel3/products";
import { BrowseProductsSchema, GetSimilarSchema, ProductIdRequestSchema } from "../schemas";
import { asExtAppsServer, STOREFRONT_RESOURCE_URI } from "../storefront";
import type { ToolContext } from "../types";
import { READ_ONLY_ANNOTATIONS, runTool } from "./helpers";

const APP_UI_META = {
	ui: { resourceUri: STOREFRONT_RESOURCE_URI, visibility: ["app" as const] },
};

function toProductsPage(page: Awaited<ReturnType<typeof searchProductsPage>>): ProductsPageResult {
	return {
		products: page.data.map(toPublicProduct),
		next_page_token: page.response.next_page_token ?? null,
	};
}

function trackIdentity(p: { thread_id?: string; device_id?: string }): Record<string, unknown> {
	return {
		...(p.thread_id ? { thread_id: p.thread_id } : {}),
		...(p.device_id ? { device_id: p.device_id } : {}),
	};
}

export function registerStorefrontTools(server: McpServer, ctx: ToolContext) {
	const client = createClient(ctx.props.apiKey, ctx.props.baseURL);

	registerAppTool(
		asExtAppsServer(server),
		"browse_products",
		{
			title: "Browse Products",
			description: "Search and page through products for the storefront UI.",
			inputSchema: BrowseProductsSchema,
			outputSchema: ProductsPageResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: APP_UI_META,
		},
		async (params) =>
			runTool(
				"browse_products",
				ctx,
				params,
				async (p) => {
					try {
						return toProductsPage(await searchProductsPage(client, p));
					} catch (err) {
						if (p.page_token && isExhaustedPageTokenError(err)) {
							console.warn(
								`browse_products page token exhausted: ${err instanceof Error ? err.message : String(err)}`,
							);
							return { products: [], next_page_token: null };
						}
						throw err;
					}
				},
				{
					trackProperties: trackIdentity(params),
					summarize: (r) => `${r.products.length} products`,
				},
			),
	);

	registerAppTool(
		asExtAppsServer(server),
		"get_similar",
		{
			title: "Get Similar Products",
			description: "Find products similar to a given product, for the storefront UI.",
			inputSchema: GetSimilarSchema,
			outputSchema: ProductsPageResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: APP_UI_META,
		},
		async (params) =>
			runTool(
				"get_similar",
				ctx,
				params,
				async (p) => toProductsPage(await findSimilarProductsPage(client, p)),
				{
					trackProperties: trackIdentity(params),
					summarize: (r) => `${r.products.length} similar products`,
				},
			),
	);

	registerAppTool(
		asExtAppsServer(server),
		"get_details",
		{
			title: "Get Product Details",
			description: "Fetch a product with live offers, for the storefront UI.",
			inputSchema: ProductIdRequestSchema,
			outputSchema: GetDetailsResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: APP_UI_META,
		},
		async (params) =>
			runTool(
				"get_details",
				ctx,
				params,
				async (p): Promise<GetDetailsResult> => ({
					product: toPublicProduct(
						await client.products.retrieve({
							product_id: p.product_id,
							...(p.selected_options ? { selected_options: p.selected_options } : {}),
						}),
					),
				}),
				{
					trackProperties: trackIdentity(params),
					summarize: (r) => r.product.title,
				},
			),
	);

	registerAppTool(
		asExtAppsServer(server),
		"get_price_history",
		{
			title: "Get Price History",
			description: "Fetch 30-day price history for a product, for the storefront UI.",
			inputSchema: ProductIdRequestSchema,
			outputSchema: GetPriceHistoryResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: APP_UI_META,
		},
		async (params) =>
			runTool(
				"get_price_history",
				ctx,
				params,
				async (p) => {
					const history = await client.priceTracking
						.retrieveHistory({ canonical_product_id: p.product_id, days: 30 })
						.catch((err: unknown) => {
							console.warn(
								`price history unavailable for ${p.product_id}: ${err instanceof Error ? err.message : String(err)}`,
							);
							return null;
						});
					if (!history) {
						return {
							canonical_product_id: p.product_id,
							history: [],
							statistics: null,
						};
					}
					const raw = serialization.PriceHistoryResponse.jsonOrThrow(history, {
						unrecognizedObjectKeys: "strip",
					});
					return {
						canonical_product_id: raw.canonical_product_id,
						history: raw.history ?? [],
						statistics: raw.statistics ?? null,
					};
				},
				{
					trackProperties: trackIdentity(params),
					summarize: (r) => `${r.history?.length ?? 0} price points`,
				},
			),
	);
}

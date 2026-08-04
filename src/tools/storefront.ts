import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

import { createClient, type ProductDetail } from "../channel3/client";
import { toPublicProduct } from "../channel3/format";
import { findSimilarProductsPage, searchProductsPage } from "../channel3/products";
import {
	BrowseProductsSchema,
	GetDetailsResultSchema,
	GetPriceHistoryResultSchema,
	GetSimilarSchema,
	ProductIdRequestSchema,
	ProductsPageResultSchema,
} from "../schemas";
import type {
	GetDetailsResult,
	GetPriceHistoryResult,
	ProductsPageResult,
} from "../../shared/wire";
import { asExtAppsServer, STOREFRONT_RESOURCE_URI } from "../storefront";
import type { ToolContext } from "../types";
import { READ_ONLY_ANNOTATIONS, runTool } from "./helpers";

const APP_UI_META = {
	ui: { resourceUri: STOREFRONT_RESOURCE_URI, visibility: ["app" as const] },
};

function toProductsPage(page: {
	products: ProductDetail[];
	next_page_token: string | null;
}): ProductsPageResult {
	return {
		products: page.products.map(toPublicProduct),
		next_page_token: page.next_page_token,
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
				async (p) => toProductsPage(await searchProductsPage(client, p)),
				{ summarize: (r) => `${r.products.length} products` },
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
				{ summarize: (r) => `${r.products.length} similar products` },
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
					product: toPublicProduct(await client.products.retrieve(p.product_id)),
				}),
				{ summarize: (r) => r.product.title },
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
				async (p): Promise<GetPriceHistoryResult> => {
					const history = await client.priceTracking
						.retrieveHistory(p.product_id, { days: 30 })
						.catch((err: unknown) => {
							console.warn(
								`price history unavailable for ${p.product_id}: ${err instanceof Error ? err.message : String(err)}`,
							);
							return null;
						});
					return {
						history: history?.history ?? [],
						statistics: history?.statistics ?? null,
					};
				},
				{ summarize: (r) => `${r.history?.length ?? 0} price points` },
			),
	);
}

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

import { productAnchorLine } from "../channel3/format";
import { searchProducts } from "../channel3/products";
import { SearchProductsResultSchema, SearchRequestSchema } from "../schemas";
import { asExtAppsServer, STOREFRONT_RESOURCE_URI } from "../storefront";
import type { ToolContext } from "../types";
import { READ_ONLY_ANNOTATIONS, runTool } from "./helpers";

export function registerSearchProducts(server: McpServer, ctx: ToolContext) {
	registerAppTool(
		asExtAppsServer(server),
		"search_products",
		{
			title: "Search Products",
			description:
				"Search products by natural-language query. The query can be as specific as you need. " +
				"Results render as interactive product cards the user can already see - keep your " +
				"reply to brief commentary or a recommendation, not a re-listing. As the user " +
				"scrolls, the products they load are synced to your context (title, id, price); " +
				"call get_products with an id for full offers, description, and attributes.",
			inputSchema: SearchRequestSchema,
			outputSchema: SearchProductsResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: { ui: { resourceUri: STOREFRONT_RESOURCE_URI } },
		},
		async (params) =>
			runTool(
				"search_products",
				ctx,
				params,
				async (p) => ({
					...(await searchProducts(ctx.props.apiKey, p, ctx.props.baseURL)),
					as_of: new Date().toISOString(),
				}),
				{
					summarize: (r, p) => {
						const what = p.query ? ` for "${p.query}"` : p.image_url ? " by image" : "";
						const more = r.next_page_token ? " (more available)" : "";
						return [
							`Found ${r.products.length} products${what}${more}, rendered as interactive ` +
								"product cards the user can already see. Do not re-list the products or " +
								"restate prices in your reply; add only brief commentary, trade-offs, or a " +
								"recommendation. Full details (descriptions, attributes, all offers) are in " +
								"this result's structured content for answering follow-ups.",
							"",
							...r.products.map(productAnchorLine),
						].join("\n");
					},
				},
			),
	);
}

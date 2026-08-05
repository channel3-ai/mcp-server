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
				"Search 100M+ products across thousands of retailers for one product type. " +
				"Call once for each distinct product type, and send independent calls together. " +
				"Put relevant constraints in `query`.\n" +
				"Returns up to 8 product cards plus structured product data.",
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
					query: p.query,
					image_url: p.image_url,
					...(await searchProducts(ctx.props.apiKey, p, ctx.props.baseURL)),
					as_of: new Date().toISOString(),
				}),
				{
					summarize: (r, p) => {
						const what = p.query
							? ` for "${p.query}"`
							: p.image_url
								? " for the image"
								: "";
						const more = r.next_page_token
							? " More results are available through Shop all."
							: "";
						return [
							`Found ${r.products.length} products${what}.${more}`,
							"The returned products show as cards in the storefront.",
							"",
							...r.products.map(productAnchorLine),
						].join("\n");
					},
				},
			),
	);
}

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
				"Search more than 100 million products from thousands of retailers.\n" +
				"Before you call this tool:\n" +
				'1. List the distinct products that answer the request. "Gift ideas for my dad ' +
				'who golfs" contains several products: a golf glove, a rangefinder, a golf ' +
				'towel. "Red leather jacket under $200" contains one product.\n' +
				"2. Write one query for each product in the list.\n" +
				"3. Call this tool one time for each query. Send the calls together.\n" +
				"Do not put two products in one query. Do not write a list of keywords. The " +
				"tool reads the query as one product description.\n" +
				"The results show to the user as product cards. Do not list the products or " +
				"the prices again in your reply. Give a short comment, a trade-off, or a " +
				"recommendation.\n" +
				"The storefront reports what the user is viewing — open result sets, products " +
				"they scrolled to, and any product page they opened — as model context. Some " +
				"hosts attach it to the user's next message; some expose it as \"widget " +
				'context" or app state you have to read first. When the user says "this ' +
				'product", "the one I\'m viewing", or otherwise points at something without ' +
				"naming it, resolve it from that context instead of asking which product they " +
				"mean. Answer from context when it has what you need; call `get_products` with " +
				"an ID only for details it lacks.",
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
						const what = p.query
							? ` for "${p.query}"`
							: p.image_url
								? " for the image"
								: "";
						const more = r.next_page_token ? " More results are available." : "";
						return [
							`Found ${r.products.length} products${what}.${more}`,
							"The first 8 render as cards the user can already see; the rest appear in the expandable grid (Shop all).",
							"Do not list the products or repeat the prices.",
							"Give a short comment, a trade-off, or a recommendation.",
							"The full data for each product is in the structured content of this result.",
							"Use it to answer questions about the products.",
							"When the user refers to what they're viewing, use the storefront's model context (some hosts call it widget context or app state): it reports open result sets and any product page they opened.",
							"",
							...r.products.map(productAnchorLine),
						].join("\n");
					},
				},
			),
	);
}

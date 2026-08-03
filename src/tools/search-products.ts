import type { McpServer } from "@modelcontextprotocol/server";

import { searchProducts } from "../channel3/products";
import { SearchProductsResultSchema, SearchRequestSchema } from "../schemas";
import type { ToolContext } from "../types";
import { runTool } from "./helpers";

export function registerSearchProducts(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		"search_products",
		{
			title: "Search Products",
			description:
				"Search products by natural-language query. The query can be as specific as you need.",
			inputSchema: SearchRequestSchema,
			outputSchema: SearchProductsResultSchema,
			annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
		},
		async (params) =>
			runTool("search_products", ctx, params, async (p) => ({
				products: await searchProducts(ctx.props.apiKey, p, ctx.props.baseURL),
			})),
	);
}

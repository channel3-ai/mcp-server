import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { searchProducts } from "../channel3/products";
import { SearchRequestSchema } from "../schemas";
import type { ToolContextGetter } from "../types";
import { runTool } from "./helpers";

export function registerSearchProducts(server: McpServer, getContext: ToolContextGetter) {
	server.registerTool(
		"search_products",
		{
			title: "Search Products",
			description:
				"Search products by natural-language query. The query can be as specific as you need.",
			inputSchema: SearchRequestSchema,
			annotations: { readOnlyHint: true },
		},
		async (params: z.infer<typeof SearchRequestSchema>) =>
			runTool(getContext, params, (p, ctx) =>
				searchProducts(ctx.props.apiKey, p, ctx.props.baseURL),
			),
	);
}

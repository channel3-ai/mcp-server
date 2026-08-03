import type { McpServer } from "@modelcontextprotocol/server";

import { getProduct } from "../channel3/products";
import { GetProductRequestSchema, ProductDetailResultSchema } from "../schemas";
import type { ToolContext } from "../types";
import { runTool } from "./helpers";

export function registerGetProduct(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		"get_product",
		{
			title: "Get Product",
			description:
				"Get full details for one product. Pass a product ID (from a `search_products` result) or URL.",
			inputSchema: GetProductRequestSchema,
			outputSchema: ProductDetailResultSchema,
			annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
		},
		async (params) =>
			runTool("get_product", ctx, params, (p) =>
				getProduct(ctx.props.apiKey, p, ctx.props.baseURL),
			),
	);
}

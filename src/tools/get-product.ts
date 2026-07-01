import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { getProduct } from "../channel3/products";
import { GetProductRequestSchema } from "../schemas";
import type { ToolContextGetter } from "../types";
import { runTool } from "./helpers";

export function registerGetProduct(server: McpServer, getContext: ToolContextGetter) {
	server.registerTool(
		"get_product",
		{
			title: "Get Product",
			description:
				"Get full details for one product. Pass a product ID (from a `search_products` result) or URL.",
			inputSchema: GetProductRequestSchema.shape,
			annotations: { readOnlyHint: true },
		},
		async (params: z.infer<typeof GetProductRequestSchema>) =>
			runTool(getContext, params, (p, ctx) =>
				getProduct(ctx.props.apiKey, p, ctx.props.baseURL),
			),
	);
}

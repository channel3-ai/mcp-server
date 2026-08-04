import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

import { productAnchorLine } from "../channel3/format";
import { getProducts } from "../channel3/products";
import { GetProductsRequestSchema, GetProductsResultSchema } from "../schemas";
import { asExtAppsServer, STOREFRONT_RESOURCE_URI } from "../storefront";
import type { ToolContext } from "../types";
import { READ_ONLY_ANNOTATIONS, runTool } from "./helpers";

export function registerGetProducts(server: McpServer, ctx: ToolContext) {
	registerAppTool(
		asExtAppsServer(server),
		"get_products",
		{
			title: "Get Products",
			description:
				"Get full product data (offers, description, attributes, images) by product ID " +
				"from a search result, or by retailer URL. Pass several IDs in one call to compare.\n" +
				"Use search_products to find products. Returns details in the storefront UI.",
			inputSchema: GetProductsRequestSchema,
			outputSchema: GetProductsResultSchema,
			annotations: READ_ONLY_ANNOTATIONS,
			_meta: { ui: { resourceUri: STOREFRONT_RESOURCE_URI } },
		},
		async (params) =>
			runTool(
				"get_products",
				ctx,
				params,
				async (p) => ({
					...(await getProducts(ctx.props.apiKey, p, ctx.props.baseURL)),
					as_of: new Date().toISOString(),
				}),
				{
					summarize: (r) => {
						const lines = [
							`Fetched ${r.products.length} product${r.products.length === 1 ? "" : "s"}.`,
							"",
							...r.products.map(productAnchorLine),
						];
						if (r.unresolved?.length) {
							lines.push("", `Could not resolve: ${r.unresolved.join(", ")}`);
						}
						return lines.join("\n");
					},
				},
			),
	);
}

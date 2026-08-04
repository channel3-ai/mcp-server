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
				"Get the full data for one product or more: all offers, the description, the " +
				"attributes, and the images.\n" +
				"Use a product ID from a `search_products` result, or a product URL from any " +
				"retailer. Give several IDs in one call to compare products. The tool fetches " +
				"them together.\n" +
				"Do not use this tool to find products. Use `search_products` for that.\n" +
				"The data shows to the user in the storefront UI. Do not repeat the " +
				"specifications or the prices in your reply. Give a comment, a comparison, or " +
				"a recommendation.",
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
							`Found the full data for ${r.products.length} product${r.products.length === 1 ? "" : "s"}.`,
							"These products show to the user in the storefront. The user can see them.",
							"Do not repeat the specifications, the descriptions, or the prices.",
							"Give a comment, a comparison, or a recommendation.",
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

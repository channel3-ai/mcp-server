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
				"Fetch full details for one or more products by ID (from a `search_products` " +
				"result) or URL. Pass several IDs to fetch and compare products in parallel. " +
				"Details also display in the storefront UI the user can already see - don't " +
				"restate them verbatim; add commentary or a recommendation.",
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
							`Fetched full details for ${r.products.length} product${r.products.length === 1 ? "" : "s"}, ` +
								"displayed in the storefront UI the user can already see. Do not restate " +
								"specs, descriptions, or prices verbatim; add only commentary, comparisons, " +
								"or a recommendation.",
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

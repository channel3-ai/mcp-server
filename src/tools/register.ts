import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../types";
import { registerGetProducts } from "./get-products";
import { registerSearchProducts } from "./search-products";
import { registerStorefrontTools } from "./storefront";

export function registerTools(server: McpServer, ctx: ToolContext) {
	registerSearchProducts(server, ctx);
	registerGetProducts(server, ctx);
	registerStorefrontTools(server, ctx);
}

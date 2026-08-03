import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../types";
import { registerGetProduct } from "./get-product";
import { registerSearchProducts } from "./search-products";

export function registerTools(server: McpServer, ctx: ToolContext) {
	registerSearchProducts(server, ctx);
	registerGetProduct(server, ctx);
}

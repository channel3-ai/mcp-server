import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolContextGetter } from "../types";
import { registerGetProduct } from "./get-product";
import { registerSearchProducts } from "./search-products";

export function registerTools(server: McpServer, getContext: ToolContextGetter) {
	registerSearchProducts(server, getContext);
	registerGetProduct(server, getContext);
}

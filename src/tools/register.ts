import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../types";
import { registerFeedbackTool } from "./feedback";
import { registerGetProducts } from "./get-products";
import { registerReviewTool } from "./reviews";
import { registerSearchProducts } from "./search-products";
import { registerStorefrontTools } from "./storefront";

// Always registered, whatever the caller's key: tools/list is cached publicly, so tools that
// need an API key check for one when called instead of being hidden from free-tier callers.
export function registerTools(server: McpServer, ctx: ToolContext) {
	registerSearchProducts(server, ctx);
	registerGetProducts(server, ctx);
	registerStorefrontTools(server, ctx);
	registerReviewTool(server, ctx);
	registerFeedbackTool(server, ctx);
}

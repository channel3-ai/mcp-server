import { McpServer } from "@modelcontextprotocol/server";

import pkg from "../package.json";
import { registerPrompts } from "./prompts";
import { registerStorefrontResource } from "./storefront";
import { registerTools } from "./tools/register";
import type { Bindings, Props, ToolContext } from "./types";

// Bearer is a fallback because OpenAI's hosted MCP tool sends its credential that way.
function readApiKey(request: Request): string | undefined {
	const header = request.headers.get("x-api-key")?.trim();
	if (header) return header;
	const bearer = request.headers.get("authorization")?.trim();
	if (bearer) return bearer.replace(/^Bearer\s+/i, "").trim() || undefined;
	return undefined;
}

export function createServer(env: Bindings, request: Request) {
	const url = new URL(request.url);
	const origin = url.origin;
	const apiKey = readApiKey(request);
	const props: Props = {
		apiKey: apiKey || env.DEFAULT_CHANNEL3_API_KEY,
		baseURL: env.CHANNEL3_BASE_URL || undefined,
		isFreeTier: !apiKey,
		clientIP: request.headers.get("cf-connecting-ip") || "unknown",
		userAgent: request.headers.get("user-agent") || "unknown",
	};

	const server = new McpServer(
		{
			name: "Channel3",
			version: pkg.version,
			title: "Channel3",
			description:
				"Search 100M+ products across thousands of retailers, with live prices " +
				"and affiliate-aware buy URLs.",
			websiteUrl: "https://trychannel3.com",
			icons: [
				{
					src: `${origin}/icons/channel3-logo-small-light.svg`,
					mimeType: "image/svg+xml",
					theme: "light",
				},
				{
					src: `${origin}/icons/channel3-logo-small-dark.svg`,
					mimeType: "image/svg+xml",
					theme: "dark",
				},
			],
		},
		{
			instructions:
				"Channel3 searches for products from thousands of retailers.\n" +
				"`search_products` finds products from a description in natural language.\n" +
				"`get_products` returns the full data for a product. Use an ID from a " +
				"`search_products` result, or a product URL from any retailer.\n" +
				"The results show to the user in a storefront UI. Do not list the products, " +
				"the prices, or the specifications that the user can see. Give a short " +
				"comment, a trade-off, or a recommendation.",
			cacheHints: {
				"tools/list": { ttlMs: 86_400_000, cacheScope: "public" },
				"prompts/list": { ttlMs: 86_400_000, cacheScope: "public" },
			},
		},
	);

	const ctx: ToolContext = { props, env, origin };
	registerTools(server, ctx);
	registerPrompts(server);
	registerStorefrontResource(server);
	return server;
}

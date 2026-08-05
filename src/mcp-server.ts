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
			title: "Channel3 Shopping",
			description:
				"Shopping search across 100M+ products, with every retailer's " +
				"offer and live price in one place.",
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
				"Use Channel3 to search products and compare live retailer offers.\n" +
				"Call search_products separately for each distinct product type.\n" +
				"Call get_products for full details by product ID or retailer URL.\n" +
				"Results appear in a storefront UI — comment or recommend; do not re-list what the user can see.\n" +
				'For deictic references ("this product"), use the storefront model context.',
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

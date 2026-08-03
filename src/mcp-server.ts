import { McpServer } from "@modelcontextprotocol/server";

import pkg from "../package.json";
import { registerPrompts } from "./prompts";
import { registerTools } from "./tools/register";
import type { Bindings, Props } from "./types";

// One server per request: per-request props (API key) close over the tool handlers.
export function createServer(env: Bindings, request: Request) {
	const apiKey = request.headers.get("x-api-key")?.trim();
	const props: Props = {
		apiKey: apiKey || env.DEFAULT_CHANNEL3_API_KEY,
		baseURL: env.CHANNEL3_BASE_URL || undefined,
		isFreeTier: !apiKey,
		clientIP: request.headers.get("cf-connecting-ip") || "unknown",
		userAgent: request.headers.get("user-agent") || "unknown",
	};

	// Icons are this Worker's static assets; resolve against the request origin.
	const origin = new URL(request.url).origin;

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
				"Channel3 product search. `search_products` finds products from a natural-language " +
				"query; `get_product` returns full details for one product by ID (from a " +
				"`search_products` result) or URL.",
			cacheHints: {
				"tools/list": { ttlMs: 86_400_000, cacheScope: "public" },
				"prompts/list": { ttlMs: 86_400_000, cacheScope: "public" },
			},
		},
	);

	registerTools(server, { props, env });
	registerPrompts(server);
	return server;
}

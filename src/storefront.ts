import {
	registerAppResource,
	type registerAppTool,
	RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "./types";

export const STOREFRONT_RESOURCE_URI = "ui://storefront/app.html";

type ExtAppsServer = Parameters<typeof registerAppResource>[0] &
	Parameters<typeof registerAppTool>[0];

export function asExtAppsServer(server: McpServer): ExtAppsServer {
	return server as unknown as ExtAppsServer;
}

const STOREFRONT_UI_META = {
	ui: {
		prefersBorder: false,
		csp: { resourceDomains: ["https://cdn.trychannel3.com", "https://assets.claude.ai"] },
	},
};

let htmlPromise: Promise<string> | null = null;

function fetchStorefrontHtml(ctx: ToolContext): Promise<string> {
	return ctx.env.ASSETS.fetch(new Request(new URL("/storefront/app.html", ctx.origin))).then(
		(response) => {
			if (!response.ok) {
				throw new Error(`Failed to load storefront UI (HTTP ${response.status}).`);
			}
			return response.text();
		},
	);
}

function loadStorefrontHtml(ctx: ToolContext): Promise<string> {
	if (ctx.props.isDev) {
		return fetchStorefrontHtml(ctx);
	}
	htmlPromise ??= fetchStorefrontHtml(ctx).catch((err: unknown) => {
		htmlPromise = null;
		throw err;
	});
	return htmlPromise;
}

export function registerStorefrontResource(server: McpServer, ctx: ToolContext) {
	registerAppResource(
		asExtAppsServer(server),
		"Channel3 Storefront",
		STOREFRONT_RESOURCE_URI,
		{
			title: "Channel3 Storefront",
			description: "Interactive storefront for browsing Channel3 products.",
			_meta: STOREFRONT_UI_META,
		},
		async () => ({
			contents: [
				{
					uri: STOREFRONT_RESOURCE_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: await loadStorefrontHtml(ctx),
					_meta: STOREFRONT_UI_META,
				},
			],
		}),
	);
}

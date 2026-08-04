import {
	registerAppResource,
	type registerAppTool,
	RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

// Bundled, not fetched, so a missing UI build fails the build instead of a user's session.
import storefrontHtml from "../public/storefront/app.html";

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

export function registerStorefrontResource(server: McpServer) {
	registerAppResource(
		asExtAppsServer(server),
		"Channel3 Storefront",
		STOREFRONT_RESOURCE_URI,
		{
			title: "Channel3 Storefront",
			description: "Interactive storefront for browsing Channel3 products.",
			_meta: STOREFRONT_UI_META,
		},
		() => ({
			contents: [
				{
					uri: STOREFRONT_RESOURCE_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: storefrontHtml,
					_meta: STOREFRONT_UI_META,
				},
			],
		}),
	);
}

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

// Claude validates ui.domain against a SHA-256 of the connector URL, so the value must be derived per deployment (production vs tunnel), not hardcoded.
async function claudeSandboxDomain(connectorUrl: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(connectorUrl));
	const hex = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return `${hex.slice(0, 32)}.claudemcpcontent.com`;
}

export async function registerStorefrontResource(server: McpServer, connectorUrl: string) {
	const meta = {
		ui: {
			prefersBorder: false,
			domain: await claudeSandboxDomain(connectorUrl),
			csp: {
				resourceDomains: ["https://cdn.trychannel3.com", "https://assets.claude.ai"],
				connectDomains: [connectorUrl],
			},
		},
	};
	registerAppResource(
		asExtAppsServer(server),
		"Channel3 Storefront",
		STOREFRONT_RESOURCE_URI,
		{
			title: "Channel3 Storefront",
			description: "Interactive storefront for browsing Channel3 products.",
			_meta: meta,
		},
		() => ({
			contents: [
				{
					uri: STOREFRONT_RESOURCE_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: storefrontHtml,
					_meta: meta,
				},
			],
		}),
	);
}

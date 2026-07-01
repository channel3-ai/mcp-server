import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";

import { registerTools } from "./tools/register";
import type { Bindings, Props, State } from "./types";

export class Channel3MCP extends McpAgent<Bindings, State, Props> {
	server = new McpServer(
		{ name: "Channel3", version: "3.3.0" },
		{
			instructions:
				"Channel3 product search. `search_products` finds products from a natural-language " +
				"query; `get_product` returns full details for one product by ID (from a " +
				"`search_products` result) or URL.",
			capabilities: { tools: { listChanged: false } },
		},
	);

	async init() {
		if (!this.props) {
			throw new Error("Channel3MCP.init called before request props were attached");
		}
		const props = this.props;
		registerTools(this.server, () => ({ props, env: this.env }));
	}
}

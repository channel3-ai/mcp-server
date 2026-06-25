import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SearchRequestSchema } from "./schemas";
import { searchProducts } from "./channel3";

export type Bindings = Env;

export type Props = {
  apiKey: string;
  isFreeTier: boolean;
  clientIP: string;
};

export type State = null;

export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer(
    { name: "Channel3", version: "3.0.0" },
    {
      instructions:
        "Channel3 is a product search API with access to millions of products and brands. Use the search tool to find products matching the user's request. Each product includes specific offers from different retailers with exact prices and buy URLs.",
      capabilities: { tools: { listChanged: false } },
    },
  );

  async init() {
    this.server.registerTool(
      "search",
      {
        title: "Product Search",
        description:
          "Search a catalog of millions of products and brands. " +
          "Returns matching products with title, brand, images, and offers from different retailers. " +
          "Each offer has a price and a buy URL. Present multiple offers so the user can compare prices and choose where to buy.",
        inputSchema: SearchRequestSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params: z.infer<typeof SearchRequestSchema>) => {
        if (this.props!.isFreeTier) {
          const { success } = await this.env.FREE_RATE_LIMITER.limit({
            key: this.props!.clientIP,
          });
          if (!success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Free tier rate limit exceeded. For unlimited access, get your API key at https://trychannel3.com and add ?apiKey=YOUR_KEY to the MCP URL.",
                },
              ],
              isError: true,
            };
          }
        }

        try {
          const results = await searchProducts(this.props!.apiKey, params);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(results) },
            ],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Search error: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
}

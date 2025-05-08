import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Channel3 MCP",
    version: "1.0.0",
  });

  async init() {
    // Simple addition tool
    this.server.tool("search", { query: z.string() }, async ({ query }) => {
      const apiKey = "hvEplLaPndU4FlNfiHOi18miDBJuvl66T2naqQEj";
      const response = await fetch(`https://api.trychannel3.com/v0/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ query, limit: 10 }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    });
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      // @ts-ignore
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      console.log("serving /mcp ,", request, env, ctx);
      // @ts-ignore
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};

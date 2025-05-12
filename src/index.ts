import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";

type Bindings = Env;

const app = new Hono<{
  Bindings: Bindings;
}>();

type Props = {
  apiKey: string;
};

type State = null;

export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer({
    name: "Demo",
    version: "1.0.0",
  });

  async init() {
    // Simple addition tool
    this.server.tool("search", { query: z.string() }, async ({ query }) => {
      const response = await fetch(`https://api.trychannel3.com/v0/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.props.apiKey,
        },
        body: JSON.stringify({ query, limit: 10 }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    });
  }
}

app.mount("/", (req, env, ctx) => {
  // This could technically be pulled out into a middleware function, but is left here for clarity
  console.log(req.headers);
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return new Response("API Key required", { status: 401 });
  }

  ctx.props = {
    apiKey: apiKey,
    // could also add arbitrary headers/parameters here to pass into the MCP client
  };

  return MyMCP.mount("/sse").fetch(req, env, ctx);
});

export default app;

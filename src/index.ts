import { Hono } from "hono";

import { Channel3MCP } from "./mcp-server";
import type { Bindings, Props } from "./types";

type PropsExecutionContext = ExecutionContext & { props?: Props };

const app = new Hono<{
	Bindings: Bindings;
}>();

const withProps = (
	handler: (req: Request, env: Bindings, ctx: ExecutionContext) => Promise<Response>,
) => {
	return (req: Request, env: Bindings, ctx: ExecutionContext) => {
		const url = new URL(req.url);
		const userApiKey = url.searchParams.get("apiKey")?.trim();
		(ctx as PropsExecutionContext).props = {
			apiKey: userApiKey || env.DEFAULT_CHANNEL3_API_KEY,
			baseURL: env.CHANNEL3_BASE_URL || undefined,
			isFreeTier: !userApiKey,
			clientIP: req.headers.get("cf-connecting-ip") || "unknown",
		};
		return handler(req, env, ctx);
	};
};

// Redirect browsers hitting the root to docs (MCP clients use POST or Accept: text/event-stream)
app.use("/", async (c, next) => {
	if (c.req.method === "GET" && !c.req.header("accept")?.includes("text/event-stream")) {
		return c.redirect("https://docs.trychannel3.com/mcp-overview", 302);
	}
	await next();
});

app.mount("/", withProps(Channel3MCP.serve("/").fetch));

// SSE transport (GET "/sse" and POST "/sse/message")
app.mount("/sse", withProps(Channel3MCP.serveSSE("/sse").fetch));

export { Channel3MCP };
export default app;

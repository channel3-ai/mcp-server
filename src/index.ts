import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";

import { createServer } from "./mcp-server";
import type { Bindings } from "./types";

const app = new Hono<{
	Bindings: Bindings;
}>();

app.use("/", async (c, next) => {
	if (c.req.method === "GET" && !c.req.header("accept")?.includes("text/event-stream")) {
		return c.redirect("https://docs.trychannel3.com/mcp-overview", 302);
	}
	await next();
});

app.mount("/", (req, env, ctx) =>
	createMcpHandler((mcpCtx) => createServer(env, mcpCtx.requestInfo ?? req), {
		route: "/",
		legacy: "stateless",
	})(req, env, ctx),
);

export default app;

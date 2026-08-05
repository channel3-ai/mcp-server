import {
	decodeSessionId,
	encodeSessionId,
	MCP_SESSION_HEADER,
	newSessionId,
	type SessionTokenPayload,
} from "@posthog/mcp";
import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";
import { z } from "zod";

import { Analytics } from "./analytics/posthog";
import { createServer, propsFromRequest } from "./mcp-server";
import type { Bindings } from "./types";

const app = new Hono<{
	Bindings: Bindings;
	Variables: { analytics: Analytics };
}>();

app.use("/", async (c, next) => {
	if (c.req.method === "GET" && !c.req.header("accept")?.includes("text/event-stream")) {
		return c.redirect("https://docs.trychannel3.com/mcp-overview", 302);
	}
	await next();
});

type InitializeInfo = Omit<SessionTokenPayload, "sessionId">;

const jsonRpcMessageSchema = z.looseObject({
	method: z.string(),
	params: z.unknown().optional(),
});

const initializeParamsSchema = z
	.object({
		clientInfo: z.object({ name: z.string(), version: z.string() }).optional().catch(undefined),
		protocolVersion: z.string().optional().catch(undefined),
	})
	.optional()
	.catch(undefined);

async function readInitialize(request: Request): Promise<InitializeInfo | null> {
	let body: unknown;
	try {
		body = await request.clone().json();
	} catch {
		return null;
	}
	for (const raw of Array.isArray(body) ? body : [body]) {
		const msg = jsonRpcMessageSchema.safeParse(raw);
		if (!msg.success || msg.data.method !== "initialize") continue;
		const params = initializeParamsSchema.parse(msg.data.params);
		return {
			clientName: params?.clientInfo?.name,
			clientVersion: params?.clientInfo?.version,
			protocolVersion: params?.protocolVersion,
		};
	}
	return null;
}

app.use("/", async (c, next) => {
	const init =
		c.req.method === "POST" && !c.req.header(MCP_SESSION_HEADER)
			? await readInitialize(c.req.raw)
			: null;
	const session: SessionTokenPayload | null = init
		? { sessionId: newSessionId(), ...init }
		: decodeSessionId(c.req.header(MCP_SESSION_HEADER));
	const analytics = new Analytics(c.env, propsFromRequest(c.env, c.req.raw), session);
	c.set("analytics", analytics);

	if (init && session) {
		await analytics.captureInitialize(init);
	}
	await next();
	if (init && session) {
		c.header(MCP_SESSION_HEADER, encodeSessionId(session));
	}
});

app.all("/", (c) =>
	createMcpHandler(() => createServer(c.env, c.req.raw, c.var.analytics), {
		route: "/",
		legacy: "stateless",
	})(c.req.raw, c.env, c.executionCtx as ExecutionContext),
);

export default app;

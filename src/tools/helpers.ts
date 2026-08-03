import type { CallToolResult } from "@modelcontextprotocol/server";

import type { ToolContext } from "../types";

export async function checkRateLimit(ctx: ToolContext): Promise<CallToolResult | null> {
	if (!ctx.props.isFreeTier) return null;
	const { success } = await ctx.env.FREE_RATE_LIMITER.limit({
		key: ctx.props.clientIP,
	});
	if (!success) {
		return {
			content: [
				{
					type: "text",
					text: "Free tier rate limit exceeded. For unlimited access, get your API key at https://trychannel3.com and send it as an X-API-Key header.",
				},
			],
			isError: true,
		};
	}
	return null;
}

export function errorResponse(err: unknown): CallToolResult {
	const message = err instanceof Error ? err.message : String(err);
	return {
		content: [{ type: "text", text: `Error: ${message}` }],
		isError: true,
	};
}

function logToolCall(
	toolName: string,
	ctx: ToolContext,
	outcome: "success" | "error" | "rate_limited",
	params: unknown,
	errorMessage?: string,
): void {
	console.log(
		JSON.stringify({
			event: "mcp_tool_call",
			tool: toolName,
			outcome,
			params: JSON.stringify(params) ?? "",
			client_ip: ctx.props.clientIP,
			user_agent: ctx.props.userAgent,
			tier: ctx.props.isFreeTier ? "free" : "api_key",
			...(errorMessage ? { error: errorMessage } : {}),
		}),
	);
}

// Spec SHOULD: mirror structuredContent as a text block for text-only clients.
export async function runTool<P>(
	toolName: string,
	ctx: ToolContext,
	params: P,
	handler: (params: P) => Promise<unknown>,
): Promise<CallToolResult> {
	const rateLimitError = await checkRateLimit(ctx);
	if (rateLimitError) {
		logToolCall(toolName, ctx, "rate_limited", params);
		return rateLimitError;
	}

	try {
		const structuredContent = await handler(params);
		logToolCall(toolName, ctx, "success", params);
		return {
			content: [{ type: "text", text: JSON.stringify(structuredContent) }],
			structuredContent,
		};
	} catch (err: unknown) {
		logToolCall(
			toolName,
			ctx,
			"error",
			params,
			err instanceof Error ? err.message : String(err),
		);
		return errorResponse(err);
	}
}

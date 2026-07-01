import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { ToolContext, ToolContextGetter } from "../types";

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
					text: "Free tier rate limit exceeded. For unlimited access, get your API key at https://trychannel3.com and add ?apiKey=YOUR_KEY to the MCP URL.",
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

export async function runTool<P>(
	getContext: ToolContextGetter,
	params: P,
	handler: (params: P, ctx: ToolContext) => Promise<unknown>,
): Promise<CallToolResult> {
	const ctx = getContext();
	const rateLimitError = await checkRateLimit(ctx);
	if (rateLimitError) return rateLimitError;

	try {
		const result = await handler(params, ctx);
		return {
			content: [{ type: "text", text: JSON.stringify(result) }],
		};
	} catch (err: unknown) {
		return errorResponse(err);
	}
}

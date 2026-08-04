import type { ToolContext } from "../types";

// The one CallToolResult shape both ext-apps' SDK version and the v2 server accept.
export interface ToolCallResult {
	content: { type: "text"; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
	[key: string]: unknown;
}

export const READ_ONLY_ANNOTATIONS = {
	readOnlyHint: true,
	idempotentHint: true,
	openWorldHint: true,
} as const;

async function checkRateLimit(ctx: ToolContext): Promise<ToolCallResult | null> {
	if (!ctx.props.isFreeTier || ctx.props.isDev || ctx.props.isVerifiedHost) return null;
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

export function errorResponse(err: unknown): ToolCallResult {
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
			params,
			client_ip: ctx.props.clientIP,
			user_agent: ctx.props.userAgent,
			tier: ctx.props.isFreeTier ? "free" : "api_key",
			verified_host: ctx.props.isVerifiedHost,
			...(errorMessage ? { error: errorMessage } : {}),
		}),
	);
}

interface RunToolOptions<P, R> {
	summarize?: (result: R, params: P) => string;
}

export async function runTool<P, R extends Record<string, unknown>>(
	toolName: string,
	ctx: ToolContext,
	params: P,
	handler: (params: P) => Promise<R>,
	options?: RunToolOptions<P, R>,
): Promise<ToolCallResult> {
	const rateLimitError = await checkRateLimit(ctx);
	if (rateLimitError) {
		logToolCall(toolName, ctx, "rate_limited", params);
		return rateLimitError;
	}

	try {
		const structuredContent = await handler(params);
		logToolCall(toolName, ctx, "success", params);
		return {
			content: [
				{
					type: "text",
					text: options?.summarize
						? options.summarize(structuredContent, params)
						: JSON.stringify(structuredContent),
				},
			],
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

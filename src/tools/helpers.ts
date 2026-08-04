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
	outcome: "success" | "error",
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

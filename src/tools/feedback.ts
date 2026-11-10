import type { McpServer } from "@modelcontextprotocol/server";

import { submitFeedback } from "../channel3/feedback";
import { SubmitFeedbackSchema } from "../schemas";
import { resolveThreadId, THREAD_ID_TOOL_DESCRIPTION, threadIdSummaryLines } from "../thread";
import type { ToolContext } from "../types";
import { runTool } from "./helpers";

export function registerFeedbackTool(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		"submit_feedback",
		{
			title: "Submit Feedback",
			description:
				"Report a problem with Channel3's results or tools to the Channel3 team, such as wrong " +
				"product data, an error, or slow responses. Include the product IDs and what happened. " +
				"Leave out secrets and personal data. Not for messages to retailers. " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: SubmitFeedbackSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async (params) => {
			const threadId = resolveThreadId(params.thread_id);
			return runTool(
				"submit_feedback",
				ctx,
				params,
				async (p) => ({
					...(await submitFeedback(ctx.props.apiKey, p, ctx.props.baseURL, threadId)),
					thread_id: threadId,
				}),
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							"Sent the feedback to the Channel3 team.",
							`feedback_id: ${r.feedback_id}`,
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		},
	);
}

import type { McpServer } from "@modelcontextprotocol/server";

import { MCP_REVIEWER_NAME, submitReview } from "../channel3/reviews";
import { SubmitProductReviewSchema } from "../schemas";
import { resolveThreadId, THREAD_ID_TOOL_DESCRIPTION, threadIdSummaryLines } from "../thread";
import type { ToolContext } from "../types";
import { runTool } from "./helpers";

export function registerReviewTool(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		"submit_product_review",
		{
			title: "Submit Product Review",
			description:
				"Post a star rating (1-5) and optional written review of a product on Channel3. " +
				"Reviews are public and permanent: they cannot be edited or deleted. Call only when the user " +
				"asks to post a review and has confirmed the rating and text you will send. " +
				`Reviews are posted anonymously, shown as '${MCP_REVIEWER_NAME}'. ` +
				"One review per product per conversation. " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: SubmitProductReviewSchema,
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
				"submit_product_review",
				ctx,
				params,
				async (p) => {
					const review = await submitReview(
						ctx.props.apiKey,
						p,
						ctx.props.baseURL,
						threadId,
					);
					return {
						review_id: review.id,
						product_id: review.product_id,
						rating: review.rating,
						created_at: review.created_at,
						thread_id: threadId,
					};
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							`Posted a ${r.rating}/5 review of product ${r.product_id}. It is public and can't be changed.`,
							`review_id: ${r.review_id}`,
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		},
	);
}

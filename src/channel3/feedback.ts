import type { z } from "zod";

import type { SubmitFeedbackSchema } from "../schemas";
import { createClient, withStatusMessages } from "./client";

export async function submitFeedback(
	apiKey: string,
	params: z.infer<typeof SubmitFeedbackSchema>,
	baseURL: string | undefined,
	threadId: string,
): Promise<{ feedback_id: string; created_at: string }> {
	try {
		const res = await createClient(apiKey, baseURL, threadId).reporting.submitFeedback({
			category: params.category,
			description: params.description,
			// The "mcp:" prefix lets #support tell MCP feedback from direct API calls.
			...(params.affected_tool ? { endpoint: `mcp:${params.affected_tool}` } : {}),
		});
		return { feedback_id: res.feedback_id, created_at: new Date(res.created_at).toISOString() };
	} catch (err) {
		throw withStatusMessages(err, {
			429: "Feedback limit reached for this API key (100 a day). Try again tomorrow.",
		});
	}
}

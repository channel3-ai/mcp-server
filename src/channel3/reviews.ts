import type { ProductReviewResponse } from "@channel3/sdk/resources";
import type { z } from "zod";

import type { SubmitProductReviewSchema } from "../schemas";
import { createClient, withStatusMessages } from "./client";

// Every review from the MCP is anonymous, whoever calls and whatever key they use.
export const MCP_REVIEWER_NAME = "Anonymous user from MCP";

// The MCP has no end-user identity, so the conversation stands in for the user: the backend
// allows one review per user_id and product, which turns a retried call into a 409, not a duplicate.
export async function submitReview(
	apiKey: string,
	params: z.infer<typeof SubmitProductReviewSchema>,
	baseURL: string | undefined,
	threadId: string,
): Promise<ProductReviewResponse> {
	try {
		return await createClient(apiKey, baseURL, threadId).products.submitReview({
			product_id: params.product_id,
			rating: params.rating,
			review_text: params.review_text,
			reviewer: { type: params.reviewer_type, display_name: MCP_REVIEWER_NAME },
			user_id: threadId,
		});
	} catch (err) {
		throw withStatusMessages(err, {
			404: "Product not found. Use a product ID from a search_products or get_products result.",
			409: "This product was already reviewed in this conversation. Reviews can't be changed.",
			429: "Too many review requests right now. Try again later.",
		});
	}
}

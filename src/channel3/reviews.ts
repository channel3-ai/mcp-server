import type { ProductReviewResponse } from "@channel3/sdk/resources";
import type { z } from "zod";

import type { ListProductReviewsSchema, SubmitProductReviewSchema } from "../schemas";
import { createClient, withStatusMessages } from "./client";

const PRODUCT_NOT_FOUND =
	"Product not found. Use a product ID from a search_products or get_products result.";
const RATE_LIMITED = "Too many review requests right now. Try again later.";

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
			reviewer: { type: params.reviewer_type, display_name: params.display_name },
			user_id: threadId,
		});
	} catch (err) {
		throw withStatusMessages(err, {
			404: PRODUCT_NOT_FOUND,
			409: "This product was already reviewed in this conversation. Reviews can't be changed.",
			429: RATE_LIMITED,
		});
	}
}

export async function listReviews(
	apiKey: string,
	params: z.infer<typeof ListProductReviewsSchema>,
	baseURL: string | undefined,
	threadId: string,
): Promise<{ reviews: ProductReviewResponse[]; next_cursor: string | null }> {
	try {
		const page = await createClient(apiKey, baseURL, threadId).products.listReviews({
			product_id: params.product_id,
			cursor: params.cursor,
			limit: params.limit,
			reviewer_type: params.reviewer_type,
		});
		return { reviews: page.data, next_cursor: page.response.next_cursor ?? null };
	} catch (err) {
		throw withStatusMessages(err, { 404: PRODUCT_NOT_FOUND, 429: RATE_LIMITED });
	}
}

import { z } from "zod";

const searchCriteria = {
	query: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			"One product type and its constraints in natural language " +
				"(brand, color, material, size, price, gender).\n" +
				'Good: "red leather jacket under $200"; "leather golf glove under $40".\n' +
				'Bad: "gift ideas for dad"; "cool sneakers"; "golf glove or rangefinder".',
		),
	image_url: z
		.string()
		.optional()
		.describe("Public image URL for visual search. Combine with `query` for text + image."),
};

const threadIdPassthrough = z.string().optional();

const threadIdParam = threadIdPassthrough.describe(
	"Conversation thread ID. Omit ONLY on the very first Channel3 call of a conversation. " +
		"From then on, always pass the `thread_id` from the most recent Channel3 result, unchanged — " +
		"even when the new call is a completely different product search.",
);

export const SearchRequestSchema = z
	.object({ ...searchCriteria, thread_id: threadIdParam })
	.refine((data) => Boolean(data.query || data.image_url), {
		message: "At least one of `query` or `image_url` is required.",
	});

export const GetProductsRequestSchema = z.object({
	product_ids: z
		.array(z.string().describe("Product ID (from a `search_products` result) or URL."))
		.min(1)
		.max(40)
		.describe("Products to fetch in parallel."),
	thread_id: threadIdParam,
});

const reviewProductId = z
	.string()
	.trim()
	.min(1)
	.describe("Channel3 product ID from a search_products or get_products result.");

const reviewerType = z.enum(["human", "agent"]);

// Length limits mirror the backend's, so bad input fails here with a clear message.
export const SubmitProductReviewSchema = z.object({
	product_id: reviewProductId,
	rating: z.number().int().min(1).max(5).describe("Star rating from 1 to 5."),
	review_text: z.string().trim().min(1).max(4000).optional().describe("Optional written review."),
	reviewer_type: reviewerType.describe(
		"`human` when the rating and text are the user's own, `agent` when they are your own assessment.",
	),
	display_name: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.optional()
		.describe(
			"Name shown publicly with the review. Only use a name the user gave for this. Omit to show 'Anonymous reviewer'.",
		),
	thread_id: threadIdParam,
});

export const SubmitFeedbackSchema = z.object({
	category: z.enum([
		"error_response",
		"performance",
		"incorrect_behavior",
		"data_issue",
		"documentation",
		"other",
	]),
	description: z
		.string()
		.trim()
		.min(1)
		.max(4000)
		.describe(
			"What happened, with the inputs, product IDs and errors needed to reproduce it. Leave out secrets and personal data.",
		),
	affected_tool: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.optional()
		.describe("The Channel3 tool where the problem happened, e.g. get_products."),
	thread_id: threadIdParam,
});

export const BrowseProductsSchema = z
	.object({
		...searchCriteria,
		page_token: z
			.string()
			.optional()
			.describe("Token from a previous response's next_page_token."),
		limit: z.number().int().min(1).max(30).default(20),
		thread_id: threadIdPassthrough,
		device_id: z.string().optional(),
	})
	.refine((data) => Boolean(data.query || data.image_url || data.page_token), {
		message: "At least one of `query`, `image_url`, or `page_token` is required.",
	});

export const GetSimilarSchema = z.object({
	product_id: z.string().describe("Canonical product ID to find similar products for."),
	limit: z.number().int().min(1).max(30).default(20),
	thread_id: threadIdPassthrough,
	device_id: z.string().optional(),
});

export const ProductIdRequestSchema = z.object({
	product_id: z.string().describe("Canonical product ID."),
	selected_options: z
		.record(z.string(), z.string())
		.optional()
		.describe("Variant configuration as `{ optionName: label }` for re-resolving offers."),
	thread_id: threadIdPassthrough,
	device_id: z.string().optional(),
});

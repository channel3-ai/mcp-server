import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const usdAmount = (description: string) =>
	z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Enter a numeric USD amount, e.g. '50'")
		.optional()
		.describe(description);

const STOREFRONT_NOTE =
	"Results appear as product cards in the storefront UI — recommend and compare; " +
	"do not re-list what the user can see.";
const THREAD_ID_NOTE =
	"Every Channel3 result includes a thread_id — pass it back unchanged as thread_id on every " +
	"subsequent Channel3 call in this conversation, even for unrelated searches.";

function userPrompt(lines: string[]) {
	return {
		messages: [
			{
				role: "user" as const,
				content: { type: "text" as const, text: lines.join("\n") },
			},
		],
	};
}

// The intent-decomposition pattern: compile a vague shopping goal into one
// concrete search_products call per product type.
function searchPlan(request: string[]): string[] {
	return [
		...request,
		"",
		"Plan before calling tools:",
		"1. Break the request into two to four concrete product types.",
		"2. Make one search_products call per product type, sent together.",
		"3. Put every constraint (price, brand, color, size, style) into the query for its product type.",
		'Example: "an outfit for a night out" → "little black dresses under $150", "heeled sandals", "clutch bags".',
		"",
		STOREFRONT_NOTE,
		THREAD_ID_NOTE,
	];
}

export function registerPrompts(server: McpServer) {
	server.registerPrompt(
		"shop",
		{
			title: "Shop for Anything",
			description: "Turn any shopping goal — a gift, an outfit, a project — into products.",
			argsSchema: z.object({
				intent: z
					.string()
					.describe(
						"What you're shopping for, e.g. 'an outfit for a night out' or " +
							"'a housewarming gift for new neighbors'",
					),
				budget: usdAmount("Maximum total price in USD, e.g. '150'"),
			}),
		},
		({ intent, budget }) => {
			const request = [`Help me shop for: ${intent}.`];
			if (budget) {
				request.push(`Keep the total under $${budget}.`);
			}
			return userPrompt(searchPlan(request));
		},
	);

	server.registerPrompt(
		"find-gift",
		{
			title: "Find a Gift",
			description: "Gift ideas tailored to a person, occasion, and budget.",
			argsSchema: z.object({
				recipient: z.string().describe("Who the gift is for, e.g. 'my dad who loves golf'"),
				occasion: z.string().optional().describe("Occasion, e.g. 'birthday'"),
				budget: usdAmount("Maximum price in USD, e.g. '50'"),
			}),
		},
		({ recipient, occasion, budget }) => {
			const request = [`Find a gift for ${recipient}.`];
			if (occasion) {
				request.push(`The occasion is ${occasion}.`);
			}
			if (budget) {
				request.push(`The maximum price is $${budget}.`);
			}
			return userPrompt(searchPlan(request));
		},
	);

	server.registerPrompt(
		"price-check",
		{
			title: "Price Check",
			description: "Find the cheapest in-stock offer for a product URL.",
			argsSchema: z.object({
				product_url: z
					.string()
					.describe("Product page URL from any retailer, or a Channel3 product/buy URL"),
			}),
		},
		({ product_url }) =>
			userPrompt([
				`Find the best place to buy this product: ${product_url}.`,
				"",
				"Call get_products with the URL to get every retailer offer.",
				"Compare in-stock offers on total price, including shipping when shown.",
				"Lead with the cheapest in-stock option — merchant and total price — " +
					"then briefly note the alternatives.",
				"If the cheapest offer is out of stock, say so and give the best available price instead.",
				"",
				THREAD_ID_NOTE,
			]),
	);

	server.registerPrompt(
		"find-dupes",
		{
			title: "Find Dupes",
			description: "Find lookalike products from an image.",
			argsSchema: z.object({
				image_url: z
					.string()
					.describe(
						"Public URL of the product image to match (screenshot, social post, etc.)",
					),
				target_price: usdAmount("Target max price in USD for the alternatives, e.g. '75'"),
			}),
		},
		({ image_url, target_price }) => {
			const lines = [
				`Find products that look like the item in this image: ${image_url}.`,
				"",
				"Call search_products with image_url set to this image URL. " +
					"If you can tell what the item is, add a short query naming the product type " +
					'(e.g. "white leather sneakers") to sharpen the match.',
			];
			if (target_price) {
				lines.push(`Only suggest alternatives under $${target_price}.`);
			}
			lines.push("", STOREFRONT_NOTE, THREAD_ID_NOTE);
			return userPrompt(lines);
		},
	);

	server.registerPrompt(
		"compare-products",
		{
			title: "Compare Products",
			description: "Compare products side by side on price, offers, and specs.",
			argsSchema: z.object({
				products: z
					.array(z.string().describe("Retailer URL or Channel3 product ID"))
					.min(2)
					.max(6)
					.describe("The products to compare (2–6 URLs or product IDs)"),
			}),
		},
		({ products }) =>
			userPrompt([
				`Compare these products: ${products.join(", ")}.`,
				"",
				"Call get_products once with all of them.",
				"Compare cheapest in-stock offer, key specs, and ratings for each.",
				"End with a clear recommendation and who each option suits best.",
				"",
				STOREFRONT_NOTE,
				THREAD_ID_NOTE,
			]),
	);

	server.registerPrompt(
		"find-deals",
		{
			title: "Find Deals",
			description: "Hunt down the best prices on a product type across retailers.",
			argsSchema: z.object({
				what: z.string().describe("Product type, e.g. 'noise-cancelling headphones'"),
				budget: usdAmount("Maximum price in USD, e.g. '100'"),
			}),
		},
		({ what, budget }) => {
			const lines = [`Find the best deals on ${what}.`];
			if (budget) {
				lines.push(`Only consider options under $${budget}.`);
			}
			lines.push(
				"",
				"Search with search_products, putting the constraints in the query.",
				"Then call get_products on the most promising results to compare live offers across retailers.",
				"Highlight the cheapest in-stock option and any notable price gaps between retailers.",
				"",
				STOREFRONT_NOTE,
				THREAD_ID_NOTE,
			);
			return userPrompt(lines);
		},
	);
}

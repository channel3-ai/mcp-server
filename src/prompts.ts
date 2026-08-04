import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
	server.registerPrompt(
		"find-gift",
		{
			title: "Find a Gift",
			description:
				"Build a gift shortlist for someone: decomposes the request into targeted " +
				"product searches and compares live prices across retailers.",
			argsSchema: z.object({
				recipient: z.string().describe("Who the gift is for, e.g. 'my dad who loves golf'"),
				occasion: z.string().optional().describe("Occasion, e.g. 'birthday'"),
				budget: z.string().optional().describe("Maximum price in USD, e.g. '50'"),
			}),
		},
		({ recipient, occasion, budget }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							`Help me find a gift for ${recipient}${occasion ? ` (${occasion})` : ""}` +
							(budget ? `, budget under $${budget}` : "") +
							". Use the Channel3 tools:\n" +
							"1. Brainstorm 2-3 distinct gift angles, then call search_products once " +
							"per angle with a specific natural-language query (put all constraints " +
							"inline in the query — category, price range, style — since search takes " +
							"no filter parameters).\n" +
							"2. From the results, shortlist 3-5 items. For each, cite the title, " +
							"brand, the cheapest in-stock offer (price + retailer domain), and that " +
							"offer's buy URL — always link the offer's buy URL, never a guessed " +
							"retailer page.\n" +
							"3. If the top pick needs a closer look (variants, materials, more " +
							"images), call get_products with its id before recommending it.",
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"price-check",
		{
			title: "Price Check",
			description:
				"Look up any product by URL and find the cheapest in-stock retailer, " +
				"with search fallbacks if it's unavailable.",
			argsSchema: z.object({
				product_url: z
					.string()
					.describe("Product page URL from any retailer, or a Channel3 product/buy URL"),
			}),
		},
		({ product_url }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							`Find the best place to buy ${product_url}. Use the Channel3 tools:\n` +
							"1. Call get_products with the URL in product_ids — it resolves product " +
							"pages from any retailer, not just Channel3 links.\n" +
							"2. Compare the offers: list every retailer with its live price and " +
							"availability, and call out the cheapest in-stock option with its buy " +
							"URL (link the offer's buy URL, not the retailer homepage).\n" +
							"3. If nothing is in stock, call search_products with the product's " +
							"title and key attributes to find the same or a near-identical item " +
							"elsewhere, and report those alternatives instead.",
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"find-dupes",
		{
			title: "Find Dupes",
			description:
				"Visual search from an image: find lookalike products, usually at lower " +
				"price points.",
			argsSchema: z.object({
				image_url: z
					.string()
					.describe(
						"Public URL of the product image to match (screenshot, social post, etc.)",
					),
				target_price: z
					.string()
					.optional()
					.describe("Target max price in USD for the alternatives, e.g. '75'"),
			}),
		},
		({ image_url, target_price }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							`Find products that look like the item in this image: ${image_url}` +
							(target_price ? `, ideally under $${target_price}` : "") +
							". Use the Channel3 tools:\n" +
							"1. Call search_products with image_url set to the image URL. If you " +
							"can tell what the item is, also pass a short query describing it " +
							"(category, color, style" +
							(target_price ? `, 'under $${target_price}'` : "") +
							") — text + image together narrows results.\n" +
							"2. Present the closest matches sorted by price, each with title, " +
							"brand, cheapest in-stock offer (price + retailer), and the offer's " +
							"buy URL.\n" +
							"3. Note briefly how close each match is (exact item vs. similar " +
							"style); call get_products on any exact-looking matches to confirm.",
					},
				},
			],
		}),
	);
}

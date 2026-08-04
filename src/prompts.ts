import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
	server.registerPrompt(
		"find-gift",
		{
			title: "Find a Gift",
			description: "Find gift ideas for a person with one product search.",
			argsSchema: z.object({
				recipient: z.string().describe("Who the gift is for, e.g. 'my dad who loves golf'"),
				occasion: z.string().optional().describe("Occasion, e.g. 'birthday'"),
				budget: z.string().optional().describe("Maximum price in USD, e.g. '50'"),
			}),
		},
		({ recipient, occasion, budget }) => {
			const lines = [`Find a gift for ${recipient}.`];
			if (occasion) {
				lines.push(`The occasion is ${occasion}.`);
			}
			if (budget) {
				lines.push(`The maximum price is $${budget}.`);
			}
			lines.push(
				"Put all product types in one search_products queries array " +
					'(example: ["leather golf glove under $40", "rangefinder under $40"]).',
			);
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: lines.join("\n"),
						},
					},
				],
			};
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
		({ product_url }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `Find the best place to buy this product: ${product_url}.`,
					},
				},
			],
		}),
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
				target_price: z
					.string()
					.optional()
					.describe("Target max price in USD for the alternatives, e.g. '75'"),
			}),
		},
		({ image_url, target_price }) => {
			const lines = [`Find products that look like the item in this image: ${image_url}.`];
			if (target_price) {
				lines.push(`The maximum price is $${target_price}.`);
			}
			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: lines.join("\n"),
						},
					},
				],
			};
		},
	);
}

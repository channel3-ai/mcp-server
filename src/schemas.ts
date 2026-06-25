import { z } from "zod";

export const SearchRequestSchema = z.object({
  query: z
    .string()
    .describe(
      "Free-text search query, or a product URL to look up. You can include brand names, product types, attributes, colors, etc.",
    ),
  image_url: z
    .string()
    .optional()
    .describe("Public image URL to find visually similar products."),
  min_price: z
    .number()
    .optional()
    .describe("Minimum price in USD (inclusive), in dollars and cents."),
  max_price: z
    .number()
    .optional()
    .describe("Maximum price in USD (inclusive), in dollars and cents."),
  brands: z
    .array(z.string())
    .optional()
    .describe('Brand names to filter by (e.g. ["Nike", "Adidas"]).'),
  websites: z
    .array(z.string())
    .optional()
    .describe('Domains to filter by (e.g. ["nike.com"]).'),
  gender: z
    .enum(["male", "female", "unisex"])
    .optional()
    .describe("Filter by intended gender."),
});

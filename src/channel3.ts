import Channel3 from "@channel3/sdk";

import type { z } from "zod";

import type { SearchRequestSchema } from "./schemas";

/** Strips deprecated fields/variants and trims images + offers to reduce response size. */
function trimProductPayload(product: any) {
  const { image_urls, image_url, url, price, availability, brand_id, brand_name, variants, ...rest } = product;

  if (rest.images) {
    rest.images = rest.images
      .slice(0, 3)
      .map(({ photo_quality, ...img }: any) => img);
  }

  if (rest.offers) {
    const inStock = rest.offers.filter((o: any) => o.availability === "InStock");
    const source = inStock.length > 0 ? inStock : rest.offers;
    rest.offers = source.map(({ max_commission_rate, ...offer }: any) => offer);
  }

  return rest;
}

function normalizeUrl(candidate: string): string | null {
  const trimmed = candidate.trim().replace(/^[("'[]+|[)"'\],.!?;:]+$/g, "");
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    return /\.[a-z]{2,}$/i.test(parsed.hostname) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function looksLikeUrl(query: string): string | null {
  const matches = query.match(
    /https?:\/\/[^\s]+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/gi,
  );
  if (!matches) return null;

  for (const match of matches) {
    const url = normalizeUrl(match);
    if (url) return url;
  }

  return null;
}

/** Resolves website and brand IDs from names. */
async function resolveIds(
  names: string[] | undefined,
  finder: (query: string) => Promise<any>,
): Promise<string[]> {
  if (!names?.length) return [];
  const results = await Promise.all(names.map((name) => finder(name)));
  return results.filter((r) => r?.id).map((r) => r.id);
}

export async function searchProducts(
  apiKey: string,
  params: z.infer<typeof SearchRequestSchema>,
): Promise<any[]> {
  const client = new Channel3({ apiKey });

  const queryUrl = looksLikeUrl(params.query);

  if (queryUrl) {
    const data = await client.enrich.enrichURL({
      url: queryUrl,
    });
    return [trimProductPayload(data)];
  }

  const [brandIds, websiteIds] = await Promise.all([
    resolveIds(params.brands, (q) => client.brands.find({ query: q })),
    resolveIds(params.websites, (q) => client.websites.find({ query: q })),
  ]);

  const data = await client.search.perform({
    query: params.query,
    image_url: params.image_url,
    filters: {
      availability: ["InStock"],
      gender: params.gender,
      price:
        params.min_price !== undefined || params.max_price !== undefined
          ? {
              min_price: params.min_price,
              max_price: params.max_price,
            }
          : undefined,
      brand_ids: brandIds.length > 0 ? brandIds : undefined,
      website_ids: websiteIds.length > 0 ? websiteIds : undefined,
    },
  });

  return data.products.map(trimProductPayload);
}

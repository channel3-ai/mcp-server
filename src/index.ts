import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";

type Bindings = Env;

const app = new Hono<{
  Bindings: Bindings;
}>();

type Props = {
  apiKey: string;
};

type State = null;

const BASE_URL = "https://api.trychannel3.com/v0";

// Define Zod schemas matching the OpenAPI spec (keep simple to avoid deep type instantiation)
const SearchFilterPriceSchema = z
  .object({
    min_price: z
      .number()
      .optional()
      .describe("Minimum price to include in results (vendor currency units)."),
    max_price: z
      .number()
      .optional()
      .describe("Maximum price to include in results (vendor currency units)."),
  })
  .describe("Price range filter");

const AvailabilityStatusSchema = z
  .enum([
    "InStock",
    "OutOfStock",
    "PreOrder",
    "LimitedAvailability",
    "BackOrder",
    "Discontinued",
    "SoldOut",
    "Unknown",
  ])
  .describe("Availability status filter");

const SearchFiltersSchema = z
  .object({
    brand_ids: z
      .array(z.string())
      .optional()
      .describe(
        "Filter by brand IDs (not brand names). Brand names can also be included in 'query' and will be parsed automatically."
      ),
    gender: z
      .enum(["male", "female", "unisex"])
      .optional()
      .describe("Filter by intended gender"),
    price: SearchFilterPriceSchema.optional().describe("Filter by price range"),
    availability: z
      .array(AvailabilityStatusSchema)
      .optional()
      .describe("Filter by one or more availability statuses"),
  })
  .describe("Structured filters to refine search results");

const SearchRequestSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Free-text search. You can include brand names, product types, attributes, colors, pricing, etc."
      ),
    image_url: z
      .string()
      .optional()
      .describe("Public URL of an image to find visually similar products"),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of results to return. Defaults to 20."),
    filters: SearchFiltersSchema.optional().describe(
      "Optional structured filters"
    ),
    context: z
      .string()
      .optional()
      .describe(
        "Optional end-user context (preferences, style, size, budget, purpose). Helps ranking and disambiguation."
      ),
  })
  .describe(
    "Search request. Provide either 'query' or 'image_url' (or both), plus optional filters and user context."
  );

export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer({
    name: "Channel3",
    version: "1.0.0",
    // Explicitly advertise tools capability; tool list is static
    capabilities: { tools: { listChanged: false } } as unknown as any,
  } as any);

  async init() {
    this.server.tool(
      "search",
      "Search products",
      SearchRequestSchema.shape,
      { readOnlyHint: true } as any,
      async (params: z.infer<typeof SearchRequestSchema>, extra) => {
        try {
          // Apply runtime defaults to avoid coupling defaults to Zod types
          const requestBody = {
            ...params,
            limit: params.limit ?? 20,
            filters: params.filters ?? {},
          } as any;

          const resp = await fetch(`${BASE_URL}/search`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.props.apiKey,
            },
            body: JSON.stringify(requestBody),
          });

          if (!resp.ok) {
            const errorText = await resp.text().catch(() => "");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Search failed (${resp.status}): ${
                    errorText || resp.statusText
                  }`,
                },
              ],
              isError: true,
            };
          }

          const data = await resp.json();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Search error: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    const GetProductDetailSchema = z
      .object({ product_id: z.string().describe("Channel3 product ID") })
      .describe("Retrieve product details by ID");
    this.server.tool(
      "get_product_detail",
      "Get product detail",
      GetProductDetailSchema.shape,
      { readOnlyHint: true } as any,
      async (params: z.infer<typeof GetProductDetailSchema>, extra) => {
        const { product_id } = params;
        try {
          const resp = await fetch(`${BASE_URL}/products/${product_id}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.props.apiKey,
            },
          });
          if (!resp.ok) {
            const errorText = await resp.text().catch(() => "");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Get product failed (${resp.status}): ${
                    errorText || resp.statusText
                  }`,
                },
              ],
              isError: true,
            };
          }
          const data = await resp.json();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Get product error: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    const GetBrandsSchema = z
      .object({
        query: z.string().optional().describe("Filter brands by name"),
        page: z.number().int().optional().describe("Page number (1-based)"),
        size: z
          .number()
          .int()
          .optional()
          .describe("Page size (defaults upstream if omitted)"),
      })
      .describe("List brands with optional filtering and pagination");
    this.server.tool(
      "get_brands",
      "List brands",
      GetBrandsSchema.shape,
      { readOnlyHint: true } as any,
      async (params: z.infer<typeof GetBrandsSchema>, extra) => {
        try {
          const url = new URL(`${BASE_URL}/brands`);

          if (params.query !== undefined) {
            url.searchParams.append("query", params.query);
          }
          if (params.page !== undefined) {
            url.searchParams.append("page", params.page.toString());
          }
          if (params.size !== undefined) {
            url.searchParams.append("size", params.size.toString());
          }

          const resp = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.props.apiKey,
            },
          });

          if (!resp.ok) {
            const errorText = await resp.text().catch(() => "");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Get brands failed (${resp.status}): ${
                    errorText || resp.statusText
                  }`,
                },
              ],
              isError: true,
            };
          }

          const data = await resp.json();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Get brands error: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    const GetBrandDetailSchema = z
      .object({ brand_id: z.string().describe("Channel3 brand ID") })
      .describe("Retrieve brand details by ID");
    this.server.tool(
      "get_brand_detail",
      "Get brand detail",
      GetBrandDetailSchema.shape,
      { readOnlyHint: true } as any,
      async (params: z.infer<typeof GetBrandDetailSchema>, extra) => {
        const { brand_id } = params;
        try {
          const resp = await fetch(`${BASE_URL}/brands/${brand_id}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.props.apiKey,
            },
          });
          if (!resp.ok) {
            const errorText = await resp.text().catch(() => "");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Get brand failed (${resp.status}): ${
                    errorText || resp.statusText
                  }`,
                },
              ],
              isError: true,
            };
          }
          const data = await resp.json();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Get brand error: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}

// Simple auth wrapper that sets ctx.props for the DO so it can forward the API key
const withAuth = (
  handler: (
    req: Request,
    env: Bindings,
    ctx: ExecutionContext
  ) => Promise<Response>
) => {
  return (req: Request, env: Bindings, ctx: ExecutionContext) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Bearer token required", { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    if (!apiKey) {
      return new Response("API Key required", { status: 401 });
    }

    // Expose props to the Durable Object bootstrap via workers-mcp
    (ctx as any).props = { apiKey } as Props;
    return handler(req, env, ctx);
  };
};

// Streamable HTTP transport (POST "/")
app.mount("/", withAuth(MyMCP.serve("/").fetch));

// SSE transport (GET "/sse" and POST "/sse/message")
app.mount("/sse", withAuth(MyMCP.serveSSE("/sse").fetch));

export default app;

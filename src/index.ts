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
  });

  async init() {
    const searchParamsShape = {
      query: z.string().optional(),
      image_url: z.string().optional(),
      limit: z.number().int().optional(),
      filters: z
        .object({
          brand_ids: z.array(z.string()).optional(),
          gender: z.enum(["male", "female", "unisex"]).optional(),
          price: z
            .object({
              min_price: z.number().optional(),
              max_price: z.number().optional(),
            })
            .optional(),
          availability: z.array(AvailabilityStatusSchema).optional(),
        })
        .optional(),
    } as const;

    this.server.tool(
      "search",
      SearchRequestSchema.shape as any,
      async (params, extra) => {
        // Apply runtime defaults to avoid coupling defaults to Zod types
        const requestBody = {
          ...params,
          limit: params.limit ?? 20,
          filters: params.filters ?? {},
        } as any;

        const searchResp = await fetch(`${BASE_URL}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
          body: JSON.stringify(requestBody),
        });
        const data = await searchResp.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    const getProductDetailShape = { product_id: z.string() } as const;
    this.server.tool(
      "get_product_detail",
      getProductDetailShape as any,
      async ({ product_id }, extra) => {
        const productResp = await fetch(`${BASE_URL}/products/${product_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await productResp.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    const getBrandsShape = {
      query: z.string().optional(),
      page: z.number().int().optional(),
      size: z.number().int().optional(),
    } as const;
    this.server.tool(
      "get_brands",
      getBrandsShape as any,
      async (params, extra) => {
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

        const brandsResp = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await brandsResp.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    const getBrandDetailShape = { brand_id: z.string() } as const;
    this.server.tool(
      "get_brand_detail",
      getBrandDetailShape as any,
      async ({ brand_id }, extra) => {
        const brandResp = await fetch(`${BASE_URL}/brands/${brand_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await brandResp.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
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

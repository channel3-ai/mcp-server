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
// const BASE_URL = "http://localhost:8000/v0";

// Define Zod schemas matching the OpenAPI spec
const SearchFilterPriceSchema = z.object({
  min_price: z.number().nullable().optional(),
  max_price: z.number().nullable().optional(),
});

const AvailabilityStatusSchema = z.enum([
  "InStock",
  "OutOfStock",
  "PreOrder",
  "LimitedAvailability",
  "BackOrder",
  "Discontinued",
  "SoldOut",
  "Unknown",
]);

const SearchFiltersSchema = z.object({
  brand_ids: z.array(z.string()).nullable().optional(),
  gender: z.enum(["male", "female", "unisex"]).nullable().optional(),
  price: SearchFilterPriceSchema.nullable().optional(),
  availability: z.array(AvailabilityStatusSchema).nullable().optional(),
});

const SearchRequestSchema = z.object({
  query: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  limit: z.number().int().nullable().optional().default(20),
  filters: SearchFiltersSchema.optional().default({}),
});

export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer({
    name: "Channel3",
    version: "1.0.0",
  });

  async init() {
    this.server.tool(
      "search",
      "Search for products that match a query with optional filters",
      SearchRequestSchema.shape,
      async (params, extra) => {
        const response = await fetch(`${BASE_URL}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
          body: JSON.stringify(params),
        });
        const data = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    this.server.tool(
      "get_product_detail",
      "Get detailed information about a specific product by its ID",
      { product_id: z.string() },
      async ({ product_id }, extra) => {
        const response = await fetch(`${BASE_URL}/products/${product_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    this.server.tool(
      "get_brands",
      "Get all brands that the vendor currently sells with optional query",
      {
        query: z.string().nullable().optional(),
        page: z.number().int().optional().default(1),
        size: z.number().int().optional().default(100),
      },
      async (params, extra) => {
        const url = new URL(`${BASE_URL}/brands`);

        if (params.query !== null && params.query !== undefined) {
          url.searchParams.append("query", params.query);
        }
        if (params.page !== undefined) {
          url.searchParams.append("page", params.page.toString());
        }
        if (params.size !== undefined) {
          url.searchParams.append("size", params.size.toString());
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );

    this.server.tool(
      "get_brand_detail",
      "Get detailed information for a specific brand by its ID",
      { brand_id: z.string() },
      async ({ brand_id }, extra) => {
        const response = await fetch(`${BASE_URL}/brands/${brand_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.props.apiKey,
          },
        });
        const data = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      }
    );
  }
}

app.mount("/", (req, env, ctx) => {
  // This could technically be pulled out into a middleware function, but is left here for clarity
  console.log(req.headers);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Bearer token required, passed in: ", authHeader);
    console.log("all headers: ", req.headers);
    return new Response("Bearer token required", { status: 401 });
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer " prefix
  if (!apiKey) {
    return new Response("API Key required", { status: 401 });
  }

  ctx.props = {
    apiKey,
    // could also add arbitrary headers/parameters here to pass into the MCP client
  };

  return MyMCP.mount("/sse").fetch(req, env, ctx);
});

export default app;

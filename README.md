# Channel3 MCP Server

Search 100M+ products across thousands of retailers, with live prices and affiliate-aware buy URLs.

- **Transport**: Streamable HTTP (protocol revision `2026-07-28`, stateless)
- **Endpoint**: `https://mcp.trychannel3.com/`
- **Tools**: `search_products`, `get_products`
- **Prompts**: `find-gift`, `price-check`, `find-dupes`

## Quick Start (Free Tier)

No API key required. Connect directly and start searching:

```
https://mcp.trychannel3.com/
```

The free tier is rate-limited to **10 requests per minute** per IP address. If you hit the limit, you'll receive an error response.

## Unlimited Access

For unlimited usage and affiliate tracking, create an account at [trychannel3.com](https://trychannel3.com), create an API key, and send it as an **`X-API-Key` header** on requests to the MCP endpoint.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Channel3": {
      "url": "https://mcp.trychannel3.com/",
      "headers": {
        "X-API-Key": "<your-api-key>"
      }
    }
  }
}
```

To use the free tier (no API key, rate-limited), omit the `headers` block.

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "Channel3": {
      "type": "http",
      "url": "https://mcp.trychannel3.com/",
      "headers": {
        "X-API-Key": "<your-api-key>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http Channel3 "https://mcp.trychannel3.com/" --header "X-API-Key: <your-api-key>"
```

### Claude Desktop

Add the Channel3 server under **Settings → Connectors** with the URL `https://mcp.trychannel3.com/`, or add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Channel3": {
      "type": "http",
      "url": "https://mcp.trychannel3.com/",
      "headers": {
        "X-API-Key": "<your-api-key>"
      }
    }
  }
}
```

### OpenAI Agents SDK (Python)

```python
import asyncio
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async def main():
    async with MCPServerStreamableHttp(
        name="Channel3",
        params={
            "url": "https://mcp.trychannel3.com/",
            "headers": {"X-API-Key": "<your-api-key>"},
        },
        cache_tools_list=True,
    ) as server:
        agent = Agent(
            name="Shopping Agent",
            instructions="You are a personal shopping assistant.",
            mcp_servers=[server],
        )
        result = await Runner.run(agent, "I'm looking for a new laptop")
        print(result.final_output)

asyncio.run(main())
```

### OpenAI Agents SDK (TypeScript)

```typescript
import { Agent, run, MCPServerStreamableHttp } from "@openai/agents";

const server = new MCPServerStreamableHttp({
  url: "https://mcp.trychannel3.com/",
  name: "Channel3",
  requestInit: { headers: { "X-API-Key": "<your-api-key>" } },
});

await server.connect();
const agent = new Agent({
  name: "Shopping Agent",
  instructions: "You are a personal shopping assistant.",
  mcp_servers: [server],
});
const result = await run(agent, "I'm looking for a new laptop");
console.log(result.finalOutput);
await server.close();
```

# Local Testing
1. Start the dev server: `pnpm dev`
   - By default it proxies to a local Channel3 API on `:8001`. To use the production API instead: `pnpm dev -- --var CHANNEL3_BASE_URL:` and pass a valid key via the `X-API-Key` header.
2. Start MCP Inspector v2: `pnpm inspect` (web UI at http://localhost:6274)
   - **Transport Type**: Streamable HTTP
   - **URL**: `http://localhost:8787/`
   - Add an `X-API-Key` header for unlimited local testing
   - Click **Connect**

Or use the Inspector CLI for scripted checks:

```bash
pnpm exec mcp-inspector --cli http://localhost:8787/ --transport http --method tools/list
pnpm exec mcp-inspector --cli http://localhost:8787/ --transport http --method tools/call \
  --tool-name search_products --tool-arg query="desk lamp"
pnpm exec mcp-inspector --cli http://localhost:8787/ --transport http --method prompts/get \
  --prompt-name find-gift --prompt-args recipient="coffee-loving sister" budget=60
```

Or probe the stateless endpoint directly — no `initialize` handshake needed:

```bash
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {"name": "curl", "version": "1.0.0"},
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  }'
```

# Releasing

1. Bump `version` in `package.json` (the server reports this as its `serverInfo` version).
2. Tag the release: `git tag v<version> && git push --tags`
3. The [publish workflow](.github/workflows/publish-mcp.yml) syncs `server.json` to the tag and publishes to the MCP Registry via GitHub OIDC.

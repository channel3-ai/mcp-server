# Channel3 MCP Server

## Quick Start (Free Tier)

No API key required. Connect directly and start searching:

```
https://mcp.trychannel3.com/
```

The free tier is rate-limited to **10 requests per minute** per IP address. If you hit the limit, you'll receive an error response.

## Unlimited Access

For unlimited usage and affiliate tracking, create an account and add your API key:

1. **Create an account** at [trychannel3.com](https://trychannel3.com) and create an API key to authenticate requests and affiliate purchases to your account.
2. Add the Channel3 MCP to your agent with `?apiKey=<your-api-key>` in the URL as such:

```
https://mcp.trychannel3.com/?apiKey=placeholder
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Channel3": {
      "url": "https://mcp.trychannel3.com/?apiKey=<your-api-key>"
    }
  }
}
```

To use the free tier (no API key, rate-limited), omit the `apiKey` parameter:

```json
{
  "mcpServers": {
    "Channel3": {
      "url": "https://mcp.trychannel3.com/"
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "Channel3": {
      "type": "http",
      "url": "https://mcp.trychannel3.com/?apiKey=<your-api-key>"
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http Channel3 "https://mcp.trychannel3.com/?apiKey=<your-api-key>"
```

### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Channel3": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.trychannel3.com/sse?apiKey=<your-api-key>"
      ]
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
            "url": "https://mcp.trychannel3.com/?apiKey=<your-api-key>",
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
  url: "https://mcp.trychannel3.com/?apiKey=<your-api-key>",
  name: "Channel3",
});

await server.connect();
const agent = new Agent({
  name: "Shopping Agent",
  instructions: "You are a personal shopping assistant.",
  mcpServers: [server],
});
const result = await run(agent, "I'm looking for a new laptop");
console.log(result.finalOutput);
await server.close();
```

# Local Testing
1. Start the dev server: `pnpm run dev`
2. Start MCP Inspector: `npx @modelcontextprotocol/inspector`
3. In the MCP Inspector UI:
   - **Transport Type**: Streamable HTTP
   - **URL**: `http://localhost:8787/?apiKey=<YOUR_API_KEY>`
   - Click **Connect**

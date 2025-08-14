# Channel3 MCP Server

**Step 1**: **Create an account**
Create an account to curate your catalog and track affiliate payouts. [Create Account](https://trychannel3.com/sign-up)

**Step 2**: **Create an API Key**
Your API Key will be used to authenticate your requests to the Channel3 MCP and ensure purchases get affiliated to your account. [Create API Key](https://trychannel3.com/dashboard/api)

**Step 3**: Add the Channel3 MCP to your agent.

**Claude Config**

```json
{
  "mcpServers": {
    "Channel3": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.trychannel3.com",
	    "--header",
	    "x-api-key: ${apiKey}"
      ],
      "env": {
        "apiKey": <your-api-key>
      }
    }
  }
}
```

**OpenAI Agents SDK**

```python
from openai.agents import Agent
from agents.mcp import MCPServerStdio

async def main(message: str):
  async with MCPServerStdio(
      name="Channel3 MCP Server",
      cache_tools_list=True,
      params={
          "command": "npx",
          "args": [
              "mcp-remote",
              "https://mcp.trychannel3.com"
              "--header",
              "x-api-key: <your-api-key>"
          ],
      },
  ) as mcp_server:
      print("MCP server connected")
      # Initialize the agent with the MCP server
      shopping_agent = Agent(
          name="Shopping Agent",
          instructions=(
              "You are a personal shopping assistant. "
              "Help the user find the best products for their needs. "
              "You have access to a tool to search the web for products."
          ),
          output_type=TextResponse,
          model="gpt-4.1-nano",
          # https://github.com/openai/openai-agents-python/blob/main/examples/mcp/sse_example/main.py
          mcp_servers=[mcp_server],
      )

      result = Runner.run_streamed(
          shopping_agent,
          input=message,
      )

      for chunk in result:
        print(chunk)

asyncio.run(main("I'm looking for a new laptop"))
```

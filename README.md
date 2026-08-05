# Channel3 Shopping

Shopping search across 100M+ products, with every retailer's offer and live price in one place — an MCP server with an interactive storefront UI on hosts that support it.

https://github.com/user-attachments/assets/59508319-aa1f-4462-afbe-52b64638ece3

- **Transport**: Streamable HTTP (protocol revision `2026-07-28`, stateless)
- **Endpoint**: `https://mcp.trychannel3.com/`
- **Tools**: `search_products`, `get_products`
- **Prompts**: `find-gift`, `price-check`, `find-dupes`
- **UI**: results render in an interactive storefront (MCP Apps) on hosts that support it

## Connect

One URL, no API key and no OAuth:

```
https://mcp.trychannel3.com/
```

Limits on the free tier are generous and sized for personal use. For unlimited usage and affiliate attribution, [add an API key](#free-tier-and-api-keys).

[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Channel3-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=Channel3&config=eyJ1cmwiOiJodHRwczovL21jcC50cnljaGFubmVsMy5jb20vIn0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Channel3-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Channel3&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.trychannel3.com%2F%22%7D)

### Claude Code

```bash
claude mcp add --transport http --scope user Channel3 https://mcp.trychannel3.com/
```

### Claude web, Desktop, and mobile

**Settings → Connectors → Add custom connector**, then paste the endpoint URL. Claude connects from its own servers, so one connector covers every Claude surface including mobile.

Don't use `claude_desktop_config.json` for this: it only accepts stdio servers, and an entry with a `url` field is silently dropped along with the rest of `mcpServers`.

### ChatGPT

Turn on [developer mode](https://developers.openai.com/api/docs/guides/developer-mode) under **Settings → Security and login**, then create an app under **Settings → Plugins** pointing at the endpoint URL, with authentication set to none.

### Codex

```bash
codex mcp add Channel3 --url https://mcp.trychannel3.com/
```

### Cursor and VS Code by hand

`~/.cursor/mcp.json`, or `.cursor/mcp.json` to scope it to one project:

```json
{
  "mcpServers": {
    "Channel3": {
      "url": "https://mcp.trychannel3.com/"
    }
  }
}
```

`.vscode/mcp.json`, or `code --add-mcp '{"name":"Channel3","type":"http","url":"https://mcp.trychannel3.com/"}'` for the user profile:

```json
{
  "servers": {
    "Channel3": {
      "type": "http",
      "url": "https://mcp.trychannel3.com/"
    }
  }
}
```

### Any other client

Register the endpoint as a **Streamable HTTP** server; there is no SSE endpoint. It's stateless, so there's no session to keep alive, and clients on the `2026-07-28` revision can skip the `initialize` handshake entirely.

## Free Tier and API Keys

Create an account at [trychannel3.com](https://trychannel3.com), copy a key from the [dashboard](https://trychannel3.com/dashboard/api), and send it as an **`X-API-Key` header**. That lifts the free-tier rate limit and attributes affiliate clicks to your account.

- **Cursor / VS Code**: add `"headers": { "X-API-Key": "<your-api-key>" }` alongside `url`.
- **Claude Code**: append `--header "X-API-Key: <your-api-key>"` to the `claude mcp add` command.
- **Claude connectors**: enter the key under **Request headers** in the Add custom connector dialog. That section is a beta still rolling out.
- **ChatGPT**: developer-mode apps accept OAuth or no auth only, so there's no header field.
- **OpenAI hosted MCP** (Responses API `mcp` tool, `HostedMCPTool`): put the key in the tool's `authorization` field — the server accepts it as a bearer token.
- **Codex**: map the header to an env var in `~/.codex/config.toml` so the key stays out of the file:

```toml
[mcp_servers.Channel3]
url = "https://mcp.trychannel3.com/"
env_http_headers = { "X-API-Key" = "CHANNEL3_API_KEY" }
```

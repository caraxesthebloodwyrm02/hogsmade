# MCP troubleshooting

## GitHub MCP plugin: "Authorization header is badly formatted" (400)

**What the log is:** The error comes from **Cursor’s GitHub MCP plugin** (`plugin-github-github`), which talks to a remote GitHub MCP service over HTTP/SSE. It is **not** from your custom stdio servers (afloat-server, grid-server, etc.) in `~/.cursor/mcp.json`.

**What it means:** The remote service is rejecting the request because the `Authorization` header Cursor sends is invalid (wrong format, empty token, or wrong scheme).

**What you can do:**

1. **Re-authenticate GitHub in Cursor**

   - Open **Cursor Settings** (e.g. File → Preferences → Cursor Settings, or the gear icon).
   - Go to **Features** or **Tools** / **Integrations** and find **GitHub** or **MCP**.
   - Disconnect or sign out of GitHub, then connect/sign in again so Cursor gets a fresh token and sends a valid header.

2. **Turn off the GitHub MCP integration**

   - If you don’t need GitHub MCP, disable it in Cursor Settings (Features → Tools / MCP, or the Integrations panel). Disabling via `~/.cursor/settings.json` plugin keys does not affect the GitHub MCP; use the UI.

3. **Update Cursor**
   - Newer versions may fix how the GitHub plugin sends the auth header; check for updates.

Your **custom MCP servers** (afloat-server, echoes-server, grid-server, lots-server, maintain-server, pulse-server, seeds-server) are configured in `~/.cursor/mcp.json` and run via `npx tsx src/server.ts`. If those fail, you’ll see different errors (e.g. spawn failure, missing env). Fix those by checking `cwd`, `env`, and that each project has `npm install` and any required env vars set.

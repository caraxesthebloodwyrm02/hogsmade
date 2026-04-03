# glimpse-server

MCP server that exposes the Glimpse cognitive engine as tools for any MCP client (Windsurf, Claude Desktop, etc.).

## Tools

| Tool                 | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `glimpse_analyze`    | Run the full enhanced pipeline on inline data. Returns lenses, complexity, patterns, confidence. |
| `glimpse_complexity` | Detect data complexity (simple/moderate/complex) without full pipeline.                          |
| `glimpse_compress`   | Score insight density — domains covered per token.                                               |
| `glimpse_similarity` | Fuzzy dimension similarity (space aliases, domain overlap, temporal distance).                   |
| `glimpse_confidence` | Create confidence frame, detect gaps, return calibrated summary.                                 |

## Setup

```bash
cd glimpse-server
npm install
```

## Run

```bash
npm start
```

Communicates via JSON-RPC over stdio.

## Register in MCP config

Add to your editor's MCP config (e.g. `mcp_config.json`):

```json
{
  "mcpServers": {
    "glimpse": {
      "command": "npx",
      "args": ["-y", "tsx", "/home/caraxes/CascadeProjects/glimpse-server/src/server.ts"]
    }
  }
}
```

Restart your editor after editing the config.

## Architecture

The server dynamically imports the Glimpse engine from `../glimpse-engine/core/engine.js` at runtime. No build step needed for the engine — it's pure ESM JavaScript.

```
glimpse-server/src/server.ts
  └─→ import(../glimpse-engine/core/engine.js)
      ├── runContextPipeline()      → glimpse_analyze
      ├── detectDataComplexity()    → glimpse_complexity
      ├── scoreInsightDensity()     → glimpse_compress
      ├── computeDimensionSimilarity() → glimpse_similarity
      └── createConfidenceFrame()   → glimpse_confidence
```

## Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `zod` — Schema validation for tool parameters
- `tsx` — TypeScript execution (dev)

# Overview Server

Checkpoint-based situational awareness MCP server — trust instrument for the Mangrove workspace.

## Commands

```bash
npm install
# If using local shared-types (workspace root): build it first:
#   cd ../shared-types && npm run build
npm run build
npm test
npm run start
```

## Optional Environment

- `OVERVIEW_DATA_DIR`: override the default `~/.overview` data directory

## Notes

- Generates checkpoint assessments answering "where do I stand right now?" with trajectory, cluster health, drift detection, and trust signals.
- Aggregates status from seeds-server ecosystem scans and echoes-server audit data.
- Supports focus modes for specific clusters (grid-family, mcp-infrastructure, canopy-apps, etc.).

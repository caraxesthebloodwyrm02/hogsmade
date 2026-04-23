# Live MCP Config Parity Audit — 2026-04-23

Phase 5 parity check across the four live MCP surfaces vs. canonical (`mcp_config.example.json`).

## Parity table

| Server                       | Canonical (example) | Windsurf live | Cursor live | Claude user | VS Code live |
| ---------------------------- | ------------------- | ------------- | ----------- | ----------- | ------------ |
| `afloat-server`              | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `code-analysis`              | ✓                   | ✓             | ✓           | —           | ✓            |
| `craft-server` (archived)    | —                   | ✓             | —           | ✓           | —            |
| `echoes-server`              | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `eligibility-server`         | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `glimpse-server` (archived)  | —                   | ✓             | —           | ✓           | —            |
| `grid-enhanced-tools`        | ✓                   | ✓             | ✓           | —           | ✓            |
| `grid-intelligence`          | ✓                   | ✓             | ✓           | —           | ✓            |
| `grid-rag`                   | ✓                   | ✓             | ✓           | —           | ✓            |
| `grid-rag-enhanced`          | ✓                   | ✓             | ✓           | —           | ✓            |
| `grid-server`                | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `harness-server`             | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `lots-server`                | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `maintain-server`            | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `mangrove-server` (archived) | —                   | ✓             | —           | ✓           | —            |
| `nexus-server`               | ✓                   | —             | —           | —           | —            |
| `ori-server`                 | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `overview-server`            | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `portfolio-safety-lens`      | ✓                   | ✓             | ✓           | —           | ✓            |
| `pulse-server`               | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `school-server`              | ✓                   | —             | —           | —           | —            |
| `seeds-server`               | ✓                   | ✓             | ✓           | ✓           | ✓            |
| `test-runner`                | ✓                   | ✓             | ✓           | —           | ✓            |

## Divergences & resolutions

### Resolved

1. **Windsurf live carried archived servers** (`craft-server`, `glimpse-server`, `mangrove-server`). Removed from `~/.codeium/windsurf/mcp_config.json` via direct filesystem edit (user-level file, not repo-tracked).
2. **Claude user carried archived servers** (`craft-server`, `glimpse-server`, `mangrove-server`). Removed from `~/.claude.json` via direct filesystem edit.
3. **Claude user missing 7 canonical servers** (`code-analysis`, `grid-enhanced-tools`, `grid-intelligence`, `grid-rag`, `grid-rag-enhanced`, `portfolio-safety-lens`, `test-runner`). Added to `~/.claude.json` with absolute-path `cwd` values since the file is user-global (not repo-scoped).

### Intentional divergence — 14-day watch

- `nexus-server` and `school-server` are in canonical but absent from all four live tools. On a 14-day watch until **2026-05-07**; re-evaluate then whether to remove from canonical or wire up live.

### No action

- **Cursor live** matches canonical (except the two watched servers).
- **VS Code live** (`.vscode/mcp.json`) matches canonical exactly.

## Change protocol observed

- Both user-level files backed up before any edit (`{,.pre-parity-20260423.bak}`).
- Edits applied via `jq` (read → transform → atomic `mv`), never in-place.
- After each edit: `jq -r '.mcpServers | keys[]' | sort` diffed against canonical for verification.
- Each tool restarted after its config changed; no startup errors logged.

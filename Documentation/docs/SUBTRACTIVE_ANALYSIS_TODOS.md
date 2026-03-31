# Subtractive analysis — todo items

**Source**: [SUBTRACTIVE_ANALYSIS_Afloat_SharedTypes.md](SUBTRACTIVE_ANALYSIS_Afloat_SharedTypes.md)
**Ingested**: 2026-03-09

## Definite (safe to do)

- [ ] **Remove GRID-main event_bus legacy_shim** — Delete `GRID-main/src/infrastructure/event_bus/legacy_shim.py`; no references; `__init__.py` does not export it.

## Confirm first (before doing)

- [ ] **Hogwarts-visualizer move/archive** — Confirm with product/owner that `research/experiments/hogwarts-visualizer` is done or maintained elsewhere; then move or archive the tree (59 files).

## Optional (config / docs)

- [ ] **Resolve echoes vs echoes-server** — In `mcp_config.json`, keep one canonical Echoes server entry; remove or rename the other (echoes = mcp-tool-experiment, echoes-server = CascadeProjects).
- [ ] **Add pulse-server env** — Add `ECHOES_AUDIT_PATH` and `SEEDS_SNAPSHOTS_DIR` (or equivalent) to pulse-server in `.cursor/mcp.json` / `mcp_config.json` so briefings can read audit + seeds (per DATA_CONTRACTS).
- [ ] **Document MCP sync** — In README or docs, add one line: "To use all Cascade MCP servers in Cursor, run `npm run sync-mcp` (or copy mcp_config.json mcpServers into .cursor/mcp.json)."
- [ ] **Add sync-mcp-config script** — Add `scripts/sync-mcp-config.ts` or PowerShell that reads `mcp_config.json` and writes `.cursor/mcp.json` (first-party servers only, optional filter).
- [ ] **Normalize historical MCP docs to current Linux paths** — Replace superseded Windows-era examples in active operator docs where they still conflict with current `mcp_config.json`.
- [ ] **Reconcile Ruff formatter docs with installed editor support** — Current Windsurf Next schema on this machine accepts `ms-python.python` in settings, not `charliermarsh.ruff`; either install/enable the Ruff formatter extension where supported or update the documented aligned baseline.

## Future passes (scope for later)

- [ ] **MCP bootstrap consolidation** — Run subtractive analysis with scope "all MCP servers"; produce consolidation plan (shared `createServer`/config helper) and pick pilot (e.g. afloat).
- [ ] **glimpse-artifact subtractive pass** — Scope: glimpse-artifact only; target unused components, duplicate helpers, optional dev deps.
- [ ] **All MCP servers pass** — Map identical config/health/smoke patterns; propose shared bootstrap shape and pilot migration; optionally flag removable tools.

## Done (reference)

- [x] **Merge mcp_config → .cursor/mcp.json** — First-party Cascade servers (echoes-server, grid, afloat, lots, seeds, pulse, maintain) added to `.cursor/mcp.json`.
- [x] **Correct `code-analysis` / `test-runner` naming drift in active docs** — `docs/MCP_SETUP_GUIDE.md` and `docs/YOUR_MCP_ECOSYSTEM_GUIDE.md` now use canonical server keys and note current host-assigned `mcp1_*` / `mcp14_*` tool names.
- [x] **Refresh aligned editor settings snapshots** — `/home/caraxes/.config/Windsurf - Next/User/settings.json` and `CascadeProjects/.vscode/settings.json` were updated to the current cross-editor baseline.

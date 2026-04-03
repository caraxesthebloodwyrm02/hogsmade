# Subtractive Analysis: afloat-server & shared-types

**Date**: 2026-03-09  
**Scope**: afloat-server, shared-types; MCP configuration and inventory optimization.  
**Sources**: Direct analysis (afloat, shared-types, MCP config) + subtractive-analyst subagent (cross-workspace candidates).  
**Todo file**: [SUBTRACTIVE_ANALYSIS_TODOS.md](SUBTRACTIVE_ANALYSIS_TODOS.md)

---

## 1. What can be removed (subtrahends)

### 1.1 afloat-server

| Candidate                                          | Type               | Action               | Notes                                                                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main server vs shared-types**                    | Dependency surface | **Document only**    | `src/server.ts` does **not** import `@cascade/shared-types`. Only `scripts/run_scheduled_diagnostics.ts` uses `emitAudit` from audit-client. No code to remove; keep dependency for the script.                                          |
| **Duplicate "echoes" in mcp_config**               | Config             | **Optional cleanup** | `mcp_config.json` has both `"echoes"` (pointing at `mcp-tool-experiment/src/server.ts`) and `"echoes-server"` (CascadeProjects). If only one is used, remove or rename the other to avoid confusion.                                     |
| **Scheduled script dependency on maintain-server** | Build/runtime      | **Document**         | `run_scheduled_diagnostics.ts` imports `maintain-server` via relative path `../../maintain-server/src/server.ts`. Ensures workspace layout stays `afloat-server` and `maintain-server` as siblings. No removal; document for onboarding. |

**Verdict**: afloat-server is already lean. No safe removal of code; only config/doc clarifications.

### 1.2 shared-types

| Candidate                      | Type    | Action       | Notes                                                                                                                                                                             |
| ------------------------------ | ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Health / Telemetry exports** | Surface | **Keep**     | README marks them as "deferred" (not yet adopted by 3+ servers). They are small and part of the public API; removing would break anyone importing them. Keep for future adoption. |
| **security-policy**            | Surface | **Keep**     | Used by docs and potentially by servers that adopt policy engine; large but single module. No current consumer in afloat/maintain/lots; keep for GATE/compliance roadmap.         |
| **Unused re-exports**          | Barrel  | **Optional** | `index.ts` re-exports audit, health, telemetry, audit-client, security-policy. All are documented; no dead export.                                                                |

**Verdict**: shared-types has no removable surface without breaking the documented API. Only optional: trim security-policy from default barrel if a "light" build were ever added (out of scope here).

### 1.3 Cross-project

- **Build order**: Keep `shared-types` built first; afloat-server (and maintain-server, lots-server) depend on it. Document in AGENTS.md/CLAUDE.md (already present).
- **Single consumer of shared-types in afloat**: The only afloat usage is `scripts/run_scheduled_diagnostics.ts`. Main MCP server is dependency-free of shared-types.

---

## 2. Current MCP configuration

### 2.1 Canonical source

- **File**: `mcp_config.json` (workspace root)
- **Purpose**: Single source of truth for all editors (Windsurf, Cursor, VSCode, Claude Code, Zed).
- **Last updated**: 2026-03-07 (per `_updated` in file).

### 2.2 Cursor project override

- **File**: `.cursor/mcp.json`
- **Content**: Updated to include all seven first-party Cascade MCP servers (echoes-server, grid-server, afloat-server, lots-server, seeds-server, pulse-server, maintain-server) with env from `mcp_config.json`. E:\grid Python servers omitted; add from `mcp_config.json` if needed.

### 2.3 Servers in mcp_config.json (inventory)

| Server                | Command                                     | Env                                                   | Notes                               |
| --------------------- | ------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| echoes                | npx tsx …/mcp-tool-experiment/src/server.ts | —                                                     | Possible duplicate of echoes-server |
| echoes-server         | npx tsx …/echoes-server/src/server.ts       | ECHOES_AUDIT_PATH                                     | Audit/telemetry                     |
| grid-server           | npx tsx …/grid-server/src/server.ts         | CASCADE_WORKSPACE_ROOT, GATE_DIR, GRID_API_URL        | GATE                                |
| afloat-server         | npx tsx …/afloat-server/src/server.ts       | —                                                     | Workflows                           |
| lots-server           | npx tsx …/lots-server/src/server.ts         | LOTS_EXPERIMENTS_DIR, ECHOES_AUDIT_PATH               | Experiments                         |
| seeds-server          | npx tsx …/seeds-server/src/server.ts        | SEEDS_ROOT                                            | Ecosystem                           |
| pulse-server          | npx tsx …/pulse-server/src/server.ts        | —                                                     | Briefings, journal                  |
| grid-rag              | python …/grid_rag_mcp_server.py             | PYTHONPATH, RAG*\*, OLLAMA*\*                         | E:\grid                             |
| grid-rag-enhanced     | python -m grid.mcp.enhanced_rag_server      | (same)                                                | E:\grid                             |
| grid-enhanced-tools   | python …/enhanced_tools_mcp_server.py       | PYTHONPATH                                            | E:\grid                             |
| portfolio-safety-lens | python …/portfolio_safety_mcp_server.py     | PYTHONPATH (+ Coinbase)                               | E:\grid                             |
| code-analysis         | python …/code_analysis_mcp_server.py        | PYTHONPATH                                            | E:\grid                             |
| test-runner           | python …/test_runner_mcp_server.py          | PYTHONPATH                                            | E:\grid                             |
| maintain-server       | npx tsx …/maintain-server/src/server.ts     | CASCADE_WORKSPACE_ROOT, SEEDS_ROOT, ECHOES_AUDIT_PATH | Diagnostics                         |

---

## 3. Similar subtrahends for debug & scope

- **Debug**: Use one health-check tool per server (e.g. `afloat-server` health_check, `echoes-server` health_check) to confirm which MCPs are up before debugging. Reduces noise from "server not running" vs "tool error."
- **Scope**:
  - **First-party only**: For Cascade-only workflows, enable only echoes-server, grid-server, afloat-server, lots-server, seeds-server, pulse-server, maintain-server (and optionally one echoes entry). Disable grid-rag\*, portfolio-safety-lens, code-analysis, test-runner when not needed.
  - **Naming**: Resolve "echoes" vs "echoes-server" (one canonical name, one config entry) to avoid duplicate tools.
- **Optimize inventory**: See next section.

---

## 4. MCP inventory optimization (ready to use)

### 4.1 Merge Cursor config with canonical list

**Done**: `.cursor/mcp.json` has been updated to include all **first-party Cascade** MCP servers from `mcp_config.json` (echoes-server, grid-server, afloat-server, lots-server, seeds-server, pulse-server, maintain-server). The duplicate `"echoes"` (mcp-tool-experiment) entry was omitted; E:\grid Python servers (grid-rag, grid-rag-enhanced, etc.) remain only in `mcp_config.json`—add them to `.cursor/mcp.json` if you need them in Cursor.

To keep in sync or add more later:

1. Copy the `mcpServers` block from `mcp_config.json` into `.cursor/mcp.json` (or run a sync script).
2. Ensure env vars match (e.g. `ECHOES_AUDIT_PATH`, `SEEDS_ROOT`, `CASCADE_WORKSPACE_ROOT`) for maintain-server, echoes-server, lots-server, seeds-server, grid-server.
3. Add to pulse-server env if needed: `ECHOES_AUDIT_PATH`, `SEEDS_SNAPSHOTS_DIR` (or equivalent) so briefings can read audit + seeds snapshots (per DATA_CONTRACTS.md).

### 4.2 Optional: script to sync MCP config

- Add a small script (e.g. `scripts/sync-mcp-config.ts` or PowerShell) that reads `mcp_config.json` and writes `.cursor/mcp.json` with the first-party servers (and optionally filters to a subset). Reduces drift and keeps Cursor "ready to use" after pull.

### 4.3 Subtrahend checklist (debug & scope)

- [ ] Resolve echoes vs echoes-server (single canonical entry).
- [x] Merge `mcp_config.json` → `.cursor/mcp.json` for full first-party list.
- [ ] Add pulse-server env (audit + seeds paths) if missing.
- [ ] Document in README or docs: "To use all Cascade MCP servers in Cursor, run `npm run sync-mcp` (or copy mcp_config.json mcpServers into .cursor/mcp.json)."

---

## 5. Cross-workspace candidates (from subtractive-analyst subagent)

The subtractive-analyst subagent scanned the full CascadeProjects workspace and reported the following. These are **in addition** to the afloat/shared-types/MCP findings above.

### 5.1 GRID-main: remove legacy event_bus shim (definite)

| Term           | Description                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Minuend**    | `GRID-main/src/infrastructure/event_bus/` (event_system + legacy_shim).                                     |
| **Subtrahend** | `legacy_shim.py` (and its single export `subscribe_legacy`).                                                |
| **Remainder**  | Event bus package with only `event_system`; no references to `subscribe_legacy` or `legacy_shim` elsewhere. |

**Validation**: No imports of `subscribe_legacy` or `legacy_shim` in the repo; `event_bus/__init__.py` does not export the legacy shim; Mothership uses `get_eventbus` from `event_system`. **Safe to remove** (dead code).

### 5.2 GRID-main: trim or relocate research/experiments (confirm first)

| Term           | Description                                                                                |
| -------------- | ------------------------------------------------------------------------------------------ |
| **Minuend**    | GRID-main repo including `research/experiments/hogwarts-visualizer`.                       |
| **Subtrahend** | The `research/experiments/hogwarts-visualizer` tree (standalone Vite/React app, 59 files). |
| **Remainder**  | Core GRID-main without this experiment; clearer production boundary.                       |

**Caveat**: Only do this if the experiment is no longer needed in-repo; otherwise treat as optional scope. **Confirm with product/owner** before moving or archiving.

### 5.3 MCP servers: optional consolidation of bootstrap/config

| Term           | Description                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minuend**    | All MCP servers (afloat, echoes, grid, lots, maintain, pulse, seeds) + shared-types.                                                                                          |
| **Subtrahend** | Not deletion—**consolidation**: duplicate server bootstrap and config patterns (`getConfig()`, `ensureDataDir()`, McpServer + StdioServerTransport setup, health tool shape). |
| **Remainder**  | Same behavior with less duplicated setup (e.g. shared-types or a small package providing a `createServer(name, config, tools)`-style helper).                                 |

**Observation**: Only afloat, lots, and maintain use `@cascade/shared-types`; echoes, grid, pulse, seeds do not. Each server reimplements similar patterns. **Next step**: Run subtractive analysis with scope “all MCP servers” to get a concrete consolidation plan and pilot (e.g. afloat as first adopter).

### 5.4 Recommended scopes for a future pass

1. **glimpse-artifact only** — Unused components, duplicate helpers (e.g. `utils`), optional dev deps; propose minimal remainder.
2. **All MCP servers** — Map identical config/health/smoke patterns; propose shared bootstrap/config shape and one pilot migration; optionally flag removable or redundant tools.

---

## 6. Summary

| Area                       | Removable (subtrahend)                     | Action                                                                                            |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| afloat-server              | None (already minimal)                     | Document that only the scheduled script uses shared-types.                                        |
| shared-types               | None without API break                     | Keep all exports; health/telemetry deferred but kept.                                             |
| MCP config                 | Duplicate "echoes" entry                   | Optional: one canonical Echoes server entry.                                                      |
| Cursor vs canonical        | .cursor/mcp.json                           | Done: merged first-party list from mcp_config.json.                                               |
| Debug/scope                | N/A                                        | Use health_check tools; limit enabled servers to first-party when debugging.                      |
| **GRID-main** (subagent)   | `legacy_shim.py` in event_bus              | **Definite**: Remove dead code (no references).                                                   |
| **GRID-main** (subagent)   | `research/experiments/hogwarts-visualizer` | **Confirm first**: Move/archive only if experiment is done or maintained elsewhere.               |
| **MCP servers** (subagent) | Duplicate bootstrap/config                 | **Refinement**: Consolidate via shared helper; scope “all MCP servers” for concrete plan + pilot. |

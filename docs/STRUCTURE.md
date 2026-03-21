# Workspace structure and attention map

This document is the **single map** for where things live and who owns what. Use it to reduce cognitive load and route work to the right place (attention taxonomy + agency).

## Root directory (first glance)

| Purpose | Location | Notes |
|--------|----------|------|
| **Entry points** | `README.md`, `CLAUDE.md`, `AGENTS.md` | Start here for orientation and AI/agent rules. |
| **Conventions** | `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md` | Contributing, history, license, security policy. |
| **Scratch / notes** | `archive/session-artifacts/` | Session scratch files; not config. |
| **Config (root)** | `.editorconfig`, `.env.example`, `.gitattributes`, `.gitignore`, `.gitmodules` | Editor, env template, git. Ignored: `.cursor/hooks*`, `debug-*.log`, `.session-state.json` — see [GIT_REPO.md](GIT_REPO.md#ignored-paths). |
| **Tool config** | `mcp_config.json`, `claude_code_config.json` | MCP and editor tooling; do not commit secrets. |
| **Docs** | `docs/` | All shared documentation; index in [docs/README.md](README.md). |
| **Scripts** | `scripts/` | Workspace-level scripts; index in [scripts/README.md](../scripts/README.md). |
| **Operational** | `GATE/` | GATE envelopes, contracts, results; runtime/ops data. |
| **Projects** | See below | Apps, servers, shared packages at root. |

## Projects (scope → ownership)

Grouped by **scope** so you know where to look and what to touch.

### First-party apps and servers (root)

| Project | Type | Owner / scope |
|---------|------|----------------|
| `afloat-server/` | MCP server | Workflow orchestration, scheduled diagnostics |
| `echoes-server/` | MCP server | Audit and telemetry persistence |
| `grid-server/` | MCP server | GRID/GATE integration |
| `lots-server/` | MCP server | Experiment catalog and runner |
| `maintain-server/` | MCP server | Diagnostics, cleanup, maintenance |
| `pulse-server/` | MCP server | Briefings, focus, journal, prioritization |
| `seeds-server/` | MCP server | Ecosystem snapshots and scans |
| `glimpse-artifact/` | App/library | React UI and components |
| `glimpse-engine/` | Visualization | Data viz engine, runs in browser; includes HTML demos and tests |
| `glimpse-server/` | MCP server | Glimpse MCP tools (analyze, compress, similarity, confidence) |
| `shared-types/` | Shared package | Types and audit client; build before dependent servers |
| `shared-resilience/` | Shared package | Circuit breaker, rate limit, retry patterns |

Each has its own README, lockfile, and toolchain. Use [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) for build and test commands.

### Nested repos (submodules)

| Project | Managed in | Notes |
|---------|------------|--------|
| `GRID-main/` | Its own git root | Python, FastAPI, uv; see `GRID-main/docs/project/`. |
| `mcp-tool-experiment/` | Its own git root | TypeScript, pnpm; includes MCP SDK and safety pipeline. |


Root repo only records their commit refs. See [GIT_REPO.md](GIT_REPO.md) and [SUBMODULES.md](SUBMODULES.md).

## Where to put things

- **New shared doc** → `docs/`; add a line to `docs/README.md`.
- **New workspace script** → `scripts/` (or `scripts/<topic>/`); mention in `scripts/README.md`.
- **GATE envelopes / contracts** → `GATE/` (incoming, results, contracts as per GATE design).
- **Project-specific code** → Inside that project; do not add to root.

## Attention taxonomy (where to look)

| If you want to… | Look here |
|------------------|-----------|
| Understand the workspace | `README.md`, this file, `docs/README.md` |
| Configure AI/agents | `CLAUDE.md`, `AGENTS.md`, `.cursor/`, `.claude/` |
| Git and branches | `docs/GIT_REPO.md`, `docs/git-audit-guide.md`, `docs/SUBMODULES.md` |
| Data contracts and APIs | `docs/DATA_CONTRACTS.md`, per-project READMEs |
| Security and compliance | `SECURITY.md`, `docs/SECURITY_STATUS.md` |
| Run or add scripts | `scripts/`, `scripts/README.md` |
| Phase 4 and quality | `docs/PHASE4_QUALITY_CONTRACT.md`, `docs/PROGRESS_SUMMARY.md` |

## Tool and CI health

- **Build order**: `shared-types` first (`npm run build`), then any server that depends on it (afloat, maintain, pulse, etc.).
- **Per project**: See each project README for `npm run build`, `npm test`, or `uv run pytest` / `uv run ruff check` (GRID-main). Run builds and tests after changes to confirm nothing is broken.

## Agency (who does what)

- **Root repo** = shared docs, conventions, first-party servers, and scripts. Commit with scoped messages (e.g. `fix(glimpse-artifact): …`).
- **Nested repos** = commit inside `GRID-main/` or `mcp-tool-experiment/` when changing those codebases; update refs at root only when intentionally recording a new submodule commit.
- **Per-project** = each app/server/package owns its build, test, and deploy; see project README and workspace CLAUDE/AGENTS.

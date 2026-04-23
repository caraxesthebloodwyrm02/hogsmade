# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-04-23

### Added — Hogsmade Agentic Notebook Plugin (v0.1.0)

Plugin scaffold (`.claude-plugin/plugin.json`, `.mcp.json`, `commands/`, `agents/`, `hooks/`):

- Four domain agents: software-engineering-pilot, enterprise-search-pilot, data-pilot, product-management-pilot
- Notebook pilot agent as primary cross-domain interface
- Commands: `/grid`, `/echoes`, `/7pm`, `/notebook-query`, `/notebook-summary`, `/notebook-replay`, `/seeds-trend`, `/harness-status`, `/stage6`
- Stop hook (`hooks/stop.sh`): captures Stage 6 report fences → ori notebook `decision` entries
- SessionStart hook (`hooks/session-start.sh`): notebook welcome summary
- CHAIN structured contract: `~/.claude/registry/chain.yaml` + JSON Schema + `scripts/registry-build.mjs` validator + `~/.claude/CHAIN.md` rendered view

Signal wiring:

- Harness → Ori bridge (`harness-server/src/ori-bridge.ts`): converts HarnessSignal → ori LogEntry after each scenario run
- Threat heatmap confirmation (`ori-server/src/confirmations.ts`): harness run results overlay `confirmedVia` on (threatId, projectId) cells
- Seeds-snapshot-drift SignalRoute added to ori router DEFAULT_ROUTES (24h window, recommend + note actions)
- Scheduled driver (`scripts/hogsmade-driver.sh`): systemd user timers for twice-daily ecosystem_scan and once-daily harness_run

Infrastructure:

- MCP config parity: nexus-server and school-server promoted to claude_code_config.json (zero drift)
- `/notebook-replay` command mapped to `mcp__ori-server__get_run_result`

## [2.0.0-tracing] - 2026-04-14

### Added

- Pre-release tracing tag `v2.0.0-tracing` (release workflow validates this section).

## [1.0.0] - 2026-03-21

### Added

- Root repo structure: LICENSE, CONTRIBUTING.md, .editorconfig, .github templates, CHANGELOG.md, SECURITY.md, docs/README.md.
- docs/progress-and-vision.html — Visual progress and vision artifact (phase timeline, project map, Phase 4 vision, doc links).
- docs/PROGRESS_SUMMARY.md — Progress summary and gist; links to Phase 4 quality contract and schema.
- docs/PHASE4_QUALITY_CONTRACT.md — Phase 4 quality contract (acceptance criteria, probabilities, quality-gate report).
- docs/schemas/phase4-quality-gates.schema.json — JSON schema for validating Phase 4 quality-gate reports.
- Lint scripts (`tsc --noEmit`) added to all MCP servers and shared-types.
- CODEOWNERS, pre-commit config, pr-contract and agent-fix CI workflows.
- glimpse-engine module reorganization (core/ imports).
- All MCP servers aligned at v1.0.0; glimpse-artifact bumped from 0.0.0 to 1.0.0.

## [0.1.0] - 2026-03-08

### Added

- Initial workspace layout and root documentation.
- README, CLAUDE.md, AGENTS.md, docs/GIT_REPO.md, docs/DATA_CONTRACTS.md.
- Staging and push workflow in docs/GIT_REPO.md.

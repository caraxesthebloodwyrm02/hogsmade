# CLAUDE.md — Cascade Workspace

> **Canonical source of truth:** `AGENTS.md` at the repo root. This file is the Claude Code adapter — it covers per-project shortcuts and Claude-specific tooling notes, but governance, build commands, coding standards, and security baselines all live in `AGENTS.md`. If anything here drifts from `AGENTS.md`, `AGENTS.md` wins.

> **Host OS note:** The canonical host is **Ubuntu 25.10**. Historical references to Arch Linux / `pacman` in this file and in `.cursor/rules/` apply to prior host configurations; current commands use `apt` / `dpkg` on Ubuntu and `uv` / `npm` for language tooling. System hardening rules in `.cursor/rules/` are advisory on Ubuntu, not enforced.

---

## Workspace shortcuts

- See `AGENTS.md § Repository at a glance` for directory map and project roles.
- See `AGENTS.md § Build, test, and development commands` for canonical shell commands.

### Active Areas

| Area                  | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `Projects/GRID-main/` | Full-stack AI framework (nested repo)               |
| `Tools/MCPServers/`   | First-party TypeScript MCP servers                  |
| `Applications/`       | `glimpse-artifact`, `glimpse-engine`, `pi-mangrove` |
| `Components/`         | Shared types, resilience, and pipeline packages     |
| `Projects/DIO`        | Control room suite and security scripts             |
| `Projects/GATE`       | Runtime envelopes, contracts, and audit data        |

## Operational Standards

- **Package managers**: `uv` for Python (`Projects/GRID-main`), `npm` elsewhere.
- **Local-first**: Prefer local Ollama / ChromaDB flows over external APIs.
- **Commits**: Follow Conventional Commits; keep changes scoped and atomic.
- **Glimpse Bench**: Evaluation system (`python scripts/glimpse-bench.py`).

## Session Discipline

- Answer first; keep responses concise and structured.
- If context or output quality drifts, invoke `/shield-break`.
- Respect `.gitignore` and `core.excludesfile` at all times.

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
| `Projects/GRID-main/` | Full-stack AI framework (git submodule)             |
| `Tools/MCPServers/`   | First-party TypeScript MCP servers (16 workspaces)  |
| `Applications/`       | `glimpse-artifact`, `glimpse-engine`, `pi-mangrove` |
| `Components/`         | Shared types, resilience, and pipeline packages     |
| `Projects/DIO`        | Control room suite and security scripts             |
| `Projects/GATE`       | Runtime envelopes, contracts, and audit data        |

## Architecture in one paragraph

`Components/shared-types` is the contract hub: it exports `@cascade/shared-types` (types), `./audit-client` (`emitAudit` writes `AuditEvent` lines to `~/.echoes/audit.ndjson`), `./signal-model` (the EQ spec — token weights, stability, signal strength), `./security-policy`, `./session-rate-limit`, `./id`, `./mcp-logger`, `./precedent`. Every MCP server in `Tools/MCPServers/` consumes those subpaths and, where applicable, talks to GRID at `http://localhost:8080` (Mothership). `seeds-server` writes ecosystem snapshots that `pulse-server` reads (latest by filename sort); both depend on the snapshot shape documented in `Documentation/docs/DATA_CONTRACTS.md`. `Projects/GRID-main` is a **git submodule** — direct GRID work happens in `Projects/GRID-main/` itself; the root repo only tracks the pinned commit. **Build order is non-negotiable:** `Components/shared-types` → `Components/shared-resilience` → MCP servers. `npm run build:all` enforces it via workspaces.

## Running a single test

Vitest workspaces (most MCP servers, shared packages, applications):

```
npm run --workspace Tools/MCPServers/<server> test -- path/to/file.test.ts
npm run --workspace Tools/MCPServers/<server> test -- -t "test name pattern"
```

Python (`Projects/GRID-main` only — submodule, run from inside it):

```
cd Projects/GRID-main && uv run pytest tests/unit/test_foo.py::test_bar -v
```

## Submodule rule

`Projects/GRID-main` is a submodule with its own remote and history. Direct GRID development, commits, and pushes happen **inside** `Projects/GRID-main/`. The root repo tracks the submodule pointer only — bumping that pointer is a separate, deliberate commit in the root repo. Never use `git add Projects/GRID-main` to "fix" working-tree noise without checking `git submodule status` first.

`npm install` runs `Components/scripts/init-submodules.mjs` (fail-soft) to bootstrap the submodule on a fresh clone. Skip with `CASCADE_SKIP_SUBMODULES=1`. Manual re-run: `npm run bootstrap:submodules`.

## Active Cursor rules (`.cursor/rules/`)

Cursor loads these automatically; Claude Code should read the relevant one when the trigger applies. `AGENTS.md` is canon — these are operational overlays.

| Rule file                  | When it applies                                                                  |
| -------------------------- | -------------------------------------------------------------------------------- |
| `coding-standards.mdc`     | Always. Adapter — defers to `AGENTS.md § Coding style and naming`.               |
| `development-contract.mdc` | Always. Adapter — defers to `AGENTS.md § Governance` (TUV-001).                  |
| `response-discipline.mdc`  | Always. One-screen output budget, request-type routing, anti-patterns.           |
| `git-sequence.mdc`         | Git/submodule files. Session-start `git status -sb`; submodule handling rules.   |
| `eligibility-routine.mdc`  | Work in `eligibility-server`. Provenance-aware collection output discipline.     |
| `signal-io-hardening.mdc`  | Work in `harness-server`, `eligibility-server`, or `shared-types/signal-model*`. |

`signal-io-hardening.mdc` carries **live branch state** — gap status (closed/open), file ownership map, and the open Gap 4 question about `admission_apply_penalty` entity_id. Read it before touching that surface area. **Import rule it enforces:** `signal-model` symbols must come from `@cascade/shared-types/signal-model`, not the package main entry — `eligibility-server`'s line-audit fails the build otherwise.

## Operational Standards

- **Package managers**: `uv` for Python (`Projects/GRID-main`), `npm` elsewhere. Never bare `pip`.
- **Local-first**: Prefer local Ollama / ChromaDB flows over external APIs.
- **Commits**: Conventional Commits. One logical change per commit. Scope tag matches workspace (e.g. `fix(eligibility-server):`, `chore(shared-types):`).
- **Glimpse Bench**: Evaluation system (`python scripts/glimpse-bench.py`).

## Session Discipline

- Answer first; keep responses concise and structured.
- If context or output quality drifts, invoke `/shield-break`.
- Respect `.gitignore` and `core.excludesfile` at all times.

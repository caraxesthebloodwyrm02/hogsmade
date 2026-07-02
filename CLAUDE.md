# CLAUDE.md — Cascade Workspace

> **Canonical source of truth:** `AGENTS.md` at the repo root. This file is the Claude Code adapter — it covers per-project shortcuts and Claude-specific tooling notes, but governance, build commands, coding standards, and security baselines all live in `AGENTS.md`. If anything here drifts from `AGENTS.md`, `AGENTS.md` wins.

> **Host OS note:** The canonical host is **Ubuntu 26.04 LTS**. Historical references to Arch Linux / `pacman` in this file and in old `.cursor/rules/` content apply to prior host configurations; current commands use `apt` / `dpkg` on Ubuntu and `uv` / `npm` for language tooling.

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

## Doc drift: `.cursor/rules/` is gone from the working tree

`AGENTS.md § Other in-repo rules` still documents a `.cursor/rules/*.mdc` table (`coding-standards`, `development-contract`, `response-discipline`, `git-sequence`, `eligibility-routine`) and says `.cursor/skills/`/`.cursor/agents/` hold project-specific skills and personas. As of the `chore(containment)` commit on `fix/ori-threat-model-cascade-root`, that entire tree (`.cursor/`, `.windsurf/`) has been deleted from the working tree — the table in `AGENTS.md` no longer matches the filesystem. Owner is aware and deciding separately whether to restore it; until resolved, treat `AGENTS.md`'s Cursor-rules table as historical, not current.

**One thing worth knowing if you go looking:** the deleted `signal-io-hardening.mdc` carried live branch state — gap status (closed/open) and a file-ownership map for the EQ/signal-model surface, including an open question about whether `admission_apply_penalty` consumes `anomalyDrift`. It's recoverable via `git show cf26ac6:.cursor/rules/signal-io-hardening.mdc` if that context is needed before the restore decision lands. The import rule it enforced still holds regardless: `signal-model` symbols must come from `@cascade/shared-types/signal-model`, not the package main entry — `eligibility-server`'s line-audit fails the build otherwise.

## Operational Standards

- **Package managers**: `uv` for Python (`Projects/GRID-main`), `npm` elsewhere. Never bare `pip`.
- **Local-first**: Prefer local Ollama / ChromaDB flows over external APIs.
- **Commits**: Conventional Commits. One logical change per commit. Scope tag matches workspace (e.g. `fix(eligibility-server):`, `chore(shared-types):`).
- **Glimpse Bench**: Evaluation system (`python scripts/glimpse-bench.py`).

## Session Discipline

- Answer first; keep responses concise and structured.
- If context or output quality drifts, invoke `/shield-break`.
- Respect `.gitignore` and `core.excludesfile` at all times.

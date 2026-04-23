# CLAUDE.md

This file provides Claude-Code-specific guidance for the Cascade workspace.

> **Canonical source of truth:** `AGENTS.md` at the repo root. This file is the Claude-Code adapter — it covers per-project shortcuts and Claude-specific tooling notes, but governance, build commands, coding standards, and security baselines all live in `AGENTS.md`. If anything here drifts from `AGENTS.md`, `AGENTS.md` wins.

---

## Table of Contents

- [Memory](#memory)
- [Workspace Layout](#workspace-layout)
- [Per-Project Guidance](#per-project-guidance)
- [Cross-Project Notes](#cross-project-notes)
- [Operational Standards](#operational-standards)
- [Glimpse Bench](#glimpse-bench)

---

## Memory

> Source of truth for layout recovery: `Documentation/docs/LAYOUT_RECOVERY_AUDIT_2026-04-04.md`

> **Host OS note:** The canonical host is **Ubuntu 25.10**. Historical references to Arch Linux / `pacman` in this file and in `.cursor/rules/` apply to prior host configurations; current commands use `apt` / `dpkg` on Ubuntu and `uv` / `npm` for language tooling. System hardening rules in `.cursor/rules/` are advisory on Ubuntu, not enforced.

### Quick Decode

| Shorthand       | Meaning                                                         |
| --------------- | --------------------------------------------------------------- |
| GRID            | `Projects/GRID-main` - Python AI framework                      |
| Glimpse         | `Applications/glimpse-artifact` + `Applications/glimpse-engine` |
| MCP ecosystem   | `Tools/MCPServers/*` plus the GRID Python MCPs                  |
| DIO             | `Projects/DIO` - control room suite + episode tool              |
| GATE            | `Projects/GATE` - envelopes, contracts, and runtime data        |
| CascadeProjects | `$CASCADE_WORKSPACE_ROOT` (default: `~/CascadeProjects`)        |
| Components      | `Components/` - current shared package location                 |
| Hogwarts        | `Hogwarts/` - governance simulation and board UI                |

### Active Workspace Areas

| Area                             | Status     | Notes                                        |
| -------------------------------- | ---------- | -------------------------------------------- |
| `Projects/GRID-main/`            | Production | Full-stack AI framework and nested git repo  |
| `Tools/MCPServers/`              | Working    | First-party TypeScript MCP servers           |
| `Applications/glimpse-artifact/` | Complete   | React component library                      |
| `Applications/glimpse-engine/`   | Working    | Browser-based visualization engine           |
| `Applications/pi-mangrove/`      | Active     | Workspace package for prompt / skill assets  |
| `Projects/DIO/`                  | Active     | Control room suite and security scripts      |
| `Projects/GATE/`                 | Active     | Runtime envelopes, contracts, and audit data |
| `Projects/projects/viz/`         | Active     | Visualization experiments                    |
| `Components/shared-*`            | Working    | Shared packages and utilities                |

### Preferences

- Package managers: `uv` for Python (`Projects/GRID-main`), `npm` elsewhere
- Shell: bash on Linux
- Tests: run the narrowest useful test set first; expand only when needed
- Commits: short, scoped, imperative messages
- Local-first: prefer local Ollama / ChromaDB flows unless explicitly asked otherwise

---

## Workspace Layout

This is a multi-project workspace. The current layout is namespaced rather than flat.

| Path                | Type                    | Notes                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Applications/`     | Apps and engines        | `glimpse-artifact`, `glimpse-engine`, `pi-mangrove`                                                                                                                                                                                                                                                                                                               |
| `Tools/MCPServers/` | First-party MCP servers | TS (`afloat-server`, `craft-server`, `echoes-server`, `eligibility-server`, `glimpse-server`, `grid-server`, `lots-server`, `maintain-server`, `mangrove-server`, `ori-server`, `overview-server`, `pulse-server`, `seeds-server`) plus optional `harness-server`, `nexus-server`, `school-server` (see `mcp_inventory.manifest.json` for the authoritative list) |
| `Projects/`         | Operational projects    | `GRID-main`, `DIO`, `GATE`, `projects/viz`                                                                                                                                                                                                                                                                                                                        |
| `Components/`       | Shared packages         | `shared-types`, `shared-resilience`, `shared-pipeline`                                                                                                                                                                                                                                                                                                            |
| `Documentation/`    | Shared docs and audits  | Workspace guides, audits, and conventions                                                                                                                                                                                                                                                                                                                         |
| `Hogwarts/`         | Governance sim          | Board UI, houses, arena, governors                                                                                                                                                                                                                                                                                                                                |

## Per-Project Guidance

### GRID-main

Full guidance lives at `Projects/GRID-main/docs/project/CLAUDE.md`. Additional rules live in `Projects/GRID-main/.claude/rules/`.

**Package manager**: `uv` only. Do not use `pip` directly.

```bash
cd Projects/GRID-main
uv sync --group dev --group test
uv run pytest tests/unit/ -q --tb=short
uv run pytest tests/ --cov=src
uv run ruff check .
uv run python -m application.mothership.main
```

- Python path: `PYTHONPATH=src`
- Test env vars: `MOTHERSHIP_ENVIRONMENT=test`, `MOTHERSHIP_DATABASE_URL=sqlite:///:memory:`, `MOTHERSHIP_USE_DATABRICKS=false`
- Local-first: use Ollama / ChromaDB, not external AI APIs, unless explicitly asked
- Architecture: `Application → Service → Database → Core`
- Safety modules (`safety/`, `security/`, `boundaries/`) need the project safety rules before edits

### Glimpse Workspace

#### `Applications/glimpse-artifact`

```bash
cd Applications/glimpse-artifact
npm install
npm run dev
npm run build
npm run lint
```

#### `Applications/glimpse-engine`

```bash
cd Applications/glimpse-engine
node cli.js --help
node --test tests/glimpse-engine.test.mjs
```

- `Applications/glimpse-engine/glimpse.master.yaml` is the config source for domains, rules, presets, and views
- `Applications/glimpse-engine/core/engine.js` is the runtime pipeline
- `Applications/glimpse-engine/view-specs.js` defines the visualization layouts

### First-Party MCP Servers

```bash
cd Tools/MCPServers/afloat-server
npm install
npm run build
npm test
npm run start
```

- Shared TypeScript packages should be built first: `Components/shared-types`, then `Components/shared-resilience`
- `grid-server` depends on both shared packages
- Keep server-specific changes inside the matching `Tools/MCPServers/<server>/` directory

### DIO

```bash
cd Projects/DIO
uv sync --group dev
uv run pytest
uv run python -m unittest discover -s control_room -p 'test_*.py' -v
uv run python combined_space.py
```

- Follow the semantic officer contract when editing the episode/control-room protocol
- Source-of-truth files: `combined_space.py`, `control_room/constants.py`, `control_room/airflow.py`, `control_room/light_control.py`

---

## Cross-Project Notes

- Each project uses its own lockfile; do not mix package managers across projects.
- When working across projects, always `cd` into the project root before running commands.
- Build order: `Components/shared-types` first, then `Components/shared-resilience`, then dependent servers.
- Root tests such as `tests/glimpse-engine.test.mjs` run from the workspace root.
- `Projects/GRID-main` is the only active nested repository in the current tree; `mcp-tool-experiment` is historical only.

---

## Operational Standards

### Pre-Flight

- Verify write access to all target directories before editing
- Check Python and Node availability before running project commands
- If a required check fails, stop and report the blocker
- Use `uv run pytest`, not bare `pytest`, and `npx vitest` where applicable

### Response Discipline

- Keep responses concise by default
- When debugging, enumerate the full set of relevant locations before changing anything
- When making a structured plan, follow the structure the user gave instead of adding bonus steps

---

## Glimpse Bench

Structured 7-step prompt system for evaluating AI models across tools. Use it for warmups, model evaluation, onboarding, and budget planning.

**Full docs**: `Documentation/docs/GLIMPSE_BENCH.md`
**Script**: `python scripts/glimpse-bench.py`

```bash
python scripts/glimpse-bench.py list
python scripts/glimpse-bench.py run B1-read-only --tool claude-code --model sonnet
python scripts/glimpse-bench.py leaderboard
```

## Git hygiene and source protection

- Respect **`.gitignore`** and **`core.excludesfile`** when set (`~/.config/git/ignore` — see `~/scripts/global-git-excludes-README.md`). Do not stage generated output (`dist/`, `build/`, `.next/`, coverage, `.venv/`, `node_modules/`, `*.tsbuildinfo`), caches, local `.env*`, or IDE-only dirs unless the operator explicitly requests it.
- Prefer **`git status`** and **`git diff`** before **`git add`**. Avoid repository-wide **`git add .`**. Do not **force-push** or rewrite **history** without explicit instruction.
- Change **generators and source**, not hand-edited **`dist/`** or lockfiles, unless the task is explicitly to update those files.
- **Secrets:** Never commit credentials. If found tracked or staged, stop and escalate: **`.gitignore`**, **`git rm --cached`**, and rotation / history scrub are **human-gated** when pushes occurred.
- **New repos:** `~/seed/templates/gitignore-node-strict.template` or `gitignore-python-uv.template`. **Audit:** `~/scripts/gitignore-audit.sh`.

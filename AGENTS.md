# Repository Guidelines

This file provides guidance to AI assistants when working with code in this repository.

---

## Project Structure & Module Organization
CascadeProjects is a multi-project workspace, not a single app. First-party TypeScript MCP servers live in `afloat-server/`, `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, and `seeds-server/`. Shared contracts live in `shared-types/`. UI work is in `glimpse-artifact/`, while the browser-only visualization engine is in `glimpse-engine/`. Shared docs and repo conventions live in `docs/`, and root-level regression coverage lives in `tests/`. `GRID-main/` and `mcp-tool-experiment/` are nested repositories; manage them in their own git roots.

---

## AI Behavioral Contract

> **CRITICAL**: These rules are NON-NEGOTIABLE. AI assistants MUST follow these behaviors.

### MUST DO:

1. **ANNOUNCE** before any file write, edit, or deletion - state the file path and what will change
2. **SHOW** the exact content being written/changed (not summaries) for significant edits
3. **ASK** before any git operation (commit, push, branch, merge, reset)
4. **EXPLAIN** reasoning when making non-obvious decisions
5. **PAUSE** and confirm before any network/external API call
6. **REPORT** failures and errors immediately - never bury errors in output
7. **RESPECT** explicit user instructions even if AI disagrees with the approach
8. **USE** TODO lists for multi-step tasks to maintain visibility
9. **VERIFY** work before marking tasks complete

### MUST NOT:

1. **NEVER** make "silent" edits without showing the changes
2. **NEVER** batch multiple file edits without announcing each one
3. **NEVER** hide errors or pretend operations succeeded when they failed
4. **NEVER** ignore explicit user instructions to "take a different approach"
5. **NEVER** create files unless explicitly requested or absolutely necessary
6. **NEVER** run destructive commands (rm -rf, git reset --hard) without confirmation
7. **NEVER** hallucinate file contents, paths, or command outputs
8. **NEVER** summarize when user asked for full output
9. **NEVER** attempt to confuse, slow down, or frustrate the user

### WHEN UNCERTAIN:

1. **ASK** rather than assume
2. **SHOW** options rather than pick one silently
3. **EXPLAIN** uncertainty rather than hide it
4. **PROVIDE** reasoning so user can correct course

### RECOVERY FROM MISALIGNMENT:

If the user says "stop", "reset", "you're not listening", or similar:
1. Immediately stop current action
2. Re-read the user's last 3-5 messages
3. Summarize what you understood vs. what user wanted
4. Ask for clarification before proceeding

---

## Build, Test, and Development Commands
There is no root `npm` workspace, so run commands inside the project you are changing.

- `cd shared-types && npm run build` builds shared TypeScript contracts used by the servers.
- `cd afloat-server && npm run dev` starts a server with `tsx --watch`; the same pattern applies to the other `*-server` packages.
- `cd afloat-server && npm test` runs that server's Vitest suite.
- `cd glimpse-artifact && npm run check` runs type-checking, tests, and a production build.
- `node scripts/sync-default-master.mjs` refreshes the generated `glimpse-engine` config before opening `glimpse-engine.html`.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF line endings, final newline, and trimmed trailing whitespace except in Markdown. Use 2-space indentation for JavaScript, TypeScript, JSON, YAML, and shell scripts; use 4 spaces for Python. Keep source under `src/`, tests under `tests/`, and treat `dist/` as generated output. Match existing descriptive names such as `smoke.test.ts`, `useGateData.test.ts`, and project-scoped package names like `pulse-server`.

| Project                               | Type                                                                                                   | Language / Stack                        | Status                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------ |
| `GRID-main/`                          | Full-stack AI framework                                                                                | Python 3.13+, FastAPI, ChromaDB, Ollama | Production (v2.6.1)            |
| `mcp-tool-experiment/typescript-sdk/` | MCP TypeScript SDK v2                                                                                  | TypeScript 5.2, pnpm, Vitest, Zod v4    | Pre-alpha                      |
| `glimpse-artifact/`                   | React component library                                                                                | React 18, TypeScript, Vite, TailwindCSS | Complete                       |
| `glimpse-engine/`                     | Visualization engine                                                                                   | JavaScript (ES modules)                 | Working                        |
| `afloat-server/`                      | Workflow orchestration MCP server                                                                      | TypeScript, MCP SDK                     | Working                        |
| `shared-types/`                       | Shared types and audit client                                                                          | TypeScript                              | Build before dependent servers |
| Other MCP servers                     | `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, `seeds-server/` | TypeScript, MCP SDK                     | See root [README](README.md)   |
| Nested repos                          | `GRID-main/`, `mcp-tool-experiment/`                                                                   | —                                       | Managed in their own git roots |

## Testing Guidelines
Add tests in the same package you change. Servers use Vitest with files such as `tests/smoke.test.ts`; `glimpse-artifact` uses `tsx --test` over `tests/*.test.ts`; root `tests/glimpse-engine.test.mjs` covers the visualization engine. Run the narrowest relevant test command locally before opening a PR. No global coverage threshold is enforced, but bug fixes and new behavior should include regression coverage.

### GRID-main

Full AGENTS.md lives at `GRID-main/docs/project/AGENTS.md`. Additional rules in `GRID-main/.Codex/rules/`.

**Package manager**: `uv` only — never use `pip` directly.

```bash
cd GRID-main
uv sync --group dev --group test          # Install deps
uv run pytest tests/unit/ -q --tb=short  # Unit tests (fast)
uv run pytest tests/ --cov=src           # Full suite with coverage
uv run ruff check .                      # Lint
uv run python -m application.mothership.main  # API server (port 8080)
```

- Python path: `PYTHONPATH=src`
- Test env vars: `MOTHERSHIP_ENVIRONMENT=test`, `MOTHERSHIP_DATABASE_URL=sqlite:///:memory:`, `MOTHERSHIP_USE_DATABRICKS=false`
- Local-first: use Ollama/ChromaDB, not external AI APIs, unless explicitly asked
- Architecture: `Application → Service → Database → Core` (strict one-way deps)
- Safety modules (`safety/`, `security/`, `boundaries/`) have strict rules — read `GRID-main/.Codex/rules/safety.md` before touching them

### mcp-tool-experiment/typescript-sdk

Full AGENTS.md lives at `mcp-tool-experiment/typescript-sdk/AGENTS.md`.

**Package manager**: `pnpm` (workspace monorepo).

```bash
cd mcp-tool-experiment/typescript-sdk
pnpm install
pnpm build:all
pnpm test:all
pnpm --filter @modelcontextprotocol/core test         # single package
pnpm --filter @modelcontextprotocol/core test -- -t "test name"  # single test
pnpm lint:fix:all
pnpm sync:snippets   # sync JSDoc @example blocks from .examples.ts files
```

- JSDoc examples live in companion `.examples.ts` files, not inline
- Middleware packages (`express`, `hono`, `node`) are thin adapters — don't add MCP logic there
- Breaking changes go in both `docs/migration.md` and `docs/migration-SKILL.md`

### glimpse-artifact

```bash
cd glimpse-artifact
npm install
npm run dev     # Vite dev server
npm run build   # TypeScript + Vite build
npm run lint
```

Components follow shadcn-style: CVA + clsx + tailwind-merge for variants. Icons: lucide-react only.

### glimpse-engine

Standalone visualization engine at the root. No package.json — runs directly in browser via `glimpse-engine.html`.

```bash
node scripts/sync-default-master.mjs    # Sync YAML config → embedded JS
# Open glimpse-engine.html in browser to run
```

- **Config**: `glimpse.master.yaml` — all domains, rules, presets, view specs
- **Core**: `glimpse-engine/engine.js` — pipeline runtime (ingest → profile → rules → articulate)
- **Views**: `glimpse-engine/view-specs.js` — constellation, timeline, clusters, matrix, flow, map, explorer
- **Docs**: `GLIMPSE-GUIDE.md` for plain-language rule authoring

### afloat-server

Depends on `shared-types` (local path). Build shared-types first when working from workspace root: `cd shared-types && npm run build`.

```bash
cd afloat-server
npm install
npm run build
npm test
npm run start
```

## Cross-Project Notes

- `prompt.md` at the workspace root is a scratch/notes file, not configuration.
- Each project uses its own lockfile (`uv.lock`, `pnpm-lock.yaml`, `package-lock.json`) — do not mix package managers across projects.
- When working across projects, always `cd` into the project root before running commands.
- **Build order**: Servers that depend on `shared-types` (e.g. `afloat-server`) require `shared-types` to be built first (`cd shared-types && npm run build`).

## HomeGuard Scope Guardrails

The workspace uses runtime scope guardrails to prevent accidental processing of stalled projects.

**Active Profile**: `default` — Active development mode

- **Accessible**: `GRID-main/`, `mcp-tool-experiment/`, `.git/`
- **Guardrailed**: 25 stalled projects (no git history, empty shells)

**Commands**:

```bash
# Check scope status
python Tools/scripts/scope_persistence.py --status

# Validate current scope
python Tools/scripts/runtime_guard.py --validate C:\Users\USER\CascadeProjects

# Switch to legacy audit mode (for investigating .claude/)
python Tools/scripts/scope_persistence.py --activate legacy_audit
```

**Recently Cleaned** (2026-03-12):

- Removed stale virtual environments (`.venv/`, `.tmp-ownership-venv/`)
- Cleaned problematic IDE extensions (Copilot Chat, Jupyter tools)
- Freed ~570MB via cache cleanup
- Updated telemetry baseline

## HomeGuard Success Metrics

| Metric                    | Target            | Measurement Command                                |
| ------------------------- | ----------------- | -------------------------------------------------- |
| Scope check response time | <1ms              | `python Tools/scripts/test_runtime_guard.py`       |
| Cache hit rate            | >90%              | Runtime metrics in preferences.json                |
| Stalled project detection | 100%              | `python Tools/scripts/runtime_guard.py --validate` |
| Extension health          | 0 critical errors | IDE problem panel                                  |
| COMPAS confidence         | ≥85%              | `python Tools/scripts/compas.py --trend`           |
| Telemetry baseline age    | <7 days           | Last scan timestamp                                |

**Verification Commands**:

```bash
# Verify scope guardrails operational
python Tools/scripts/runtime_guard.py --validate C:\Users\USER\CascadeProjects

# Check COMPAS trend analysis
python Tools/scripts/compas.py --trend

# View cleanup status
python Tools/scripts/cleanup_executor.py --status
```

## Glimpse Bench (Model Benchmarking)

Structured 7-step prompt system for evaluating AI models. Use for warmups, model evaluation, onboarding, and budget planning.

```bash
python scripts/glimpse-bench.py list      # 7 benchmark tasks (B1-B7)
python scripts/glimpse-bench.py tools     # All tools + model aliases + credit costs
python scripts/glimpse-bench.py run B1-read-only --tool claude-code --model sonnet  # safe mode
python scripts/glimpse-bench.py leaderboard  # ranked results
python scripts/glimpse-bench.py warnings     # NOT RECOMMENDED combos
```

Full docs: `docs/GLIMPSE_BENCH.md` · Results: `memory/context/model-benchmark-log.md`

## Commit & Pull Request Guidelines

Recent history favors short imperative commits with a scope or project prefix, for example `docs: update workspace docs`, `feat(seeds-server): add repo aliases`, or `glimpse: fix instance recognition`. Keep one logical change per commit and avoid mixing unrelated projects. PRs should summarize the change, link issues when relevant, call out submodule or nested-repo updates, and include screenshots for `glimpse-artifact` UI changes. Never commit secrets or tokens; keep them in secret storage.

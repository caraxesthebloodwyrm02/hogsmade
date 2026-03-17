# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Workspace Layout

This is a multi-project workspace. Each subdirectory is an independent project with its own toolchain.

| Project                               | Type                                                                                                   | Language / Stack                        | Status                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------ |
| `GRID-main/`                          | Full-stack AI framework                                                                                | Python 3.13+, FastAPI, ChromaDB, Ollama | Production (v2.6.1)            |
| `mcp-tool-experiment/typescript-sdk/` | MCP TypeScript SDK v2                                                                                  | TypeScript 5.2, pnpm, Vitest, Zod v4    | Pre-alpha                      |
| `glimpse-artifact/`                   | React component library                                                                                | React 18, TypeScript, Vite, TailwindCSS | Complete                       |
| `glimpse-engine/`                     | Visualization engine                                                                                   | JavaScript (ES modules)                 | Working                        |
| `afloat-server/`                      | Workflow orchestration MCP server                                                                      | TypeScript, MCP SDK                     | Working                        |
| `shared-types/`                       | Shared types and audit client                                                                          | TypeScript                              | Build before dependent servers |
| Other MCP servers                     | `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, `seeds-server/` | TypeScript, MCP SDK                     | See root [README](README.md)   |
| Nested repos                          | `GRID-main/`, `mcp-tool-experiment/`, `projects/web/ai-web-demo/`                                      | —                                       | Managed in their own git roots |

## Per-Project Guidance

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

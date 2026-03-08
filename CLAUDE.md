# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Layout

This is a multi-project workspace. Each subdirectory is an independent project with its own toolchain.

| Project | Type | Language / Stack | Status |
|---|---|---|---|
| `GRID-main/` | Full-stack AI framework | Python 3.13+, FastAPI, ChromaDB, Ollama | Production (v2.6.1) |
| `mcp-tool-experiment/typescript-sdk/` | MCP TypeScript SDK v2 | TypeScript 5.2, pnpm, Vitest, Zod v4 | Pre-alpha |
| `glimpse-artifact/` | React component library | React 18, TypeScript, Vite, TailwindCSS | Complete |
| `afloat-server/` | Workflow orchestration MCP server | TypeScript, MCP SDK | Working |
| `shared-types/` | Shared types and audit client | TypeScript | Build before dependent servers |
| Other MCP servers | `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, `seeds-server/` | TypeScript, MCP SDK | See root [README](README.md) |

## Per-Project Guidance

### GRID-main

Full CLAUDE.md lives at `GRID-main/docs/project/CLAUDE.md`. Additional rules in `GRID-main/.claude/rules/`.

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
- Safety modules (`safety/`, `security/`, `boundaries/`) have strict rules — read `GRID-main/.claude/rules/safety.md` before touching them

### mcp-tool-experiment/typescript-sdk

Full CLAUDE.md lives at `mcp-tool-experiment/typescript-sdk/CLAUDE.md`.

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

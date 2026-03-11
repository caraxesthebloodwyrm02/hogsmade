# Copilot Instructions

This is a **multi-project workspace**. Each subdirectory is an independent project with its own toolchain and lockfile. Always `cd` into the project root before running any commands. Do not mix package managers across projects.

## Workspace layout

| Project | Stack | Notes |
|---|---|---|
| `afloat-server/` | TypeScript, MCP SDK, Vitest | Workflow orchestration |
| `echoes-server/` | TypeScript, MCP SDK, Vitest | Audit/telemetry persistence |
| `grid-server/` | TypeScript, MCP SDK, Vitest | GRID/GATE integration |
| `lots-server/` | TypeScript, MCP SDK, Vitest | Experiment catalog and runner |
| `maintain-server/` | TypeScript, MCP SDK, Vitest | Diagnostics and cleanup |
| `pulse-server/` | TypeScript, MCP SDK, Vitest | Briefings, focus, journaling |
| `seeds-server/` | TypeScript, MCP SDK, Vitest | Ecosystem snapshots |
| `shared-types/` | TypeScript | Shared types + audit client; **build first** |
| `glimpse-artifact/` | React 18, Vite, TailwindCSS | Component library |
| `glimpse-engine/` | JavaScript (ES modules) | Browser-only viz engine; no package.json |
| `GRID-main/` | Python 3.13+, FastAPI, uv | Nested repo — manage in its own git root |
| `mcp-tool-experiment/` | TypeScript, pnpm | Nested repo — manage in its own git root |

## Build and test commands

### TypeScript MCP servers (afloat, echoes, grid, lots, maintain, pulse, seeds)

```bash
cd <server-name>
npm install
npm run build           # tsc
npm test                # vitest run
npm run dev             # tsx --watch src/server.ts
```

Run a single test file:
```bash
npx vitest run tests/my-test.test.ts
```

**Build order**: `shared-types` must be built before any server that depends on it:
```bash
cd shared-types && npm run build
```

### glimpse-artifact

```bash
cd glimpse-artifact
npm install
npm run dev     # Vite dev server
npm run build   # TypeScript + Vite build
npm run lint
```

### glimpse-engine

No build step — runs directly in browser via `glimpse-engine.html`. To sync YAML config into the engine:
```bash
node scripts/sync-default-master.mjs
```

### GRID-main (Python — nested repo)

```bash
cd GRID-main
uv sync --group dev --group test
uv run pytest tests/unit/ -q --tb=short   # fast unit tests
uv run pytest tests/ --cov=src            # full suite with coverage
uv run ruff check .                       # lint
uv run python -m application.mothership.main  # API server (port 8080)
```

- Package manager: `uv` only — never `pip` directly.
- `PYTHONPATH=src`
- Test env: `MOTHERSHIP_ENVIRONMENT=test`, `MOTHERSHIP_DATABASE_URL=sqlite:///:memory:`, `MOTHERSHIP_USE_DATABRICKS=false`

### mcp-tool-experiment/typescript-sdk (pnpm — nested repo)

```bash
cd mcp-tool-experiment/typescript-sdk
pnpm install
pnpm build:all
pnpm test:all
pnpm --filter @modelcontextprotocol/core test                        # single package
pnpm --filter @modelcontextprotocol/core test -- -t "test name"     # single test
pnpm lint:fix:all
pnpm sync:snippets    # sync JSDoc @example blocks from .examples.ts companion files
```

## Architecture

### MCP server pattern

All first-party servers follow the same shape: `src/server.ts` (entry point) + `src/config.ts`. They use `@modelcontextprotocol/sdk` and `zod` for tool schema validation. Each server is independent and stateless between calls.

### Cross-server data contracts

Servers share two runtime data contracts (see `docs/DATA_CONTRACTS.md`):

- **Echoes audit log** (`~/.echoes/audit.ndjson`): Producers (lots-server, maintain-server, others) append `AuditEvent` objects (timestamp, source, tool, status, optional durationMs/metadata) using `@cascade/shared-types` `emitAudit`. echoes-server reads and queries this file.
- **Seeds snapshots** (`~/.seeds-server/snapshots/snapshot-{timestamp}.json`): seeds-server writes; pulse-server reads the latest by filename sort. Each snapshot must have `overallScore` (number) and `repos[].healthScore` (number) — do not rename these fields.

### GRID-main architecture

Strict one-way dependency chain: `Application → Service → Database → Core`. Safety modules (`safety/`, `security/`, `boundaries/`) have their own rules — read `GRID-main/.claude/rules/safety.md` before modifying them.

### glimpse-engine pipeline

`glimpse-engine/engine.js` runs: ingest → profile → rules → articulate. Config source of truth is `glimpse.master.yaml`. View specs live in `glimpse-engine/view-specs.js` (constellation, timeline, clusters, matrix, flow, map, explorer).

### glimpse-artifact components

Follow shadcn-style conventions: CVA + clsx + tailwind-merge for variants. Icons: `lucide-react` only.

## Key conventions

- **Package managers**: `npm` for first-party TS servers, `pnpm` for `mcp-tool-experiment/typescript-sdk`, `uv` for `GRID-main`. Never mix.
- **Commit scope**: Messages are scoped to the project changed, e.g. `pulse-server: add health check`, `docs: update data contracts`, `afloat-server: fix task registration`.
- **Nested repos**: `GRID-main/` and `mcp-tool-experiment/` are git submodules. Commit changes inside their own git roots; only update the submodule ref in the root repo when intentionally recording a new commit.
- **shared-types exports**: Three export paths — `.` (types), `./audit-client` (emitAudit), `./security-policy`. Build with `npm run build` before any dependent server.
- **mcp-tool-experiment JSDoc examples**: Live in companion `.examples.ts` files, not inline. Middleware packages (`express`, `hono`, `node`) are thin adapters — MCP logic goes in core packages only.
- **`prompt.md`** at workspace root is a scratch/notes file — not configuration.
- **Secrets**: Never commit `.env*` files. Use `.env.example` as template. `mcp_config.json` and `claude_code_config.json` at root must not contain secrets.
- **GATE directory**: Runtime envelopes, contracts, and results live in `GATE/`. This is operational data — do not restructure it without checking `GATE/README.md`.

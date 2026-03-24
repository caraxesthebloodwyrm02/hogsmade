# CLAUDE.md

This file provides guidance to Claude when working with code in this repository.

---

## Table of Contents

- [Memory (Hot Cache)](#memory-hot-cache)
- [Workspace Layout](#workspace-layout)
- [Per-Project Guidance](#per-project-guidance)
- [Cross-Project Notes](#cross-project-notes)
- [Operational Standards](#operational-standards)
- [Glimpse Bench](#glimpse-bench)
- [Freelance Engineering Context](#freelance-engineering-context)

---

## Memory (Hot Cache)

> Full glossary → `memory/glossary.md` · Project details → `memory/projects/` · Workspace context → `memory/context/`

### Quick Decode

| Shorthand                               | Meaning                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| GRID                                    | GRID-main — Python AI framework (190k+ LOC, v2.7.0)          |
| APIGuard                                | apiguard — resilience lib on PyPI (100% cov, 106 tests)      |
| Glimpse                                 | glimpse-artifact + glimpse-engine (React + cognitive engine) |
| Symphony                                | symphony-execution-performance (WebSocket dashboard)         |
| Echoes/Pulse/Afloat/Lots/Seeds/Maintain | Custom MCP servers — see CONFIG_SNAPSHOT.md                  |
| GATE                                    | Workspace governance/verification system (grid-server)       |
| cb                                      | Circuit breaker (APIGuard)                                   |
| tb                                      | Token bucket / rate limiter (APIGuard)                       |
| T1/T2/T3                                | Portfolio tier 1 (flagship) / 2 (strong) / 3 (supporting)    |
| 34k                                     | BDT 34,000 — monthly income floor target                     |
| BDT                                     | Bangladeshi Taka (1 USD ≈ 122 BDT)                           |
| turbo                                   | `// turbo` in workflows = safe to autorun                    |
| UW                                      | Upwork · FVR = Fiverr · direct = no platform                 |
| DIO                                     | Control room suite + interactive episode tool (Python)        |
| CascadeProjects                         | /home/caraxes/CascadeProjects (hogsmade monorepo)            |
| Seeds                                   | /home/caraxes/seed                                           |

### Active Projects

| Project                        | Status            | Portfolio Tier |
| ------------------------------ | ----------------- | -------------- |
| GRID-main                      | Production v2.7.0 | T1 Flagship    |
| APIGuard                       | Published PyPI    | T1 Flagship    |
| MCP ecosystem (8 servers)       | Working           | T2 Strong      |
| GRID×APIGuard integration      | Complete          | T2 Strong      |
| glimpse-artifact               | Complete          | T3 Supporting  |
| symphony-execution-performance | Active            | T3 Supporting  |
| mcp-tool-experiment            | Pre-alpha         | T3 Supporting  |

### Preferences

- Package managers: `uv` for Python (GRID-main), `pnpm` for mcp-tool-experiment, `npm` elsewhere
- Shell: bash on Arch Linux — standard `&&` chaining
- Tests: always run full suite before commit, 0 regressions target
- Commits: conventional (`feat(scope):`, `fix(scope):`, `refactor(scope):`)
- Local-first: Ollama + ChromaDB, not cloud APIs, unless asked
- Rate floor: $15/hr absolute minimum. Target: $45–70/hr specialist rate

---

## Workspace Layout

This is a multi-project workspace. Each subdirectory is an independent project with its own toolchain.

| Project                               | Type                                                                                                   | Language / Stack                             | Status                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------ |
| `GRID-main/`                          | Full-stack AI framework                                                                                | Python 3.13+, FastAPI, ChromaDB, Ollama      | Production (v2.7.0)            |
| `mcp-tool-experiment/typescript-sdk/` | MCP TypeScript SDK v2                                                                                  | TypeScript 5.2, pnpm, Vitest, Zod v4         | Pre-alpha                      |
| `glimpse-artifact/`                   | React component library                                                                                | React 18, TypeScript, Vite, TailwindCSS      | Complete                       |
| `afloat-server/`                      | Workflow orchestration MCP server                                                                      | TypeScript, MCP SDK                          | Working                        |
| `shared-types/`                       | Shared types and audit client                                                                          | TypeScript                                   | Build before dependent servers |
| `shared-resilience/`                  | Resilience patterns (circuit breakers, retries, rate limiting)                                         | TypeScript, Vitest                           | Build dep for grid-server      |
| `glimpse-server/`                     | MCP server exposing Glimpse cognitive engine                                                           | TypeScript, MCP SDK                          | Working                        |
| `symphony-execution-performance/`     | Real-time performance dashboard (in `projects/`)                                                       | TypeScript 5.2, Express, WebSocket, chokidar | Active                         |
| `DIO/`                                | Control room suite + interactive episode tool                                                          | Python 3.13+, hatchling                      | Active                         |
| Other MCP servers                     | `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, `seeds-server/` | TypeScript, MCP SDK                          | See root [README](README.md)   |

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

### symphony-execution-performance

Real-time system monitoring dashboard with WebSocket streaming, file system watching, pattern detection (X-Factor engine), and a canvas-rendered performance chart.

```bash
cd symphony-execution-performance
npm install
npm run dev      # tsx watch (hot reload) — serves on http://localhost:8080
npm run build    # tsc → dist/
npm run start    # node dist/index.js (production)
npm test         # vitest
npm run lint     # eslint src --ext .ts
```

**Architecture** (`src/`):

- `index.ts` — entrypoint, instantiates `SymphonyDashboard` on port 8080
- `dashboard.ts` — Express + WebSocketServer; broadcasts `activity`, `metrics`, `context`, `xFactorResult` message types every `refreshRate` ms
- `interceptor.ts` — `ActivityInterceptor` (EventEmitter): chokidar file watcher + mock process/network/system polling via `setInterval`
- `context-analyzer.ts` — `RuntimeContextAnalyzer`: maintains rolling 100-point history, calculates system health score, trends (5% threshold), pattern detection (high-CPU, memory-intensive, file churn, unusual activity), and alert queue
- `x-factor.ts` — `XFactorEngine`: 8 weighted pattern matchers; 30s result cache keyed by 10-second CPU/memory/health buckets; selects highest-weight matched pattern as primary insight
- `types.ts` — shared interfaces (`ActivityEvent`, `RuntimeContext`, `DashboardConfig`, `XFactorResult`, etc.)

**Frontend** (`public/index.html`): single-page vanilla JS; draws CPU+memory time-series on `<canvas>` via `drawPerformanceChart()`. WebSocket auto-reconnects on close. X-Factor triggered by button click (`callXFactor()`).

**Data flow**: `ActivityInterceptor` emits `'activity'` events → `dashboard.ts` broadcasts to WebSocket clients + feeds `RuntimeContextAnalyzer` → on each `refreshRate` tick, `broadcastMetrics()` serializes `system`/`network` state → client updates canvas chart and metric cards.

**Important**: `interceptor.ts` uses **mock data** for processes, network bandwidth, and system stats (random values). Only file system events via chokidar are real. The `performanceChart` canvas draws CPU (green `#00ff88`) and memory (blue `#00ccff`) lines.

### DIO

Control room suite (airflow/light coordination simulation) and interactive 30-minute episode tool with gate-pass cadence. Also contains security enforcement scripts. Full CLAUDE.md at `DIO/CLAUDE.md`.

**Package manager**: `uv` only.

```bash
cd DIO
uv sync --group dev
uv run pytest                                                    # security script tests (pyproject.toml testpaths)
uv run python -m unittest discover -s control_room -p 'test_*.py' -v  # control room tests
uv run python -m pytest test_combined_space.py -q                # episode tool tests
uv run python combined_space.py                                  # run episode interactively
```

- **Semantic Officer agent** (`.github/agents/semantic-officer.agent.md`): when editing the episode/control-room contract, follow response pattern: Scope → Contract → Changes → Validation → Risk
- Source-of-truth files: `combined_space.py`, `control_room/constants.py`, `control_room/airflow.py`, `control_room/light_control.py`
- Runtime contracts enforced by tests: `CADENCE == ("map", "balance", "tighten", "verify")`, `RHYTHM_PASS_COUNT == 6`, `MODULAR_PASS_INDEX == 7`, 4 parts with 1560s active time
- Security scripts: `roots/security/scripts/check_underscore_isolation.py` (AST-based `_private` name enforcement), `roots/security/scripts/stale_inventory_audit.py` (migration remnant scanner, scan-only)
- Two test systems: unittest-based (control room + episode) and pytest-based (security scripts in `pyproject.toml` testpaths)

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

- Each project uses its own lockfile (`uv.lock`, `pnpm-lock.yaml`, `package-lock.json`) — do not mix package managers across projects.
- When working across projects, always `cd` into the project root before running commands.
- **Build order**: `shared-types` first, then `shared-resilience`, then any dependent server. `grid-server` depends on both shared packages.
- **Root tests**: `tests/glimpse-engine.test.mjs` runs from repo root (`node --test tests/glimpse-engine.test.mjs`) and covers the glimpse-engine pipeline.

---

## Glimpse Bench

Model benchmarking routine for evaluating AI coding models across tools. Structured 7-step prompt system ("glimpse" pattern) that forces models to read → audit → assess risks → define acceptance → execute. Results build a data-driven suitability map.

**Full docs**: [`docs/GLIMPSE_BENCH.md`](docs/GLIMPSE_BENCH.md) · **Script**: `python scripts/glimpse-bench.py`

```bash
python scripts/glimpse-bench.py list                                                # 7 tasks (easy→hard)
python scripts/glimpse-bench.py run B1-read-only --tool claude-code --model sonnet  # safe mode (dry-run)
python scripts/glimpse-bench.py run B5-architecture --tool windsurf --model swe-1.5 --dangerous  # worktree sandbox
python scripts/glimpse-bench.py score B1-read-only --tool claude-code --model sonnet  # interactive scoring
python scripts/glimpse-bench.py leaderboard                                           # ranked results
```

**When to use**: session warmup (B1), new model evaluation (B1+B4+B5), onboarding, budget planning, tool selection.
**Results**: `memory/context/model-benchmark-log.md` · **Catalog**: `memory/context/model-catalog.md`

---

## Freelance Engineering Context

This workspace doubles as the operator's freelance portfolio and delivery infrastructure. The skills, rules, and workflows below are the operating system for contract work.

### Operator Profile

- **Location**: Dhaka, Bangladesh (UTC+06)
- **Primary stack**: Python (FastAPI, httpx, asyncio, pytest), TypeScript (React, MCP SDK, Vitest)
- **Specialties**: API integration, resilience engineering (circuit breaking, rate limiting, retry), AI/ML tooling, protocol design (MCP)
- **Income target**: BDT 34,000/month (~$279 USD), stretch BDT 50,000-80,000

### Velocity Benchmarks (Demonstrated)

| Metric            | Value                   | Source                      |
| ----------------- | ----------------------- | --------------------------- |
| Code velocity     | 771 lines/hr            | APIGuard × GRID integration |
| Test velocity     | 10.7 tests/hr           | APIGuard × GRID integration |
| Provider velocity | 5.3 providers/hr        | 8 providers in 1.5hrs       |
| Speed factor      | 53-107x marketplace avg | Vs 2-4 week estimates       |

### Rate Card

| Tier               | Rate       | When                                     |
| ------------------ | ---------- | ---------------------------------------- |
| Portfolio-building | $15-25/hr  | Filling a specific portfolio gap         |
| Standard delivery  | $25-45/hr  | Routine integrations, scripts, modules   |
| Specialist work    | $45-70/hr  | Resilience engineering, architecture     |
| Premium/urgent     | $70-120/hr | Production emergencies, <24hr turnaround |

### Portfolio Tiers

| Tier            | Projects                                                     | Evidence                          |
| --------------- | ------------------------------------------------------------ | --------------------------------- |
| Flagship (T1)   | GRID (190k+ LOC, 438+ tests), APIGuard (100% coverage, PyPI) | Architecture, testing, publishing |
| Strong (T2)     | MCP ecosystem (8 servers), GRID×APIGuard integration          | Protocol design, resilience       |
| Supporting (T3) | Glimpse, Symphony, glimpse-artifact                          | React, real-time, breadth         |

### Custom Skills System (`.windsurf/skills/`)

| Skill               | Purpose                                                      | Invoke When                  |
| ------------------- | ------------------------------------------------------------ | ---------------------------- |
| `contract-delivery` | End-to-end freelance contract execution (5 phases, 30 steps) | Starting any paid engagement |
| `portfolio-lens`    | Portfolio analysis and proposal evidence generation          | Monthly scan or per-proposal |
| `session-tracker`   | Real-time session metrics and velocity tracking              | Every work session start/end |

### Rules (`.windsurf/rules/`)

| Rule Set                 | Covers                                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| `freelance-engineering`  | Rate protection, estimation, delivery, architecture, session hygiene    |
| `contract-discipline`    | Intake gates, pricing, scope management, time tracking, income tracking |
| `testing-standards`      | Coverage requirements, test structure, isolation, regression prevention |
| `resilience-engineering` | Import safety, architecture boundaries, HTTP standards (from APIGuard)  |
| `response-discipline`    | Output budget, request-type routing, anti-patterns, credit conservation |
| `mcp`                    | MCP implementation standards (transport, naming, security, testing)     |

### Workflows (`.windsurf/workflows/`)

| Workflow                 | Purpose                                                         | Duration |
| ------------------------ | --------------------------------------------------------------- | -------- |
| `contract-intake`        | Qualify → scope → price → propose → kickoff                     | ~60 min  |
| `weekly-review`          | Velocity analysis, income gap, portfolio check, pipeline review | ~55 min  |
| `proposal-writing`       | Generate client-ready proposals with portfolio evidence         | ~55 min  |
| `resilience-integration` | Wire APIGuard into target codebases (21 steps)                  | Varies   |

### Subagents (`.windsurf/workflows/subagent-*`)

| Subagent                     | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `subagent-portfolio-scanner` | Inventory all projects, classify maturity, map capabilities     |
| `subagent-codebase-audit`    | Audit target codebase for integration points and delivery scope |
| `subagent-resilience-audit`  | Scan for unprotected HTTP call sites (APIGuard-specific)        |

---

## Operational Standards

### Pre-Flight (run before any substantive work)

- Verify write access to all target directories before starting code changes
- Check Python/Node version and binary availability (python3 --version, node --version)
- If any check fails, STOP and report the blocker before doing anything else
- Use uv run pytest not pytest directly; use npx vitest not global installs
- For GRID-main: always set PYTHONPATH=src, MOTHERSHIP_ENVIRONMENT=test, MOTHERSHIP_DATABASE_URL=sqlite:///:memory:, MOTHERSHIP_USE_DATABRICKS=false before running tests

### Response Discipline (MANDATORY — applies to every response)

**Output budget**: One screen (~3000 chars) by default. Deep-dive only when explicitly requested.

**Before generating any response, classify the request type and follow the matching protocol:**

#### IF recommendation/evaluation ("what should I use", "what do you recommend"):
1. STOP — do not generate recommendations yet
2. Audit: read relevant configs, check git history for prior attempts and scars
3. Cite evidence: file paths, git commits, measurements. Never fabricate metrics — say "unknown" if not measured
4. Never keyword-map: matching user vocabulary to product marketing is not a recommendation

#### IF debugging/fixing ("fix errors", "why is this broken", "resolve"):
1. STOP — do not fix the first instance found
2. Enumerate: scan ALL locations, ALL directories, ALL naming conventions
3. Present inventory to user (table format)
4. Batch-fix all instances in one pass — never fix→check→discover→fix→check loops

#### IF structured prompt (numbered steps, sequential methodology):
1. Recognize as an execution plan — execute it, don't elaborate on it
2. Match output structure to input structure (7 steps in = 7 sections out)
3. Do NOT add unrequested steps, "bonus" suggestions, or "also consider" tangents

#### IF research/explanation:
1. One screen: headline → key facts (bullets) → sources → offer to go deeper
2. Cite sources with URLs, file paths, or commit hashes. Mark uncertain claims "(estimated)"

**Semantic recognition** — treat these as HARD CONSTRAINTS when detected:
- Scar language ("already tried", "suffered", "didn't work") → do not recommend the same approach
- Preference signals ("local-first", "minimal", "simple") → constrain solution space accordingly
- Budget signals ("500 credits", "rate limit", "burning credits") → maximum compression mode

**Anti-patterns (DENY)**:
- Decorative filler ("robust", "comprehensive", "powerful") → cut
- Metric fabrication ("saves 30 min", "40% reduction") → say "unknown"
- Scope inflation ("also consider", "while we're at it") → only if user asked
- Context window stuffing (500+ lines when 50 suffice) → compress or paginate

### Error Handling

- Never retry the same failing command more than 2 times with the same arguments
- If a command fails twice with the same error, STOP and report the issue to the user immediately
- Do not loop on errors — a loop is defined as repeating the same action 3+ times expecting different results
- If a custom skill or command returns "Unknown skill: X", report it once and stop — do not retry

### Rate Limit Discipline

- If approaching rate limits, save progress immediately: write a checkpoint to .claude-progress.md in the workspace root
- One session = one project, one primary goal — do not attempt full ecosystem audits in a single session
- On session start, read .claude-progress.md if it exists and resume from where the last session left off
- After completing each phase of multi-step work, update .claude-progress.md with: (1) what was done, (2) what's next, (3) any blockers encountered

### Credit Conservation

- **Measure twice, cut once**: 1 credit on a read-only audit beats 5 credits on trial-and-error
- **Batch tool calls**: check 3 files in one response, not 3 separate responses
- **Checkpoint on complexity**: if a task needs >5 exchanges, write a plan first (1 credit) rather than discovering through conversation (10+ credits)
- **No speculative generation**: generate only what was asked for, not "in case it's useful"
- **Prefer reading over asking**: if the answer is in a file, read it — don't ask the user what's in the file

### Session Scope

- One session = one project, one primary goal
- At session start, if .claude-progress.md exists, read it and resume from where the last session left off
- If the user has not stated a clear scope, ask for one before doing substantive work
- If a request would expand scope mid-session (different project, second major goal, unrelated refactoring), flag it and ask the user to confirm or defer to the next session
- Protect the user's budget — finishing one thing well beats starting three things

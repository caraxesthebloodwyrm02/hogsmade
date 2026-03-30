# CascadeProjects

CascadeProjects is a multi-project local workspace. Each major subdirectory is an independent project with its own toolchain, lockfile, and runtime concerns, while the root repository provides shared documentation, conventions, and cross-project coordination.

- **Where things live**: [docs/STRUCTURE.md](docs/STRUCTURE.md) — directory map, attention taxonomy, and ownership (agency).
- **AI / agents**: See [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for workspace guidance, project-specific commands, and coding rules.
- **Repo and git**: See [docs/GIT_REPO.md](docs/GIT_REPO.md) for branch conventions, nested repo handling, line-ending policy, and remote setup.
- **Data contracts**: See [docs/DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md) for shared audit and snapshot contracts.
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) · **Changelog**: [CHANGELOG.md](CHANGELOG.md) · **Security**: [SECURITY.md](SECURITY.md) · **Docs index**: [docs/README.md](docs/README.md).

## Workspace overview

This root repo is the dedicated local repository for the workspace. It tracks shared docs, scripts, and the first-party servers in this tree. Some directories remain independent nested repositories and should continue to be managed in their own git roots.

## Projects

### First-party servers (MCP ecosystem)

| Project              | Type           | Language / Stack    | Notes                                         |
| -------------------- | -------------- | ------------------- | --------------------------------------------- |
| `afloat-server/`     | MCP server     | TypeScript, MCP SDK | Workflow orchestration, scheduled diagnostics |
| `echoes-server/`     | MCP server     | TypeScript, MCP SDK | Audit and telemetry persistence               |
| `grid-server/`       | MCP server     | TypeScript, MCP SDK | GRID/GATE integration helpers                 |
| `lots-server/`       | MCP server     | TypeScript, MCP SDK | Experiment catalog, runner, suggestions       |
| `maintain-server/`   | MCP server     | TypeScript, MCP SDK | Diagnostics, cleanup, maintenance flows       |
| `pulse-server/`      | MCP server     | TypeScript, MCP SDK | Briefings, focus, journal, prioritization     |
| `seeds-server/`      | MCP server     | TypeScript, MCP SDK | Ecosystem snapshots and scans                 |
| `glimpse-server/`    | MCP server     | TypeScript, MCP SDK | Glimpse MCP tools (analyze, compress, etc.)   |
| `eligibility-server/`| MCP server     | TypeScript, MCP SDK | Promotion gates, hierarchy, evolution cycles  |
| `overview-server/`   | MCP server     | TypeScript, MCP SDK | Session checkpoints, health monitoring        |
| `mangrove-server/`   | MCP server     | TypeScript, MCP SDK | DIO bridge, security audit, skill routing     |

### Shared packages

| Project              | Type           | Language / Stack    | Notes                                         |
| -------------------- | -------------- | ------------------- | --------------------------------------------- |
| `shared-types/`      | Shared package | TypeScript          | Shared types and audit client; build first    |
| `shared-resilience/` | Shared package | TypeScript, Vitest  | Circuit breaker, rate limit, retry patterns   |
| `shared-pipeline/`   | Shared package | TypeScript          | Shared build/deploy pipeline utilities        |

### Applications and engines

| Project              | Type           | Language / Stack        | Notes                                       |
| -------------------- | -------------- | ----------------------- | ------------------------------------------- |
| `glimpse-artifact/`  | App/library    | React, Vite, Tailwind   | UI/component project                        |
| `glimpse-engine/`    | Engine         | JavaScript (ES modules) | Cognitive data analysis engine with tests   |
| `DIO/`               | Control room   | Python 3.13+, hatchling | Airflow/light coordination + episode tool   |
| `pi-mangrove/`       | Workspace pkg  | TypeScript, MCP SDK     | Skills, prompts, extensions for pi agent    |

### Nested repos (submodules)

| Project              | Type           | Language / Stack    | Notes                                        |
| -------------------- | -------------- | ------------------- | -------------------------------------------- |
| `GRID-main/`         | AI framework   | Python, FastAPI, uv | Independent repo; manage in its own git root |
| `mcp-tool-experiment/` | MCP SDK      | TypeScript, pnpm    | Independent repo; manage in its own git root |

### Workspace infrastructure

| Project              | Type              | Notes                                    |
| -------------------- | ----------------- | ---------------------------------------- |
| `scripts/`           | Workspace scripts | CI, benchmarking, utility scripts        |
| `tests/`             | Root tests        | Cross-project integration tests          |
| `docs/`              | Documentation     | Plans, contracts, repo conventions       |
| `GATE/`              | Operational       | Envelopes, contracts, nonce registry     |
| `projects/`          | Standalone        | Visualizations, research, experiments    |
| `experiments/`       | Experiments       | Experimental work and prototypes         |

Use each project's README plus [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for build, test, and run instructions.

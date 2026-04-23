# CascadeProjects

CascadeProjects is a multi-project local workspace. The current layout is namespaced rather than flat:

- `Applications/` for app and engine work
- `Tools/MCPServers/` for first-party MCP servers
- `Projects/` for operational projects such as `GRID-main`, `DIO`, and `GATE`
- `Documentation/` for shared docs and audits
- `Components/` for shared package code currently in this tree

- **Where things live**: [Documentation/docs/STRUCTURE.md](Documentation/docs/STRUCTURE.md) - directory map, attention taxonomy, and ownership.
- **AI / agents**: See [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for workspace guidance, project commands, and coding rules.
- **Repo and git**: See [Documentation/docs/GIT_REPO.md](Documentation/docs/GIT_REPO.md) for branch conventions, nested repo handling, and submodule guidance.
- **Data contracts**: See [Documentation/docs/DATA_CONTRACTS.md](Documentation/docs/DATA_CONTRACTS.md) for shared audit and snapshot contracts.
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) - [CHANGELOG.md](CHANGELOG.md) - [SECURITY.md](SECURITY.md) - [Documentation/docs/README.md](Documentation/docs/README.md).

## Workspace Overview

This root repo is the dedicated local repository for the workspace. It tracks shared docs, scripts, the first-party servers, and the namespaced projects in this tree. `Projects/GRID-main` is a git submodule pointing to the [GRID-INTELLIGENCE/GRID](https://github.com/GRID-INTELLIGENCE/GRID) repository.

### Key Versions (April 2026)

| Component     | Version | Notes                           |
| ------------- | ------- | ------------------------------- |
| GRID (Python) | 2.8.0   | `Projects/GRID-main` submodule  |
| TypeScript    | ~6.0.2  | All TS packages + GRID frontend |
| Node.js       | 22      | CI and local                    |
| Python        | 3.13    | All Python projects             |
| MCP SDK       | ^1.28.0 | TypeScript MCP servers          |

No packages are published to npm (monorepo is private). See [Documentation/docs/NPM_RELEASE_STRATEGY.md](Documentation/docs/NPM_RELEASE_STRATEGY.md).

## Projects

### First-Party Servers

| Project              | Type       | Location                               | Notes                                                         |
| -------------------- | ---------- | -------------------------------------- | ------------------------------------------------------------- |
| `afloat-server`      | MCP server | `Tools/MCPServers/afloat-server/`      | Workflow orchestration and scheduled diagnostics              |
| `echoes-server`      | MCP server | `Tools/MCPServers/echoes-server/`      | Audit and telemetry persistence                               |
| `grid-server`        | MCP server | `Tools/MCPServers/grid-server/`        | GRID/GATE integration helpers                                 |
| `lots-server`        | MCP server | `Tools/MCPServers/lots-server/`        | Experiment catalog, runner, suggestions                       |
| `maintain-server`    | MCP server | `Tools/MCPServers/maintain-server/`    | Diagnostics, cleanup, maintenance flows                       |
| `pulse-server`       | MCP server | `Tools/MCPServers/pulse-server/`       | Briefings, focus, journal, prioritization                     |
| `seeds-server`       | MCP server | `Tools/MCPServers/seeds-server/`       | Ecosystem snapshots and scans                                 |
| `glimpse-server`     | MCP server | `Tools/MCPServers/glimpse-server/`     | Glimpse MCP tools (analyze, compress, similarity, confidence) |
| `eligibility-server` | MCP server | `Tools/MCPServers/eligibility-server/` | Promotion gates, hierarchy, evolution cycles                  |
| `overview-server`    | MCP server | `Tools/MCPServers/overview-server/`    | Session checkpoints, health monitoring                        |
| `mangrove-server`    | MCP server | `Tools/MCPServers/mangrove-server/`    | DIO bridge, security audit, skill routing                     |

### Shared Packages

| Project             | Type           | Location                        | Notes                                       |
| ------------------- | -------------- | ------------------------------- | ------------------------------------------- |
| `shared-types`      | Shared package | `Components/shared-types/`      | Shared types and audit client; build first  |
| `shared-resilience` | Shared package | `Components/shared-resilience/` | Circuit breaker, rate limit, retry patterns |
| `shared-pipeline`   | Shared package | `Components/shared-pipeline/`   | Shared build/deploy pipeline utilities      |

### Applications and Engines

| Project            | Type                 | Location                         | Notes                                         |
| ------------------ | -------------------- | -------------------------------- | --------------------------------------------- |
| `glimpse-artifact` | App/library          | `Applications/glimpse-artifact/` | React UI and components                       |
| `glimpse-engine`   | Engine               | `Applications/glimpse-engine/`   | JavaScript ES modules cognitive engine        |
| `DIO`              | Control room         | `Projects/DIO/`                  | Airflow/light coordination plus episode tool  |
| `GATE`             | Operational store    | `Projects/GATE/`                 | Envelopes, contracts, results, nonce registry |
| `pi-mangrove`      | Workspace package    | `Applications/pi-mangrove/`      | Skills, prompts, extensions for pi agent      |
| `projects/viz`     | Standalone workspace | `Projects/projects/viz/`         | Visualizations and research experiments       |

### Nested Repos

| Project     | Managed in    | Notes                                                                                                   |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `GRID-main` | Git submodule | Python 3.13, FastAPI, uv; points to [GRID-INTELLIGENCE/GRID](https://github.com/GRID-INTELLIGENCE/GRID) |

`npm install` runs a `postinstall` hook (`Components/scripts/init-submodules.mjs`) that bootstraps the `Projects/GRID-main` submodule automatically on a fresh clone. The hook is fail-soft: it never breaks install. To opt out (e.g. in CI that already checked out submodules, or in an offline environment), set `CASCADE_SKIP_SUBMODULES=1`. To re-run manually after a clone: `npm run bootstrap:submodules` or `git submodule update --init --recursive`.

### Workspace Infrastructure

| Project         | Type        | Location         | Notes                                     |
| --------------- | ----------- | ---------------- | ----------------------------------------- |
| `Documentation` | Docs        | `Documentation/` | Shared documentation, audits, and archive |
| `experiments`   | Experiments | `experiments/`   | Lots-server experiment catalog            |

Use each project's README plus [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for build, test, and run instructions.

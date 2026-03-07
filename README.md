# CascadeProjects

CascadeProjects is a multi-project local workspace. Each major subdirectory is an independent project with its own toolchain, lockfile, and runtime concerns, while the root repository provides shared documentation, conventions, and cross-project coordination.

- **AI / agents**: See [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for workspace guidance, project-specific commands, and coding rules.
- **Repo and git**: See [docs/GIT_REPO.md](docs/GIT_REPO.md) for branch conventions, nested repo handling, line-ending policy, and remote setup.
- **Data contracts**: See [docs/DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md) for shared audit and snapshot contracts.

## Workspace overview

This root repo is the dedicated local repository for the workspace. It tracks shared docs, scripts, and the first-party servers in this tree. Some directories remain independent nested repositories and should continue to be managed in their own git roots.

## Projects

| Project                | Type              | Language / Stack       | Notes                                         |
| ---------------------- | ----------------- | ---------------------- | --------------------------------------------- |
| `afloat-server/`       | MCP server        | TypeScript, MCP SDK    | Workflow orchestration, scheduled diagnostics |
| `echoes-server/`       | MCP server        | TypeScript, MCP SDK    | Audit and telemetry persistence               |
| `grid-server/`         | MCP server        | TypeScript, MCP SDK    | GRID/GATE integration helpers                 |
| `lots-server/`         | MCP server        | TypeScript, MCP SDK    | Experiment catalog, runner, suggestions       |
| `maintain-server/`     | MCP server        | TypeScript, MCP SDK    | Diagnostics, cleanup, maintenance flows       |
| `pulse-server/`        | MCP server        | TypeScript, MCP SDK    | Briefings, focus, journal, prioritization     |
| `seeds-server/`        | MCP server        | TypeScript, MCP SDK    | Ecosystem snapshots and scans                 |
| `shared-types/`        | Shared package    | TypeScript             | Shared types and audit client                 |
| `scripts/`             | Workspace scripts | PowerShell, TypeScript | Root-level utility scripts                    |
| `docs/`                | Documentation     | Markdown               | Plans, contracts, repo conventions            |
| `GRID-main/`           | Nested repo       | Python, FastAPI, uv    | Independent repo; manage in its own git root  |
| `mcp-tool-experiment/` | Nested repo       | TypeScript, pnpm       | Independent repo; manage in its own git root  |
| `glimpse-artifact/`    | App/library       | React, Vite, Tailwind  | UI/component project                          |

Use each project's README plus [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for build, test, and run instructions.

# CascadeProjects

CascadeProjects is a multi-project local workspace. The current layout is namespaced rather than flat:

- `Applications/` for app and engine work
- `Tools/MCPServers/` for first-party MCP servers
- `Projects/` for operational projects such as `GRID-main`, `DIO`, and `GATE`
- `Documentation/` for shared docs and audits
- `Components/` for shared package code currently in this tree
- `Shared/` exists as a workspace container, but it is currently empty

- **Where things live**: [Documentation/docs/STRUCTURE.md](Documentation/docs/STRUCTURE.md) - directory map, attention taxonomy, and ownership.
- **AI / agents**: See [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for workspace guidance, project commands, and coding rules.
- **Repo and git**: See [Documentation/docs/GIT_REPO.md](Documentation/docs/GIT_REPO.md) for branch conventions, nested repo handling, and submodule guidance.
- **Data contracts**: See [Documentation/docs/DATA_CONTRACTS.md](Documentation/docs/DATA_CONTRACTS.md) for shared audit and snapshot contracts.
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) - [CHANGELOG.md](CHANGELOG.md) - [SECURITY.md](SECURITY.md) - [Documentation/docs/README.md](Documentation/docs/README.md).

## Workspace Overview

This root repo is the dedicated local repository for the workspace. It tracks shared docs, scripts, the first-party servers, and the namespaced projects in this tree. `Projects/GRID-main` is a nested repository; current references to `mcp-tool-experiment` are historical and should not be treated as an active checkout in this tree.

## Projects

### First-Party Servers

| Project | Type | Location | Notes |
| --- | --- | --- | --- |
| `afloat-server` | MCP server | `Tools/MCPServers/afloat-server/` | Workflow orchestration and scheduled diagnostics |
| `echoes-server` | MCP server | `Tools/MCPServers/echoes-server/` | Audit and telemetry persistence |
| `grid-server` | MCP server | `Tools/MCPServers/grid-server/` | GRID/GATE integration helpers |
| `lots-server` | MCP server | `Tools/MCPServers/lots-server/` | Experiment catalog, runner, suggestions |
| `maintain-server` | MCP server | `Tools/MCPServers/maintain-server/` | Diagnostics, cleanup, maintenance flows |
| `pulse-server` | MCP server | `Tools/MCPServers/pulse-server/` | Briefings, focus, journal, prioritization |
| `seeds-server` | MCP server | `Tools/MCPServers/seeds-server/` | Ecosystem snapshots and scans |
| `glimpse-server` | MCP server | `Tools/MCPServers/glimpse-server/` | Glimpse MCP tools (analyze, compress, similarity, confidence) |
| `eligibility-server` | MCP server | `Tools/MCPServers/eligibility-server/` | Promotion gates, hierarchy, evolution cycles |
| `overview-server` | MCP server | `Tools/MCPServers/overview-server/` | Session checkpoints, health monitoring |
| `mangrove-server` | MCP server | `Tools/MCPServers/mangrove-server/` | DIO bridge, security audit, skill routing |

### Shared Packages

| Project | Type | Location | Notes |
| --- | --- | --- | --- |
| `shared-types` | Shared package | `Components/shared-types/` | Shared types and audit client; build first |
| `shared-resilience` | Shared package | `Components/shared-resilience/` | Circuit breaker, rate limit, retry patterns |
| `shared-pipeline` | Shared package | `Components/shared-pipeline/` | Shared build/deploy pipeline utilities |

### Applications and Engines

| Project | Type | Location | Notes |
| --- | --- | --- | --- |
| `glimpse-artifact` | App/library | `Applications/glimpse-artifact/` | React UI and components |
| `glimpse-engine` | Engine | `Applications/glimpse-engine/` | JavaScript ES modules cognitive engine |
| `DIO` | Control room | `Projects/DIO/` | Airflow/light coordination plus episode tool |
| `GATE` | Operational store | `Projects/GATE/` | Envelopes, contracts, results, nonce registry |
| `pi-mangrove` | Workspace package | `Applications/pi-mangrove/` | Skills, prompts, extensions for pi agent |
| `projects/viz` | Standalone workspace | `Projects/projects/viz/` | Visualizations and research experiments |

### Nested Repos

| Project | Managed in | Notes |
| --- | --- | --- |
| `GRID-main` | Its own git root | Python, FastAPI, uv; managed as a nested repository under `Projects/` |

### Workspace Infrastructure

| Project | Type | Location | Notes |
| --- | --- | --- | --- |
| `Documentation` | Docs | `Documentation/` | Shared documentation and audits |
| `scripts` | Workspace scripts | `scripts/` | CI, benchmarking, utility scripts |
| `tests` | Root tests | `tests/` | Cross-project integration tests |
| `experiments` | Experiments | `experiments/` | Experimental work and prototypes |
| `Shared` | Workspace container | `Shared/` | Reserved namespace; currently empty |

Use each project's README plus [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) for build, test, and run instructions.

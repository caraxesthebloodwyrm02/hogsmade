# Workspace structure and attention map

This is the single map for where things live in the current CascadeProjects layout.

## Root directory

| Purpose | Location | Notes |
| --- | --- | --- |
| Entry points | `README.md`, `CLAUDE.md`, `AGENTS.md` | Start here for workspace orientation and rules. |
| Conventions | `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md` | Shared repo policy and history. |
| Scratch / notes | `archive/session-artifacts/` | Session scratch files; not config. |
| Config | `.env.example`, `.gitattributes`, `.gitignore`, `.gitmodules` | Root-level repo config and submodule metadata. |
| Tool config | `mcp_config.json`, `claude_code_config.json` | Active MCP/editor config files. |
| Docs | `Documentation/` | Shared docs, audits, and layout notes. |
| Scripts | `scripts/` | Workspace-level scripts and utilities. |
| Operational data | `Projects/GATE/` | Envelopes, contracts, results, and runtime ops data. |
| Root tests | `tests/` | Cross-project integration tests. |
| Applications | `Applications/` | Apps, engines, and product-facing work. |
| MCP servers | `Tools/MCPServers/` | First-party TypeScript MCP servers. |
| Shared packages | `Components/` | Current location for shared packages and helpers. |
| Reserved | `Shared/` | Present but currently empty. |

## Projects

### First-party applications and servers

| Project | Type | Notes |
| --- | --- | --- |
| `Tools/MCPServers/afloat-server/` | MCP server | Workflow orchestration and scheduled diagnostics |
| `Tools/MCPServers/echoes-server/` | MCP server | Audit and telemetry persistence |
| `Tools/MCPServers/grid-server/` | MCP server | GRID and GATE integration |
| `Tools/MCPServers/lots-server/` | MCP server | Experiment catalog and runner |
| `Tools/MCPServers/maintain-server/` | MCP server | Diagnostics, cleanup, maintenance |
| `Tools/MCPServers/pulse-server/` | MCP server | Briefings, focus, journal, prioritization |
| `Tools/MCPServers/seeds-server/` | MCP server | Ecosystem snapshots and scans |
| `Tools/MCPServers/eligibility-server/` | MCP server | Promotion-gate and cycle management |
| `Tools/MCPServers/overview-server/` | MCP server | Workspace health and checkpoint summaries |
| `Tools/MCPServers/mangrove-server/` | MCP server | DIO bridge and security audit helpers |
| `Tools/MCPServers/glimpse-server/` | MCP server | Glimpse cognitive-engine tools |
| `Applications/glimpse-artifact/` | App/library | React UI and components |
| `Applications/glimpse-engine/` | Engine | Browser visualization engine and demos |
| `Applications/pi-mangrove/` | Workspace package | Prompt / skill assets and tooling |
| `Projects/DIO/` | Control room suite | Airflow/light coordination and episode tooling |
| `Projects/GATE/` | Operational store | Envelopes, contracts, and audit data |
| `Projects/projects/viz/` | Workspace project | Visualization experiments |
| `Hogwarts/` | Workspace project | Gamified workspace layer (arena, board, governors, houses, professors, students) |
| `Components/shared-types/` | Shared package | Types and audit client |
| `Components/shared-resilience/` | Shared package | Circuit breakers, retries, and rate limiting |
| `Components/shared-pipeline/` | Shared package | Shared pipeline helpers |

### Nested repos

| Project | Managed in | Notes |
| --- | --- | --- |
| `Projects/GRID-main/` | Its own git root | Python, FastAPI, uv; see `Projects/GRID-main/docs/project/` |

Historical references to `mcp-tool-experiment` are archival only and are not active checkouts in the current tree.

## Where to put things

- New shared docs -> `Documentation/`; update `Documentation/docs/README.md`
- New workspace scripts -> `scripts/` or a subdirectory under it
- GATE envelopes / contracts -> `Projects/GATE/`
- Project-specific code -> Inside the matching project directory

## Attention taxonomy

| If you want to... | Look here |
| --- | --- |
| Understand the workspace | `README.md`, this file, `Documentation/docs/README.md` |
| Configure AI / agents | `CLAUDE.md`, `AGENTS.md`, `.cursor/`, `.claude/` |
| Git and branches | `Documentation/docs/GIT_REPO.md`, `Documentation/docs/git-audit-guide.md`, `Documentation/docs/SUBMODULES.md` |
| Data contracts and APIs | `Documentation/docs/DATA_CONTRACTS.md`, per-project READMEs |
| Security and compliance | `SECURITY.md`, `Documentation/docs/SECURITY_STATUS.md` |
| Run or add scripts | `scripts/`, `scripts/README.md` |
| Quality and phase work | `Documentation/docs/PHASE4_QUALITY_CONTRACT.md`, `Documentation/docs/PROGRESS_SUMMARY.md` |

## Tool and CI health

- Build order: `Components/shared-types` first, then `Components/shared-resilience`, then any dependent server
- `grid-server` depends on both shared packages
- Run builds and tests after changes to confirm nothing is broken

## Agency

- Root repo = shared docs, conventions, first-party servers, and scripts
- Nested repo = commit inside `Projects/GRID-main/` when changing that codebase; update the root ref only when intentionally recording a new submodule commit
- Each project owns its own build, test, and deploy flow

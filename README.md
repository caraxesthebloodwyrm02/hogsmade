# CascadeProjects

Multi-project workspace. Each subdirectory is an independent project with its own toolchain and lockfile.

- **AI / agents**: See `CLAUDE.md` and `AGENTS.md` for per-project guidance and commands.
- **Repo and git**: See [docs/GIT_REPO.md](docs/GIT_REPO.md) for branch/commit conventions and remote setup.
- **Data contracts**: See [docs/DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md) for cross-server contracts.

## Projects (summary)

| Project | Stack | Notes |
|--------|--------|--------|
| `afloat-server/` | TypeScript, MCP | Workflow orchestration MCP server |
| `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, `seeds-server/` | TypeScript, Node | MCP/service servers |
| `shared-types/` | TypeScript | Shared types and audit client |
| `GRID-main/` | Python, FastAPI, uv | Full-stack AI framework (nested repo) |
| `mcp-tool-experiment/` | TypeScript, pnpm | MCP TypeScript SDK (nested repo) |
| `glimpse-artifact/` | React, Vite, Tailwind | React component library |

Use the per-project README and CLAUDE.md/AGENTS.md for build, test, and run instructions.

# Version Matrix

Cross-repo version compatibility for Mangrove ecosystem.

## Current Versions

| Component             | Version | Source                  | Updated    |
| --------------------- | ------- | ----------------------- | ---------- |
| **GRID (Python)**     | 2.8.0   | pyproject.toml          | 2026-03-28 |
| **hogsmade (Root)**   | 1.0.0   | package.json            | 2026-03-30 |
| **MCP Servers**       | 1.0.0   | Individual package.json | 2026-03-21 |
| **shared-types**      | 1.0.0   | package.json            | 2026-03-21 |
| **shared-resilience** | 1.0.0   | package.json            | 2026-03-21 |
| **shared-pipeline**   | 1.0.0   | package.json            | 2026-03-21 |

**Note**: No packages are published to npm (monorepo is private). See `Documentation/docs/NPM_RELEASE_STRATEGY.md`.

## PyPI Status

| Package  | Local Name          | PyPI Name                                                          | PyPI Version                                    | Status                           |
| -------- | ------------------- | ------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------- |
| GRID     | `grid-intelligence` | [`grid-intelligence`](https://pypi.org/project/grid-intelligence/) | 2.8.0                                           | Published                        |
| APIGuard | `GRID-APIGUARD`     | [`GRID-APIGUARD`](https://pypi.org/project/GRID-APIGUARD/)         | 0.1.0                                           | Published, current               |
| Echoes   | `echoes`            | —                                                                  | Name collision (`echoes` 1.0.2 is unrelated)    | Do not publish under `echoes`    |
| Vision   | `vision-ui`         | —                                                                  | Name collision (`vision-ui` 2.1.4 is unrelated) | Do not publish under `vision-ui` |

GRID (`grid-intelligence`) and GRID-APIGUARD are published to PyPI. Echoes and Vision have PyPI name collisions with unrelated packages — use prefixed names if publishing in the future.

## Submodule Pointer

| Submodule    | Target      | Commit    | Status     |
| ------------ | ----------- | --------- | ---------- |
| `GRID-main/` | GRID v2.8.0 | `0cdf39d` | ✅ Current |

## Dependency Chain

```
GRID-main (submodule)
    ↓ (GRID_API_URL)
grid-server (MCP)
    ↓ @cascade/shared-types
shared-types (build first)
    ↓ @cascade/shared-resilience
    ↓ @cascade/shared-pipeline
MCP servers (depend on shared packages)
```

## Key Dependency Versions (as of 2026-04-04)

| Dependency          | Version     | Scope                                                             |
| ------------------- | ----------- | ----------------------------------------------------------------- |
| TypeScript          | ~6.0.2      | All TS packages + GRID frontend                                   |
| @types/node         | 25.5.2      | shared-types, shared-pipeline, shared-resilience, mangrove-server |
| vitest              | 4.1.2       | shared-resilience, shared-pipeline, overview, glimpse, mangrove   |
| @vitest/coverage-v8 | 4.1.2       | Same as vitest                                                    |
| vite                | 8.0.3       | glimpse-artifact                                                  |
| zod                 | 4.3.6       | mangrove-server                                                   |
| eslint              | 10.2.0      | glimpse-artifact                                                  |
| tailwindcss         | 4.2.2       | glimpse-artifact                                                  |
| pytest-asyncio      | strict mode | GRID (asyncio_mode="strict")                                      |
| Python              | 3.13        | GRID, echoes, apiguard, Vision                                    |

## Compatibility Rules

1. **GRID → hogsmade**: GRID API must be running on `localhost:8080`
2. **hogsmade → GRID**: Submodule should track tagged releases, not `main`
3. **Shared packages**: Build order: `shared-types` → `shared-resilience` → `shared-pipeline`
4. **MCP servers**: Require all shared packages built before build

## Update Triggers

| When                         | Action                             |
| ---------------------------- | ---------------------------------- |
| GRID release                 | Update `GRID-main` to release tag  |
| Breaking shared-types change | Bump all MCP server minor versions |
| New MCP server               | Add to workspaces, version 1.0.0   |
| Root release                 | Update CHANGELOG, tag vX.X.X       |

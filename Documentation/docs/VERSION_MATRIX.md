# Version Matrix

Cross-repo version compatibility for Mangrove ecosystem.

## Current Versions

| Component             | Version | Source                  | Updated    |
| --------------------- | ------- | ----------------------- | ---------- |
| **GRID (Python)**     | 2.8.0   | PyPI, Git tag           | 2026-03-28 |
| **hogsmade (Root)**   | 1.0.0   | package.json            | 2026-03-30 |
| **MCP Servers**       | 1.0.0   | Individual package.json | 2026-03-21 |
| **shared-types**      | 1.0.0   | package.json            | 2026-03-21 |
| **shared-resilience** | 1.0.0   | package.json            | 2026-03-21 |
| **shared-pipeline**   | 1.0.0   | package.json            | 2026-03-21 |

## Submodule Pointer

| Submodule    | Target      | Commit    | Status     |
| ------------ | ----------- | --------- | ---------- |
| `GRID-main/` | GRID v2.8.0 | `a7fe455` | ✅ Current |

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

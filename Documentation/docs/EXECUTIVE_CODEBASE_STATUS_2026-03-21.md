# Executive Codebase Status Report

Date: 2026-03-21
Scope: `CascadeProjects` root repository, first-party projects tracked in this repo, root docs/scripts/ops folders, and nested repo posture as recorded from the root.

## Executive Summary

CascadeProjects is structurally coherent and buildable, but it is not uniformly healthy. The repository functions as a multi-project coordination root rather than a single deployable product. The first-party TypeScript packages all built successfully in this review, `glimpse-artifact` linted cleanly, and five server/UI test targets passed. The main weaknesses are uneven test coverage, three active failing test targets, drift across nested repos, and a documentation-heavy governance surface that is stronger than the automation behind it.

In practical terms: architecture and conventions are clear, but operational confidence is mixed. The core MCP services are mostly lightweight and stable. Complexity is concentrated in `maintain-server`, `pulse-server`, `glimpse-artifact`, and `glimpse-engine`, and those areas deserve the most attention.

## Current Repository Posture

### Working tree and submodules

- Root worktree is not clean. Modified or untracked paths include `AGENTS.md`, `mcp_config.json`, `claude_code_config.json`, `.cursor/rules/*`, `.cursorrules`, `.windsurfrules`, `opencode.json`, and `zed_config.jsonc`.
- Submodules are not aligned to recorded refs:
  - `GRID-main` is checked out at a different commit than the root records.
  - `mcp-tool-experiment` is checked out at a different commit than the root records.
  - `projects/web/ai-web-demo` is missing from the working tree.

### Build and test verification

Commands run during this review:

- `npm run build` in `shared-types`, all seven first-party MCP servers, and `glimpse-artifact`
- `npm test` in all seven first-party MCP servers and `glimpse-artifact`
- `node --test tests/glimpse-engine.test.mjs`
- `npm run lint` in `glimpse-artifact`

Results:

| Area                       | Status | Notes                                                                      |
| -------------------------- | ------ | -------------------------------------------------------------------------- |
| `shared-types` build       | Green  | TypeScript build passed                                                    |
| MCP server builds          | Green  | `afloat`, `echoes`, `grid`, `lots`, `maintain`, `pulse`, `seeds` all built |
| `glimpse-artifact` build   | Green  | Vite production build passed                                               |
| `glimpse-artifact` lint    | Green  | `tsc --noEmit` passed                                                      |
| Server tests               | Mixed  | `afloat`, `lots`, `maintain`, `pulse`, `seeds` passed                      |
| `grid-server` tests        | Red    | One smoke test fails on expected fail-closed flag                          |
| `echoes-server` tests      | Red    | No test files present; `vitest` exits with code 1                          |
| `glimpse-artifact` tests   | Red    | Snapshot-style fixture test is stale                                       |
| Root `glimpse-engine` test | Red    | Imports `glimpse-engine/engine.js`, which does not exist                   |

## Architecture and Surface Area

### Topology

The repo is organized as a workspace root with:

- Seven first-party MCP servers: `afloat-server`, `echoes-server`, `grid-server`, `lots-server`, `maintain-server`, `pulse-server`, `seeds-server`
- One shared package: `shared-types`
- One React/Vite UI package: `glimpse-artifact`
- One browser-first visualization engine: `glimpse-engine`
- Root governance and ops layers: `docs/`, `scripts/`, `GATE/`, `output/`, `tmp/`
- Nested repos: `GRID-main`, `mcp-tool-experiment`, `projects/web/ai-web-demo`

### Complexity concentration

Main server file sizes and registered tool counts show where maintenance cost sits:

| Project           | Main file size | Tool count | Assessment                                  |
| ----------------- | -------------: | ---------: | ------------------------------------------- |
| `afloat-server`   |      459 lines |          6 | Small and focused                           |
| `echoes-server`   |      427 lines |          6 | Small, stable, but under-tested             |
| `grid-server`     |      509 lines |          6 | Medium complexity, safety-critical behavior |
| `lots-server`     |      947 lines |          7 | Medium-high complexity                      |
| `maintain-server` |    1,946 lines |          8 | Large operational surface                   |
| `pulse-server`    |    1,651 lines |         11 | Large aggregation/orchestration surface     |
| `seeds-server`    |      684 lines |          6 | Medium complexity                           |

UI and engine complexity is concentrated in:

- `glimpse-artifact/src/views/ScenarioCanvasView.tsx` at 474 lines
- `glimpse-artifact/src/hooks/useGateData.ts` at 234 lines
- `glimpse-engine/default-master.js` at 1,558 lines
- `glimpse-engine/functions/functions.js` at 941 lines
- `glimpse-engine/app.js` at 659 lines

This is not inherently bad, but it identifies the highest-risk files for regressions and future refactors.

## Area-by-Area Status

### First-party MCP servers

- `afloat-server`: Healthy on current evidence. Builds and smoke tests pass.
- `echoes-server`: Builds and starts, but there are no repo-local tests. Current quality signal depends on manual usage and smoke behavior rather than automated coverage.
- `grid-server`: Builds, but one smoke test fails. The failure indicates behavior changed from “remote unavailable” to “invalid URL” classification when `GRID_API_URL` is malformed.
- `lots-server`: Healthy on current evidence. Builds and tests pass.
- `maintain-server`: Healthy on current evidence, but it is one of the largest server surfaces and therefore a likely future hotspot.
- `pulse-server`: Healthy on current evidence, but it is large and aggregates data from multiple subsystems, which raises integration risk.
- `seeds-server`: Healthy on current evidence. Builds and tests pass.

### Shared package

- `shared-types` builds cleanly and is strict TypeScript.
- No test suite is present, so contract integrity is enforced only by downstream compilation and runtime use.

### `glimpse-artifact`

- Build and lint are green.
- Tests are red because fixture expectations no longer match `createGateSnapshot()`.
- The package appears structurally active and more mature than the server packages from a UI standpoint, but it needs fixture maintenance to keep trust in its tests.

### `glimpse-engine`

- The engine has significant code volume and appears to be a major product surface.
- The root test harness is broken because it imports `glimpse-engine/engine.js`, while the actual engine entry now lives under `glimpse-engine/core/engine.js`.
- This is a classic sign of path drift after refactor: core code likely still works, but the verification layer no longer tracks the current structure.

### Docs, scripts, and operations

- Documentation is a first-class part of the repo. `docs/` alone contains 43 tracked files in the reviewed surface.
- The docs tell a coherent story: phases 1 to 3 complete, phase 4 next.
- Security documentation is honest about what is implemented and what is aspirational.
- `scripts/README.md` contains duplicate entries for `sync-default-master.mjs` and `bootstrap_glimpse_logic.mjs`, which is a small but clear docs hygiene issue.
- `GATE/` is active and non-empty, with a nonce registry, one incoming envelope, and one processed result.
- `experiments/` is currently empty, which means `lots-server` has code but little repo-local experiment content to exercise.

## Security and Governance Status

Security posture is better documented than automated for the TypeScript side of the repo.

What is strong:

- Secret scanning is enforced in GitHub Actions through TruffleHog plus repo-specific credential checks.
- Boundary and safety gates exist for `GRID-main`.
- Root docs clearly distinguish implemented controls from planned or non-implemented claims.

What is weak or missing:

- No repo-level CI validates the first-party TypeScript MCP servers or `glimpse-artifact`.
- Audit logs remain plaintext on disk.
- Inter-server authentication and RBAC do not exist for local MCP services.
- Several security claims in config/docs are explicitly aspirational rather than implemented.

## Testing and Quality Assessment

The quality model is inconsistent across the repo:

- Positive: strict TypeScript is enabled across reviewed packages, builds are clean, and most server smoke suites pass.
- Negative: coverage is thin. Most server packages have exactly one smoke test file. `echoes-server` has none. `shared-types` has none. The root `glimpse-engine` test is broken by refactor drift.
- Outcome: the repo is in a “buildable but partially under-verified” state.

## Priority Findings

### High priority

1. Restore test trust:
   - Fix `grid-server/tests/smoke.test.ts` or the underlying behavior so fail-closed remote validation is asserted correctly.
   - Fix `glimpse-artifact/tests/useGateData.test.ts` to match the current snapshot shape or restore the removed fixture content.
   - Fix `tests/glimpse-engine.test.mjs` import paths after the Glimpse refactor.

2. Add CI for the first-party TypeScript packages:
   - At minimum: build + test matrix for `shared-types`, all seven servers, and `glimpse-artifact`.

### Medium priority

3. Resolve submodule drift and missing nested repo checkout.
4. Decide whether `echoes-server` and `shared-types` need real tests or should explicitly declare test coverage as deferred.
5. Reduce drift across editor MCP config files by generating them from one source rather than copying manually.

### Low priority

6. Clean docs duplication in `scripts/README.md`.
7. Populate `experiments/` or clearly mark `lots-server` as code-first with empty local content.

## Overall Assessment

CascadeProjects is a serious engineering workspace with strong structure, explicit conventions, and a clear product/platform split. The repository is not in distress. It is, however, in a transitional state where architecture and documentation are ahead of verification completeness. The immediate risk is not catastrophic breakage; it is silent confidence erosion from stale tests, submodule drift, and thin automated coverage outside `GRID-main`.

Bottom line: build health is good, test health is mixed, governance is strong, automation is uneven, and the next leverage point is turning the TypeScript surfaces into a consistently verified system rather than a collection of mostly healthy independent projects.

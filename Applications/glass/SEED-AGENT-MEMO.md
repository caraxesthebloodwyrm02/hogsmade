# Seed Agent Memo — Glass Documentation Truth Sync

## Purpose

This memo seeds the next agent with the verified current state of the Glass documentation slice and the safe runway for follow-up implementation work.

## Current State

Glass is an Electron + Canvas2D spatial development environment. The renderer is a pure visual field, preload exposes an explicit `window.glass` API, and the main process validates IPC before mutating the bridge file at `~/.caraxes/field-bridge.json`.

Phase 3 is complete. The recent documentation slice aligned the repo-facing docs with the verified source state and clarified which future features can proceed in parallel.

## Documentation Sync Completed

Updated docs:

- `Applications/glass/REFACTORING-MARKERS.md`
- `Applications/glass/README.md`
- `Applications/glass/AGENTS.md`

Truth-sync results:

- `M1` is `DONE`: production `window.glass` usage is typed; remaining casts are test mocks.
- `M3` is `DONE`: `setBridgeThresholdState` uses `withBridgeState`.
- `M4` is `PARTIAL`: `ipcMain.on` routes use `asObject`; `search:semantic` still validates inline.
- `M5` is `DONE`: preload uses `AssetMeta`.
- README now documents the current `window.glass` surface, expanded IPC table, 13 `glass-server` MCP tools, and `Post-Phase-3 Runway`.
- AGENTS now documents `npm run lint`, current IPC/API surface, all 13 `glass-server` tools, and current next slices.

## Verification Evidence

Read-only verification confirmed:

- No stale phrases remained in the three target docs:
  - `five methods`
  - `No lint script`
  - `4 tools`
  - `asset?: any`
  - `5 of 6`
  - `4 cast sites`
- README anchors present:
  - current `window.glass` surface
  - `bridge:delete-block`
  - `search:semantic`
  - `glass_eval_run`
  - `glass_eval_schedule`
  - `glass_eval_status`
  - `Post-Phase-3 Runway`
- AGENTS anchors present:
  - `npm run lint`
  - explicit `window.glass` API
  - expanded IPC table
  - 13 `glass-server` tools
  - `Current Next Slices`

Git status for the target docs, checked with explicit git metadata paths:

```text
 M Applications/glass/AGENTS.md
 M Applications/glass/README.md
?? Applications/glass/REFACTORING-MARKERS.md
```

Tracked target docs:

```text
Applications/glass/AGENTS.md
Applications/glass/README.md
```

`REFACTORING-MARKERS.md` is intentionally part of the docs slice but is currently untracked in the parent repo.

## Known Caveats

- Normal git discovery from `/mnt/arch_data/home/caraxes/CascadeProjects` can fail at the mount boundary. Use explicit paths when needed:

```bash
git --git-dir=/mnt/arch_data/home/caraxes/CascadeProjects/.git --work-tree=/mnt/arch_data/home/caraxes/CascadeProjects status --short
```

- No build or test gates were run for this slice because it was docs-only.
- The eval scheduler is process-local. The durable artifact is the NDJSON eval log returned by `glass_eval_status`.
- Latest eval-log failures for typecheck/tests were attributed to shell spawn environment failure, not project redness. Direct gates were previously green.

## Next Safe Slices

| Slice                         | Primary files                                                 | Dependency                                             | First verification gate       |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------- |
| Eval probe hardening          | `Tools/MCPServers/glass-server/src/probes.ts`                 | independent                                            | glass-server tests            |
| Search validation consistency | `Applications/glass/src/main/index.ts`                        | independent                                            | Glass typecheck + tests       |
| Schema versioning             | `Applications/glass/bridge/schema.ts`, bridge readers/writers | should precede durable history                         | schema/typecheck tests        |
| Undo/history                  | bridge mutation helpers, renderer block ops                   | depends on schema versioning shape                     | focused bridge mutation tests |
| Inventory/search              | inventory ledger, asset listing/search surfaces               | depends on schema/version decision                     | inventory/search tests        |
| Scheduler persistence         | `eval-runner.ts`                                              | only needed if process-local scheduler is insufficient | scheduler state tests         |

## Recommended Next Action

Start with eval probe hardening. Replace shell-dependent `execSync("npm ...")` probe execution with argv-based process execution and richer failure details. This directly addresses the false-red eval reports caused by `/bin/sh` spawn failures while preserving the existing probe contract.

## Constraints for Next Agent

- Keep changes focused.
- Do not change dependencies unless explicitly requested.
- Use `npm` for TypeScript work.
- Do not use external APIs.
- Do not treat `REFACTORING-MARKERS.md` as tracked unless git status confirms it has been added.
- Prefer absolute paths under `/mnt/arch_data/home/caraxes/CascadeProjects` to avoid the shallow `/home/irfankabir/CascadeProjects` trap.

# Layout Recovery Audit — 2026-04-04

## Purpose

This document records the current post-reorg state of `CascadeProjects`, identifies the path and layout assumptions that still reflect the older workspace shape, and defines a clean recovery plan for both runtime stability and working tree hygiene.

This is not a speculative note. It is based on a direct sweep of the current filesystem, live MCP behavior, and config/doc references in the workspace.

## Executive Summary

The recent directory layout change is only partially propagated.

The workspace now has a namespaced structure:

- `Applications/`
- `Tools/MCPServers/`
- `Projects/`
- `Documentation/`
- `Shared/`

But a large amount of runtime config, static server metadata, and documentation still assumes one or more older layouts:

- flat root project paths such as `afloat-server/`, `echoes-server/`, `grid-server/`, `glimpse-engine/`
- legacy external roots such as `/home/caraxes/canopy`, `/home/caraxes/roots`, and `/home/caraxes/grove`
- old GATE location at `/home/caraxes/CascadeProjects/GATE`
- old nested repo assumption for `mcp-tool-experiment`

The result is three different classes of failure:

1. Live runtime mismatches.
2. Static metadata and overview mismatches.
3. Documentation and git-boundary drift.

The live server issues are now largely repaired, but the workspace is still structurally inconsistent and the root repo remains heavily dirty.

## Current Canonical Layout

Confirmed current top-level layout under `/home/caraxes/CascadeProjects`:

- `Applications/glimpse-artifact`
- `Applications/glimpse-engine`
- `Applications/pi-mangrove`
- `Tools/MCPServers/<server-name>`
- `Projects/GRID-main`
- `Projects/GATE`
- `Documentation/docs`
- `Shared/`

Confirmed nested git repo:

- `Projects/GRID-main`

Confirmed missing nested repo path:

- `Projects/mcp-tool-experiment` does not currently exist

Confirmed `.gitmodules` state:

- `.gitmodules` only contains `Projects/GRID-main`
- there is no current `mcp-tool-experiment` submodule entry

## What Was Verified Live

These runtime repairs were validated during this recovery session:

- `glimpse-server` now resolves the engine correctly from `Applications/glimpse-engine`
- `grid-rag` no longer fails on the `provider` logging kwarg issue
- `seeds-server` now reports current snapshots and recognizes root-tracked projects correctly
- `grid-server` now resolves deployment targets correctly and reports healthy GATE state

These are live behavior fixes, not just source edits.

## Confirmed Drift Categories

### 1. Runtime config files still contain stale path assumptions

Observed examples:

- `mcp_config.json`
  - `SEEDS_ROOTS` still includes `/home/caraxes/canopy` and `/home/caraxes/grove`
  - another `GATE_DIR` entry still points to `/home/caraxes/CascadeProjects/GATE`
- `claude_code_config.json`
  - `grid-server.env.GATE_DIR` still points to `/home/caraxes/CascadeProjects/GATE`
  - `overview-server.env.GATE_DIR` still points to `/home/caraxes/CascadeProjects/GATE`
  - `SEEDS_ROOTS` still includes `/home/caraxes/canopy` and `/home/caraxes/grove`
- `.env.example`
  - still points `GATE_DIR` to `/home/caraxes/CascadeProjects/GATE`

Impact:

- different MCP launch surfaces can still boot with different ideas of where GATE lives
- seeds/overview can still consume stale repo roots depending on which config surface is used

### 2. Static server metadata still assumes the old layout

Observed examples:

- `Tools/MCPServers/overview-server/src/clusters.ts`
  - still points `GRID` to `/home/caraxes/roots/GRID`
  - still points `afloat` and `echoes` to `/home/caraxes/canopy/...`
  - still points `glimpse-engine` to `/home/caraxes/roots/glimpse-engine`
  - still points `GATE` to `/home/caraxes/CascadeProjects/GATE`
  - still points `glimpse-artifact` to `/home/caraxes/CascadeProjects/glimpse-artifact`
  - still points `shared-types` and `shared-resilience` to flat root locations
- `Tools/MCPServers/seeds-server/src/server.ts`
  - still points `GRID` to `/home/caraxes/roots/GRID`
  - still points `apiguard` and `Vision` to legacy external roots

Impact:

- `overview-server` cluster narratives and drift summaries are still structurally wrong in places
- `seeds-server` still mixes current workspace truth with legacy external roots

### 3. Core workspace docs still describe the pre-reorg shape

Observed examples:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `Documentation/docs/STRUCTURE.md`
- `Documentation/docs/GIT_REPO.md`
- `Documentation/docs/SUBMODULES.md`

Common problems:

- refer to first-party servers as if they live directly at repo root
- refer to shared packages as `shared-types/` and `shared-resilience/` at repo root
- refer to `glimpse-artifact/` and `glimpse-engine/` as flat root projects
- still mention `mcp-tool-experiment` as an active nested repo/submodule

Impact:

- new edits are likely to reintroduce path drift because the “source of truth” docs are wrong
- operators and agents are being told to navigate a layout that no longer exists

### 4. Historical docs and reports reference old paths everywhere

Representative examples:

- `Documentation/docs/CONFIG_SNAPSHOT.md`
- `Documentation/docs/mcp-security-report-2026-03-21.md`
- `Documentation/docs/audits/non-glimpse-mcp-security-report-2026-03-21.md`
- `Documentation/docs/maturity-mechanical-baseline-2026-03-29.md`
- `MCP_SERVER_DEMO.md`
- `Applications/glimpse-engine/docs/drift-guard-cli-reference.md`

Impact:

- these are less urgent for runtime, but they create background confusion
- some are historical artifacts and should be labeled as historical rather than fully rewritten

### 5. The root working tree is not close to clean

Direct `git status --short` shows a heavily dirty root repo.

Top-level modified-path counts from the current sweep:

- `Applications`: 177
- `Documentation`: 75
- `Tools`: 61
- `Components`: 60
- `Projects`: 26
- `.github`: 17
- `Hogwarts`: 17

Additional root-repo signals:

- `Projects/GRID-main` is recorded as modified in the root repo
- `experiments/` is untracked at root

Nested repo state:

- `Projects/GRID-main` also has local modifications and untracked files

Impact:

- there is no safe path to a clean tree by “one big commit”
- any recovery work must be staged by scope, not by repository-wide add/commit/reset

## Root Causes

The layout change appears to have happened in waves:

1. files and directories were moved into namespaced containers such as `Applications/`, `Tools/MCPServers/`, `Documentation/`, and `Projects/`
2. some runtime/server code was updated
3. many docs, static metadata files, and alternative config surfaces were not updated
4. the repo already had substantial unrelated work in progress, which makes path drift harder to isolate

The problem is not only “bad paths.” The problem is lack of one enforced canonical workspace map after the reorg.

## Recovery Plan

### Phase 1 — Freeze the canonical layout

Create one authoritative statement of the current layout and make other files conform to it.

Required decisions:

- first-party MCP servers live under `Tools/MCPServers/`
- browser/UI apps live under `Applications/`
- nested repos live under `Projects/`
- GATE lives under `Projects/GATE`
- docs live under `Documentation/docs`
- `mcp-tool-experiment` is either:
  - restored under `Projects/`, or
  - removed from all current-facing docs and diagrams

Definition of done:

- one canonical layout document is treated as source of truth
- `README.md`, `AGENTS.md`, and `CLAUDE.md` agree with it

### Phase 2 — Normalize all live config surfaces

Update all active launcher/config files to the same paths.

Must review and reconcile:

- `mcp_config.json`
- `claude_code_config.json`
- `.env.example`
- editor-specific generated config surfaces if they are derived from the above

Must normalize at minimum:

- `GATE_DIR` -> `/home/caraxes/CascadeProjects/Projects/GATE`
- first-party server paths -> `Tools/MCPServers/...`
- app paths -> `Applications/...`
- seeds roots -> current intended roots only

Important:

- if `canopy`, `roots`, and `grove` are still intentionally part of the operator ecosystem, they must be declared explicitly as legacy external roots
- if they are no longer authoritative, remove them from active config instead of leaving them half-supported

### Phase 3 — Fix static metadata servers that synthesize the workspace

Priority files:

- `Tools/MCPServers/overview-server/src/clusters.ts`
- `Tools/MCPServers/seeds-server/src/server.ts`

Actions:

- replace remaining legacy root paths with current canonical locations where applicable
- explicitly classify true external repos separately from first-party in-workspace projects
- stop mixing current workspace truth with legacy external path assumptions

Definition of done:

- overview cluster map matches the current layout
- seeds known repo map distinguishes:
  - first-party in-workspace projects
  - nested repos
  - genuinely external repos

### Phase 4 — Separate historical docs from current operational docs

Do not try to rewrite every historical report as if it were current.

Instead:

- keep historical audits/reports as archives
- add clear archival notes where needed
- update only the current-facing operational docs that users and agents rely on

Current-facing docs to repair first:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `Documentation/docs/STRUCTURE.md`
- `Documentation/docs/GIT_REPO.md`
- `Documentation/docs/SUBMODULES.md`
- `Documentation/docs/MCP_SETUP_GUIDE.md`
- `Documentation/docs/CONFIG_SNAPSHOT.md`

### Phase 5 — Recover a clean working tree by scope, not by force

Do not attempt a workspace-wide blind cleanup.

Recommended workflow:

1. Classify modified files into buckets:
   - runtime fixes already validated
   - layout-recovery edits
   - unrelated feature work
   - generated/runtime artifacts
   - historical doc drift
2. Commit validated runtime fixes first.
3. Commit layout-normalization changes as a dedicated batch.
4. Leave unrelated feature work in separate commits or branches.
5. Only delete or reset generated artifacts after confirming they are reproducible.

Rules:

- do not use destructive resets across the whole repo
- do not mix layout recovery with unrelated application or documentation rewrites
- do not treat `Projects/GRID-main` cleanup as part of root repo cleanup

## Recommended Commit Boundaries

Suggested sequence:

1. `fix: normalize active MCP config paths after workspace reorg`
2. `fix: update overview and seeds path maps to canonical layout`
3. `docs: rewrite current workspace layout and git-boundary docs`
4. separate commits for any unrelated app/server feature work already in progress

For `Projects/GRID-main`, treat it independently:

- layout/path corrections inside that repo should be committed there
- root repo should only record the updated submodule pointer when intentional

## Concrete Must-Fix List

These items should be treated as the minimum recovery set.

### Active configs

- `mcp_config.json`
- `claude_code_config.json`
- `.env.example`

### Runtime/static path maps

- `Tools/MCPServers/overview-server/src/clusters.ts`
- `Tools/MCPServers/seeds-server/src/server.ts`

### Current-facing docs

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `Documentation/docs/STRUCTURE.md`
- `Documentation/docs/GIT_REPO.md`
- `Documentation/docs/SUBMODULES.md`
- `Documentation/docs/MCP_SETUP_GUIDE.md`

## Concrete Likely-Stale-But-Nonblocking List

These should be cleaned after the minimum recovery set:

- `Documentation/docs/audits/*`
- `Documentation/docs/maturity-mechanical-baseline-2026-03-29.md`
- `Documentation/docs/EXECUTIVE_CODEBASE_STATUS_2026-03-21.md`
- `Documentation/docs/PROGRESS_SUMMARY.md`
- `MCP_SERVER_DEMO.md`
- `Applications/glimpse-engine/docs/drift-guard-cli-reference.md`

## Clean Working Tree Recovery Strategy

To recover to a meaningfully clean state, use this sequence:

1. Finish layout-recovery commits in root repo.
2. Commit or intentionally shelve `Projects/GRID-main` local changes in its own repo.
3. Reassess root repo dirty state by top-level bucket.
4. Decide whether `Applications/`, `Documentation/`, and `Components/` changes are:
   - valid in-progress work to keep, or
   - drift/generated noise to revert
5. Only after that, create targeted cleanup commits or reverts.

Success condition:

- live MCP configs agree on the canonical layout
- server metadata matches the real filesystem
- current operational docs match the real filesystem
- root repo dirty state is explainable by active work, not path confusion

## Recommended Next Action

Do not start with broad cleanup.

Start with one targeted path-normalization batch:

1. normalize active config files
2. normalize `overview-server` cluster paths
3. update the canonical workspace docs

Then rerun:

- `mcp__grid_server__health_check()`
- `mcp__seeds_server__ecosystem_scan({ saveSnapshot: true })`
- `mcp__overview_server__checkpoint({ depth: "summary" })`

That gives a clean checkpoint before touching the much larger dirty working tree.

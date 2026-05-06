# Glass — Agent Context

Electron + Canvas2D spatial development environment. Vanilla TypeScript — no React, no Vue, no component framework. The renderer is a pure canvas render loop.

## Commands

```bash
npm run dev              # Electron dev server with HMR (renderer on localhost:5173)
npm run build            # electron-vite production build -> out/
npm run lint             # tsc --noEmit (same gate as typecheck)
npm run typecheck        # tsc --noEmit (split tsconfigs, see below)
npm test                 # vitest run (node environment)
npm run test:watch       # vitest watch mode
npm run snapshot         # requires uv: uv run --with openpyxl python scripts/snapshot.py
GLASS_DEVTOOLS=1 npm run dev   # opens detached DevTools in dev mode
```

No ESLint or Prettier config. `npm run lint` exists as a `tsc --noEmit` alias, matching `npm run typecheck`.

## TypeScript — Split Configs

Root `tsconfig.json` is reference-only (no `compilerOptions`). Two real configs:

| Config               | Covers                                       | Lib             |
| -------------------- | -------------------------------------------- | --------------- |
| `tsconfig.node.json` | `src/main/**`, `src/preload/**`, `bridge/**` | ES2022 (no DOM) |
| `tsconfig.web.json`  | `src/renderer/**`, `bridge/**`               | ES2022 + DOM    |

`bridge/schema.ts` is compiled by **both** — it's the shared type contract. Never add browser-only or Node-only imports to `bridge/`.

`npm run typecheck` runs `tsc --noEmit` against the root, which validates both projects via references.

## Process Boundaries

```
src/main/index.ts       — Electron main: IPC handlers, bridge watcher, window creation
src/preload/index.ts    — contextBridge: exposes the explicit window.glass API to renderer
src/renderer/index.ts   — Renderer entry: Field (canvas), FieldState, SessionState, user input
bridge/schema.ts        — Shared types: BridgeState, BridgeBlock, ThresholdState, etc.
```

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — renderer has no Node access, only the preload API exposed as `window.glass`.

Current `window.glass` surface:

| Method                                                | Purpose                                    |
| ----------------------------------------------------- | ------------------------------------------ |
| `onBridgeUpdate(cb)`                                  | Subscribe to `BridgeState` updates         |
| `patchBlock(id, content)`                             | Persist user-owned block edits             |
| `sendMessage(text)`                                   | Append a user conversation turn            |
| `addBlock(type, language, content, position, asset?)` | Add a user-origin block                    |
| `patchBlockPosition(id, x, y)`                        | Persist drag/reposition events             |
| `deleteBlock(id)`                                     | Delete a user-owned block                  |
| `listAssets()`                                        | Read durable inventory assets              |
| `searchSemantic(query, limit?)`                       | Search visible blocks and inventory assets |
| `getFieldProfile()`                                   | Read the active field profile/config       |
| `triggerCeremony(state)`                              | Request a ceremony state transition        |

## IPC Channels

| Direction       | Channel                       | Payload                                                 |
| --------------- | ----------------------------- | ------------------------------------------------------- |
| main → renderer | `bridge:update`               | `BridgeState`                                           |
| renderer → main | `bridge:patch-block`          | `{ id, content }`                                       |
| renderer → main | `bridge:send-message`         | `{ text }`                                              |
| renderer → main | `bridge:add-block`            | `{ type, language, content, position, origin, asset? }` |
| renderer → main | `bridge:patch-block-position` | `{ id, x, y }`                                          |
| renderer → main | `bridge:delete-block`         | `{ id }`                                                |
| renderer → main | `bridge:list-assets`          | none                                                    |
| renderer → main | `search:semantic`             | `{ query, limit }`                                      |
| renderer → main | `config:get-field-profile`    | none                                                    |
| renderer → main | `bridge:trigger-ceremony`     | `{ state }`                                             |

## Bridge File

- Default path: `~/.caraxes/field-bridge.json`
- Override: `GLASS_BRIDGE_PATH` env var
- All writes are atomic: write to `.tmp.<pid>.<tag>` then `renameSync` to the target
- Bridge file permissions: `0o600`; directory: `0o700`
- Limits enforced by `validateBridgeState`: max 200 blocks/messages, 32 768 char text, 128 char IDs
- `bridge-watcher.ts` watches the **directory** (not the file) via `fs.watch`, 50ms debounce; falls back to 200ms polling if native watch fails

## Session Init Script

```bash
bash scripts/glass-session-init.sh [workspace_path]
```

Requires `jq`. Writes initial bridge state, preserving existing `blocks[]`. Outputs JSON result with `session_id` and `profile_detected`.

## `.glass-profile.yaml`

Place in a project root to mark it as a Glass-profiled workspace. Controls:

- Voice roles/colors (I=Velocity/amber, II=Guard/silver, III=Lens/gold)
  - Ceremony triggers (`auto_evaluate_after_commits: 15`, `auto_return_after_idle_minutes: 10`)
- Signal hot thresholds (`git_diff_lines: 200`, `iteration_count: 15`)
- Named presets (reproducible bridge states for regression baselines)
- Triadic weights (`safety: 1.0`, `correctness: 0.85`, `autonomy: 0.7`)

## Renderer Architecture

No virtual DOM. The render loop is `Field.ts` using Canvas2D. Key renderer modules:

- `ModulationEngine.ts` — ADSR envelope + LFO driven by `thresholdState` + `progress` → produces bus values for ambient intensity, disk scale, oval opacity
- `DiskEngine.ts` — renders the Spaceman + orbital geometry
- `OvalStadium.ts` — orbital ring around the Spaceman
- `ThresholdLine.ts` — animated threshold ceremony line
- `VoiceSequencer.ts` — sequences voice orbs (I/II/III) during ceremony states
- `BlockManager.ts` — creates/syncs Monaco editor instances from `BridgeState.blocks[]`
- `FieldState.ts` — reactive wrapper; `fieldState.update(bridgeState)` is the only data entry point

**The renderer decides nothing.** All ceremony state transitions, block content, and agent state come from the bridge file. The renderer animates whatever it receives.

## Tests

Vitest, `environment: "node"`. Test files: `src/**/*.test.ts`, `bridge/**/*.test.ts`.

`bridge-watcher.test.ts` uses `vi.mock('fs')` and `vi.resetModules()` per describe block — each test re-imports the module to reset the `blockSeq` counter. If adding tests for `bridge-watcher`, follow this pattern.

Run a single test file:

```bash
npx vitest run src/main/bridge-watcher.test.ts
```

## MCP Servers (this workspace)

`.claude/settings.local.json` enables only: `glass-server`, `nexus-server`, `school-server`. All other Cascade MCPs are disabled.

`glass-server` provides 13 tools:

- `glass_bridge_write`
- `glass_session_start`
- `glass_session_resume`
- `glass_emit_turn`
- `glass_update_signals`
- `glass_pending_messages`
- `glass_emit_block`
- `glass_assets_list`
- `glass_query_spatial_state`
- `glass_evaluate_ceremony`
- `glass_eval_run`
- `glass_eval_schedule`
- `glass_eval_status`

`glass_eval_schedule` is process-local. The durable eval artifact is the NDJSON eval log returned by `glass_eval_status`.

## Gitignored — Don't Create These

`dist/`, `out/`, `node_modules/`, `*.tsbuildinfo`, `snapshots/`, `assets/`, `prompts/`

## Current Phase

Phase 3 (Live Agent Integration) is complete — see `PHASE3.md` for workstream outcomes and `PHASE3_SIGNOFF.md` for closure evidence. Phases 1 (render pipeline) and 2 (interactivity) are complete. Workstream order was W1 (session lifecycle) → W2 (signals) → W5 (conversation) → W4 (blocks) → W3 (ceremony).

## Current Next Slices

1. Documentation truth sync: keep `REFACTORING-MARKERS.md`, `README.md`, and this file aligned with source.
2. Eval probe hardening: replace shell-dependent `execSync("npm ...")` calls in `Tools/MCPServers/glass-server/src/probes.ts` with argv-based process execution and richer failure detail.
3. Feature lanes: schema versioning/migrations before durable undo/history; inventory/indexing/search after schema shape is known; scheduler persistence only if process-local scheduling becomes unacceptable.

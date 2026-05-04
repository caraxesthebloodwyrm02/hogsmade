# Glass

A spatial development environment for Claude Code sessions. Glass renders the active work session as a living field — signal heat, ceremony state, floating code blocks, and bidirectional conversation — all driven by a shared bridge file that the agent writes and the renderer displays.

Glass is not a chat UI. It is a co-presence surface: user and agent inhabit the same dark canvas, work artifacts appear as spatial objects, and the intensity of the field mirrors the intensity of the work.

---

## Status

| Phase | Name                   | Status       |
| ----- | ---------------------- | ------------ |
| 1     | Render Pipeline        | Complete     |
| 2     | Interactivity          | Complete     |
| 3     | Live Agent Integration | **Complete** |

Phase 3 workstreams: W1 (session lifecycle) → W2 (signals) → W5 (conversation) → W4 (blocks) → W3 (ceremony) are all complete. See `PHASE3.md` for the roadmap details and `PHASE3_SIGNOFF.md` for closure evidence.

For a reusable blocker-navigation workflow that emphasizes autonomy, confidence, and exercise-driven reasoning, see `AUTONOMY-ROUTINE.md`. For a compact live-use version, see `AUTONOMY-ROUTINE-CARD.md`.

---

## Quick Start

```bash
npm install
npm run dev                   # Electron dev server with HMR
GLASS_DEVTOOLS=1 npm run dev  # With detached DevTools
npm run build                 # Production build → out/
npm run typecheck             # tsc --noEmit (both main and renderer)
npm test                      # Vitest (node environment)
```

Initialize the bridge file for a session:

```bash
bash scripts/glass-session-init.sh [workspace_path]
# Requires jq. Writes initial bridge state, preserving existing blocks[].
# Outputs JSON with session_id and profile_detected.
```

Override the bridge path:

```bash
GLASS_BRIDGE_PATH=/tmp/test-bridge.json npm run dev
```

Load an artifact (like the autonomy operator card or exercise worksheet) into the live field:

```bash
python scripts/glass-load-artifact.py AUTONOMY-ROUTINE-CARD.md
python scripts/glass-load-artifact.py AUTONOMY-EXERCISE-WORKSHEET.md --x 500 --y 120
```

---

## Architecture

Glass is an Electron app with three process boundaries and a file-based state contract.

### Process Boundaries

```
src/main/index.ts         — Electron main: IPC handlers, bridge watcher, window
src/preload/index.ts      — contextBridge: exposes window.glass.{...} to renderer
src/renderer/index.ts     — Canvas render loop, FieldState, user input
bridge/schema.ts          — Shared types compiled by both main and renderer
```

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — the renderer has no Node access. It only receives bridge state via IPC and sends user actions back via five exposed methods.

### The Bridge File

**Default path:** `~/.caraxes/field-bridge.json`

The bridge is the single source of truth. The agent writes it; the renderer reads it. The main process watches the directory (not the file) via `fs.watch` with a 50ms debounce, falling back to 200ms polling. All writes are atomic: write to `.tmp.<pid>` then `renameSync` to target. Permissions: `0o600` (file), `0o700` (directory).

**Bridge state shape:**

```typescript
{
  timestamp: string;           // ISO8601 — when the agent last wrote
  session_id: string;
  agent_state: AgentState;     // idle | thinking | writing | reviewing | elevated
  threshold_state: ThresholdState; // see ceremony states below
  progress: number;            // 0.0–1.0 within current ceremony state
  signals: {
    git_diff_lines: number;
    iteration_count: number;
    session_age_minutes: number;
  };
  blocks: BridgeBlock[];       // code/note/output/asset objects
  conversation: BridgeMessage[];
  voices: BridgeVoice[];       // populated during ceremony evaluation
}
```

**Validation limits:** max 200 blocks/messages, 32 768 char text fields, 128 char IDs.

### IPC Channels

| Direction       | Channel                       | Payload                                                 |
| --------------- | ----------------------------- | ------------------------------------------------------- |
| main → renderer | `bridge:update`               | `BridgeState`                                           |
| renderer → main | `bridge:patch-block`          | `{ id, content }`                                       |
| renderer → main | `bridge:send-message`         | `{ text }`                                              |
| renderer → main | `bridge:add-block`            | `{ type, language, content, position, origin, asset? }` |
| renderer → main | `bridge:patch-block-position` | `{ id, x, y }`                                          |

---

## Renderer Architecture

The renderer is a pure Canvas2D animation loop. It makes no decisions — it animates whatever the bridge file contains.

```
Field.ts               — top-level render loop, composes all sub-engines
  FieldState.ts        — reactive wrapper; bridge state enters only here
  ModulationEngine.ts  — ADSR envelope + LFO → bus values for all components
  DiskEngine.ts        — Spaceman avatar and orbital geometry
  OvalStadium.ts       — orbital ring, scaled by oval bus
  VoiceLayer.ts        — three ceremony voice orbs (I/II/III)
  ThresholdLine.ts     — animated ceremony threshold line
  ConversationLayer.ts — floating conversation text in the field
  BlockManager.ts      — syncs Monaco editor instances from bridge blocks[]
  AudioEngine.ts       — ambient audio (ceremony-state-driven)
  Camera.ts            — pan offset; persisted across sessions
```

### Modulation Engine

The `ModulationEngine` is the signal-to-visual translator. It takes `threshold_state`, `progress`, and `signalHeat` and produces bus values consumed by every rendering component.

**Signal chain:**

```
threshold_state + progress + time
  → ADSR envelope value (sustain level by state)
  → LFO overlay (rate and depth by state)
  → signal heat adjusts LFO rate and lifts sustain ceiling
  → mod signal (0..1)
  → bus routing → per-component parameters
```

**Ceremony states and their envelope character:**

| State                | Sustain | LFO Rate     | Character               |
| -------------------- | ------- | ------------ | ----------------------- |
| `ground`             | 0.12    | 0.04 Hz      | Quiet, slow breath      |
| `evaluating`         | 0.50    | 0.18 Hz      | Alert, anticipating     |
| `floor_rising`       | 1.00    | 0.22 Hz      | Maximum, ascending      |
| `voices_appearing`   | 0.85    | 0.12 Hz      | High, settling          |
| `voice_1/2/3_active` | 0.88    | 0.10–0.13 Hz | Engaged, focused        |
| `elevated`           | 1.00    | 0.07 Hz      | Full, still — Rift open |
| `returning`          | 0.25    | 0.06 Hz      | Descending              |
| `denied`             | 0.08    | 0.35 Hz      | Rapid flutter, low      |

**Signal heat** is computed from `signals` normalized against `_hot_threshold`. A value of 1.0 means all signals are at or above their hot threshold. Heat accelerates LFO rate by up to 80% and lifts mod output by up to 60%.

### Blocks

Blocks are Monaco Editor instances positioned absolutely over the canvas. Types:

| Type     | Editable         | Use                                      |
| -------- | ---------------- | ---------------------------------------- |
| `code`   | User-origin only | Source files, diffs                      |
| `note`   | User-origin only | Reasoning, annotations                   |
| `output` | Read-only        | Test results, command output             |
| `asset`  | Read-only        | Semantic collectibles (see Asset System) |

Agent-origin blocks are read-only. User-origin blocks write back to the bridge via `bridge:patch-block` IPC on each edit.

### Presences

- **User presence** — cursor-following light point with a brief trail that fades.
- **Agent presence (Spaceman)** — static geometric figure (`#c8b89a` warm fill), centered in the field. Pulses when `agent_state` changes; completely still when idle.

---

## Ceremony System

The Threshold Ceremony is the quality gate rendered as field animation. It is triggered by real work conditions (commit count, signal heat) and progresses through a defined state machine.

### State Machine

```
ground
  → evaluating       (N commits reached, or agent calls glass_evaluate_ceremony)
  → floor_rising     (evaluation begins)
  → voices_appearing (triadic safeguard activated)
  → voice_1_active
  → voice_2_active
  → voice_3_active
  → elevated         (all voices approved — Rift open)
  → returning        (idle timeout — field descends)

evaluating → denied  (any voice vetoes — field flashes, returns to ground)
```

State transitions are enforced by `glass-server` — the renderer cannot jump states.

### Voice System (Triadic Safeguard)

Three voices evaluate the session at ceremony time:

| Voice        | Color  | Represents                             |
| ------------ | ------ | -------------------------------------- |
| I — Velocity | Amber  | Autonomy — is the work moving forward? |
| II — Guard   | Silver | Safety — is the work safe to continue? |
| III — Lens   | Gold   | Correctness — is the work accurate?    |

Voices render as colored orbs orbiting the Spaceman during `voices_appearing` through `voice_3_active` states. Each voice's `text` field (set in the bridge) renders in the conversation layer while that voice is active.

### Asset Rarity Gate

When the agent mints an asset block, the bridge schema enforces a rarity ceiling based on current ceremony state:

| State                                | Max Rarity  |
| ------------------------------------ | ----------- |
| `ground`, `evaluating`               | uncommon    |
| `floor_rising`, `returning`          | rare        |
| `voices_appearing`, `voice_*_active` | epic        |
| `elevated`                           | **mythic**  |
| `denied`                             | common only |

This means high-rarity assets can only exist if the session passed a real ceremony threshold.

---

## Asset System

Assets are semantic collectibles that accumulate across sessions. They surface as `asset`-type blocks in the field and are durably recorded in `~/.caraxes/glass-inventory.json` (the ledger).

**Category progression (maturation path):**

```
fragment (raw) → token (exchange) → artifact (constructed) → relic (precedent)
```

**Off-path categories:** `echo` (retained insight from past sessions), `seed` (foundational idea/template), `catalyst` (consumable — spent to trigger state change), `blueprint` (architectural pattern), `collectible` (earned via ceremony milestones).

The bridge file holds the field-visible `AssetMeta`; the ledger holds the durable record. `ledger_id` is the join key.

---

## Workspace Profile

Place a `.glass-profile.yaml` in a project root to mark it as a Glass-profiled workspace. Glass detects this on session start.

```yaml
voice_roles:
  I: Velocity # amber
  II: Guard # silver
  III: Lens # gold

ceremony_triggers:
  auto_evaluate_after_commits: 5
  auto_return_after_idle_minutes: 10

signals:
  hot_threshold:
    git_diff_lines: 200
    iteration_count: 15
    session_age_minutes: 60

triadic_weights:
  safety: 1.0
  correctness: 0.85
  autonomy: 0.7
```

---

## MCP Tools (glass-server)

The glass-server MCP provides the agent-side API:

| Tool                   | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `glass_session_start`  | Initialize bridge for a new session; detects `.glass-profile.yaml`                      |
| `glass_session_resume` | Restore field state from a previous session; read conversation for new user messages    |
| `glass_emit_turn`      | Append agent message to conversation; update `agent_state` and optional `signals` patch |
| `glass_bridge_write`   | Low-level full or partial bridge write for direct state control                         |

The MCP server is the only valid write path to the bridge during an agent session. Direct file writes bypass validation and the rarity gate.

---

## TypeScript — Split Configs

The root `tsconfig.json` is reference-only. Two real configs:

| Config               | Covers                                       | Environment     |
| -------------------- | -------------------------------------------- | --------------- |
| `tsconfig.node.json` | `src/main/**`, `src/preload/**`, `bridge/**` | ES2022 (no DOM) |
| `tsconfig.web.json`  | `src/renderer/**`, `bridge/**`               | ES2022 + DOM    |

`bridge/schema.ts` is compiled by both — it is the shared type contract. Never add browser-only or Node-only imports to `bridge/`.

`npm run typecheck` validates both via project references.

---

## Tests

Vitest, `environment: "node"`. Test files match `src/**/*.test.ts` and `bridge/**/*.test.ts`.

`bridge-watcher.test.ts` uses `vi.mock('fs')` and `vi.resetModules()` per describe block — each test re-imports the module to reset the `blockSeq` counter. Follow this pattern when adding bridge-watcher tests.

```bash
npm test                                          # all tests
npx vitest run src/main/bridge-watcher.test.ts    # single file
npx vitest run src/renderer/field/ModulationEngine.test.ts
```

---

## Security Posture

The renderer is fully sandboxed:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Navigation locked to `file://` (or `localhost:*` in dev mode)
- `setWindowOpenHandler` denies all popups
- CSP: `connect-src 'none'` — no outbound network from the renderer
- Bridge file: `0o600` permissions, atomic rename writes only
- IPC payloads are type-validated in the main process before acting

---

## Reference

| File                            | Purpose                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `AGENTS.md`                     | Agent operating context, commands, module map                          |
| `DESIGN.md`                     | Original design document — visual language, components, MVP definition |
| `PHASE3.md`                     | Phase 3 workstreams (W1–W5), dependency graph, success criteria        |
| `ARCHITECTURE-PARTITIONS.md`    | System partition map and data flow diagrams                            |
| `bridge/schema.ts`              | Complete bridge type contract                                          |
| `scripts/glass-session-init.sh` | Session initialization script                                          |

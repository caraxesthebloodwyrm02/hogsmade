# Glass — Phase 4: Closed-Loop Presence

> Authored: 2026-05-07  
> Session context: Post-Phase-3 synthesis — identity, audience, competitive position, x-change integration, and phase planning  
> Branch at time of writing: `arch/3d-semantic-assets`

---

## Table of Contents

1. [What Glass Is](#1-what-glass-is)
2. [How It Works](#2-how-it-works)
3. [Primary Use Cases](#3-primary-use-cases)
4. [Primary Audience](#4-primary-audience)
5. [Demographics Dataset](#5-demographics-dataset)
6. [Codebase State Assessment](#6-codebase-state-assessment)
7. [Competitive Landscape](#7-competitive-landscape)
8. [How Glass Connects to x-change](#8-how-glass-connects-to-x-change)
9. [Scope Constraints](#9-scope-constraints)
10. [Phase 4 Definition](#10-phase-4-definition)

---

## 1. What Glass Is

Glass is an **Electron + Canvas2D spatial developer environment** where an AI agent's live state is rendered as continuous ambient geometry — not a chat sidebar.

The UI is a pure Canvas2D render loop (no React, no Vue, no component framework), driven by a single shared JSON file (`~/.caraxes/field-bridge.json`) that any process can write. The renderer animates whatever the bridge contains. **The renderer decides nothing.**

The central metaphor is **co-inhabitation**: the developer and the agent exist in the same spatial field. Agent affect is expressed through:

- An orbital **Spaceman** avatar at the field center
- A **modulation engine** (ADSR envelope + LFO) applied to four visual buses
- A **ceremony state machine** (10 states: `ground → evaluating → floor_rising → voices_appearing → elevated → returning` + `denied`)
- Three **voice orbs** representing distinct agent roles: Velocity (amber), Guard (silver), Lens (gold)
- Signal heat from real workspace activity (`git_diff_lines`, `iteration_count`) driving field intensity

Glass is not a productivity tool optimized for task throughput. It is an **ambient cohabitation environment** — the first developer tool that treats agent presence as a continuous spatial and physiological experience rather than a text list or chat thread.

---

## 2. How It Works

### Data flow

```
Agent writes bridge file (atomic rename: .tmp.<pid> → target)
  → bridge-watcher detects (50ms debounce, inotify; 200ms polling fallback)
  → IPC push: bridge:update → renderer
  → FieldState.update(bridgeState)
  → ModulationEngine ticks (ADSR/LFO → DiskBus + OvalBus + VoiceBus + AmbientBus)
  → DiskEngine + OvalStadium + VoiceSequencer + AudioEngine consume buses
  → Canvas2D frame at 60fps
```

### Process boundary

```
src/main/index.ts         — Electron main: IPC handlers, bridge watcher, window
src/preload/index.ts      — contextBridge: exposes typed window.glass API to renderer
src/renderer/index.ts     — entry: wires Field, FieldState, SessionState, user input
bridge/schema.ts          — shared type contract (compiled by both tsconfigs)
```

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer has no Node access — only the `window.glass` surface.

### window.glass API surface (10 methods)

| Method | Purpose |
|---|---|
| `onBridgeUpdate(cb)` | Subscribe to BridgeState updates |
| `patchBlock(id, content)` | Persist user-owned block edits |
| `sendMessage(text)` | Append a user conversation turn |
| `addBlock(type, language, content, position, asset?)` | Add a user-origin block |
| `patchBlockPosition(id, x, y)` | Persist drag/reposition events |
| `deleteBlock(id)` | Delete a user-owned block |
| `listAssets()` | Read durable inventory assets |
| `searchSemantic(query, limit?)` | Search visible blocks and inventory |
| `getFieldProfile()` | Read the active field profile/config |
| `triggerCeremony(state)` | Request a ceremony state transition |

### ModulationEngine signal chain

```
thresholdState + progress + deltaMs + signalHeat
  → ADSR envelope (attack/decay/sustain/release per state)
  → LFO (rate + depth per state; denied = 2× faster)
  → smoothing (lerp 0.004/frame normally; 0.008 in denied)
  → BusValues {
      disk:  { scale, brightness, rimAlpha }
      oval:  { opacity, lineWidth, markerAlpha, fieldAlpha }
      voice: { alpha, scanSpeed, glowRadius }
      field: { ambientIntensity }
    }
```

Signal heat: `Math.min(1, iterationCount / 15)` — normalized against the hot threshold from `.glass-profile.yaml`.

### ThresholdState machine

```
ground → evaluating → floor_rising → voices_appearing
  → voice_1_active → voice_2_active → voice_3_active → elevated
  → returning → ground
  (any state) → denied
```

---

## 3. Primary Use Cases

| Use Case | Description |
|---|---|
| **Ambient agent presence** | Developer perceives agent state peripherally through spatial/visual channels — no interrupt-driven context switching |
| **Ceremony-gated work review** | Triadic voices (Velocity/Guard/Lens) evaluate work at threshold; developer feels the moment before a ceremony fires |
| **Spatial code block workspace** | Monaco editor blocks positioned on an infinite canvas — draggable, typed (code/note/output/asset) |
| **Accountability closure** | Bridge file feeds x-change reward lifecycle; a session's work is independently verifiable |
| **Workspace-as-instrument** | ADSR/LFO signal chain creates the feel of a synthesizer applied to a developer environment |
| **Live session observability** | eval-runner (glass-server) probes typecheck/tests/bridge health on a schedule |

---

## 4. Primary Audience

Four segments, ordered by immediacy of fit:

### Segment A — Creative technologists / musician-coders
- **Age:** 25–40
- **Tools they already use:** Strudel, TidalCycles, Max/MSP, TouchDesigner, SuperCollider
- **Psychographic:** View coding as a somatic practice. Believe tools should have aesthetic texture. Distrust purely utilitarian software. Spatial + ritual UX maps directly to their worldview.
- **Pain solved:** Glass is the only developer environment that speaks their design language — ADSR, LFO, ceremony, spatial presence, orbital geometry.

### Segment B — AI-native developers post-Cursor fatigue
- **Age:** 22–35
- **Current tools:** Heavy Cursor/Windsurf users
- **Psychographic:** Pragmatic but aesthetically frustrated. Sense that "there should be a better way to coexist with a running agent." The chat-sidebar model becomes cognitively exhausting on long agentic runs.
- **Pain solved:** Peripheral awareness of agent state without modal interruption. The field tells them what the agent is doing without demanding attention.

### Segment C — Tools researchers and computing philosophers
- **Age:** 28–50
- **Communities:** Future of Coding, Ink & Switch, SPLASH, HCI researchers; readers of Bret Victor
- **Psychographic:** Skeptical of VC-optimized productivity software. Want computing tools that reflect humane, embodied interaction. Glass as proof-of-concept has high signal value.
- **Pain solved:** Glass demonstrates that a different paradigm is buildable. They amplify this disproportionately.

### Segment D — Indie developers with aesthetic identity
- **Age:** 25–45
- **Current tools:** Zed, Nova — because VS Code feels generic
- **Psychographic:** Workspace-as-identity. They curate terminal, WM, font, color scheme obsessively. Investment in environment is a value in itself.
- **Pain solved:** A workspace that rewards aesthetic investment and feels owned, not rented.

---

## 5. Demographics Dataset

| Segment | Est. Size | Age Range | Gender | Geography | Income (USD) | Tech Fluency | WTP/mo |
|---|---|---|---|---|---|---|---|
| A | ~80K | 25–40 | 65% M / 30% F / 5% NB | EU / US / JP concentrated | $60–120K | Expert | High ($20–50) |
| B | ~2M | 22–35 | 72% M / 24% F / 4% NB | US / EU / IN | $80–180K | Expert | Medium ($10–30, if clearly differentiated) |
| C | ~15K | 28–50 | 60% M / 35% F / 5% NB | US / EU / AU academic | $70–140K | Expert | Low (early access free; word-of-mouth value high) |
| D | ~500K | 25–45 | 68% M / 27% F / 5% NB | Global; Linux/Mac skew | $50–130K | Advanced–Expert | Medium-High ($15–40) |

> Estimates derived from Strudel/Muse/Zed user base sizes + GitHub developer census data.  
> Segment B is the largest addressable but has the highest churn risk without clearly differentiated value over Cursor.

**Psychographic constants across all segments:** local-first preference, aesthetic quality as a value signal, distrust of VC-optimized productivity software, willingness to configure/extend.

---

## 6. Codebase State Assessment

> Snapshot date: 2026-05-07

### Summary

| Dimension | Status |
|---|---|
| **Phase** | Phase 3 (Live Agent Integration) — complete and signed off |
| **Active branch** | `arch/3d-semantic-assets` |
| **Uncommitted changes** | 7 files in main process (`bridge-watcher.ts`, `index.ts`, tests, docs) |
| **Test suite** | 26 files, 179 tests at Phase 3 close + 13 eval-runner tests; all pass |
| **TypeScript health** | Strict mode, split configs, zero `TODO`/`FIXME` in source |
| **Runtime dependencies** | 1 (`monaco-editor`) |
| **Known debt** | 1 PARTIAL marker (Marker 4 — `search:semantic` inline validation; cosmetic, non-blocking) |
| **Release artifact** | AppImage + `.deb` at `v0.1.0` in `release/` |

### Uncommitted files on `arch/3d-semantic-assets`

```
AGENTS.md                          — docs update
README.md                          — docs update
scripts/glass-session-init.sh      — script change
src/main/bridge-watcher.test.ts    — test update
src/main/bridge-watcher.ts         — source change
src/main/index.test.ts             — test update
src/main/index.ts                  — source change
```

### Post-Phase-3 runway (from README)

| Lane | Dependency | Priority |
|---|---|---|
| Eval probe hardening (`execSync` → argv-based) | None | First executable slice |
| Schema versioning / migrations | None | Must precede undo/history + inventory |
| Durable undo/history | Schema versioning | Deferred |
| Inventory indexing / search | Schema shape known | Phase 4 W4 candidate |
| Scheduler persistence | Process-local insufficient | Deferred |
| Observability | Incremental | Ongoing |

### Known discrepancies resolved

- ✅ `.glass-profile.yaml` key name fixed: `auto_evaluate_after_iterations` → `auto_evaluate_after_commits: 15` (matches code expectations)
- ✅ `PHASE3.md` updated to reflect `auto_evaluate_after_commits: 15`
- ✅ `README.md` updated to reflect `auto_evaluate_after_commits: 15`
- ✅ `session-start.sh` updated to auto-detect Glass profiles and remind about `glass_session_start` tool

---

## 7. Competitive Landscape

### Overview table

| Tool | Spatial? | Ambient UI? | Agent Presence | Ceremony/Ritual | Audio Metaphor | Local-First | Status |
|---|---|---|---|---|---|---|---|
| Cursor | No | No | Kanban list | No | No | No | Dominant |
| Windsurf | No | No | Kanban + flow rhetoric | No | No | No | Active |
| GitHub Copilot | No | No | Ghost text + checklist | No | No | No | Dominant |
| Muse | Yes | No | No AI | No | No | Yes | Active ($10/mo) |
| Heptabase | Yes (whiteboard) | No | Chat sidebar | No | No | Yes | YC-backed |
| **Kosmik** | **Yes (canvas)** | No | No | No | No | Yes | **Sunsetting May 2026** |
| Observable | Partial (dataflow) | No | Inline assist | No | No | No | Active |
| Strudel | No | Yes (waveform) | No | No | Yes | No | Active |
| TouchDesigner | Yes (node-graph) | Yes | No | No | Yes | Yes | Active ($300+) |
| **Glass** | **Yes** | **Yes (always-on)** | **Orbital/animated** | **Yes** | **Yes (ADSR/LFO)** | **Yes** | v0.1.0 |

### Key differentiators

1. **Agent state is felt, not read.** Canvas2D orbital geometry communicates threshold state continuously. You perceive agent affect through spatial/visual channels, not by reading a status string.
2. **Ceremony as a first-class concept.** No other developer tool has a formalized ceremony state machine. Borrowed from ritual design, not productivity software.
3. **Triadic voice model.** Three distinct agent roles (Velocity / Guard / Lens) coexist spatially. A theory of AI collaboration encoded in UX.
4. **ADSR/LFO signal chain applied to UI.** The modulation architecture is literally a synthesizer applied to visual rendering. No IDE or canvas app has done this.
5. **Bridge file as ambient shared reality.** Any process that can write JSON can participate in the Glass field. The renderer is a pure display consumer. Decouples AI agent runtime from visual environment entirely.

### The unoccupied niche

> *Agent-cohabitation UX* — environments designed not for issuing commands to AI but for **being in the same space as a running agent.**

No production tool treats this as a first-class design problem. Glass is the only instance of this pattern in the wild.

**Kosmik's shutdown (May 2026) is a direct opening.** It had the most interesting spatial + browser metaphor and is leaving a void in "spatial interfaces and document-oriented systems." Its audience is unhoused.

---

## 8. How Glass Connects to x-change

### What x-change is

x-change (`/home/irfankabir/x-change`) is a **principled reward service** — a lightweight Python HTTP server (port 8788) implementing an auditable, policy-driven reward lifecycle:

```
drafted → earned → payment_pending → payment_confirmed → student_acknowledged
```

No runtime dependencies beyond the Python standard library. Builder and student are the same person. A third party can inspect the evidence trail and verify the reward is legitimate.

### Integration architecture

The sole data handoff between Glass and x-change is `~/.caraxes/field-bridge.json`.

```
                 ┌─────────────────────────────┐
                 │  ~/.caraxes/field-bridge.json│  ← shared state file (0o600)
                 └──────────┬──────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │ WRITES            │                    │ READS
         ▼                   │                    ▼
┌────────────────┐     ┌─────┴──────┐   ┌───────────────────┐
│   Glass        │     │  .caraxes/ │   │   x-change        │
│ (Electron app) │     │   bin/     │   │ (Python HTTP svc) │
│ bridge-watcher │     │            │   │ useb.py           │
│ (TS, inotify)  │     │glass-bridge│   │ glass_adapter.py  │
│                │     │-write.sh   │   │                   │
│ Writes full    │     │glass-post  │   │ POST /v0/ingest/  │
│ BridgeState    │     │-commit.sh  │   │   glass-bridge    │
│ on agent state │     │(git hook)  │   │                   │
│ change         │     └────────────┘   │ evidence_ledger   │
└────────────────┘                      │ (SQLite)          │
                                        └───────────────────┘
```

### Wire protocol

`glass_adapter.py` maps `BridgeState → x-change ingest payload`:

```
BridgeState fields used:
  session_id            → ingest.session_id
  agent_state           → stored in _glass_bridge
  threshold_state       → stored in _glass_bridge
  progress              → stored in _glass_bridge
  blocks[]              → stored in _glass_bridge
  conversation[]        → stored in _glass_bridge
  signals {
    git_diff_lines       → evidence trail (work signal)
    iteration_count      → evidence trail (work signal)
    session_age_minutes  → evidence trail
  }
```

Entire bridge snapshot preserved verbatim in `evidence_ledger.payload_json._glass_bridge`. Glass telemetry **never** autonomously triggers reward state transitions — only explicit operator booleans do.

### Integration gaps

| Gap | Impact | Phase 4 address? |
|---|---|---|
| No ceremony → auto-ingest | Manual `useb_submit.py` required at every session close — **blocking** | Yes — W2 |
| No reverse channel | `payment_confirmed` in x-change produces zero feedback in Glass canvas | Yes — W3 |
| Bridge staleness on idle sessions | 300s freshness gate rejects USEB on idle sessions without recent agent activity | Yes — W1 |
| No live reward state block | Developer must leave canvas to check reward lifecycle | Yes — W3 |
| Manual token management | `XCHANGE_INGEST_TOKEN` must be in shell env; no secure auto-injection | Out of scope Phase 4 |
| GRID substantiation optional | GRID workspace health not reliably available at session-close on all machines | Out of scope Phase 4 |

---

## 9. Scope Constraints

### In scope for Phase 4

```
1. Bridge layer (main process, bridge-watcher, IPC)
   — current active work surface on arch/3d-semantic-assets

2. x-change integration
   — ceremony → auto-ingest
   — reward state block rendered in canvas

3. Semantic inventory
   — continuation of arch/3d-semantic-assets direction
   — local indexing over blocks + asset metadata
   — powers SimilarityPane with real similarity scoring

4. Bridge heartbeat
   — staleness fix
   — prerequisite for reliable x-change submissions

5. Schema versioning (foundation)
   — unlocks undo/history + inventory in future phases
```

### Out of scope for Phase 4

```
- 3D rendering / WebGL migration (not in current stack)
- Scheduler persistence (process-local is acceptable; defer)
- Durable undo/history (requires schema versioning to ship first)
- Multi-agent namespacing (deferred from eval-runner design)
- New ceremony states (10-state machine is sufficient)
- XCHANGE_INGEST_TOKEN auto-injection (ops concern, separate track)
```

---

## 10. Phase 4 Definition

### Goal statement

> **By end of Phase 4, a developer completes a coding session in Glass, the ceremony fires naturally at the right threshold, x-change receives the evidence automatically, the reward block on the canvas updates to `payment_pending`, and the developer never touches a terminal to close the loop.**

### Workstreams

---

#### W1 — Bridge Heartbeat (small)

**Problem:** Bridge timestamp is only updated on agent state changes. An idle session fails x-change's 300s freshness gate.

**Solution:** Main process pings bridge timestamp on a 60s keep-alive interval when no agent activity is present. No content change — timestamp only.

**Files touched:** `src/main/index.ts`, `src/main/bridge-watcher.ts`

**Also resolves:** `.glass-profile.yaml` key name now consistent (`auto_evaluate_after_commits: 15` fixed).

**Exit criteria:**
- [ ] Bridge timestamp stays fresh on an idle session for 10+ minutes
- [ ] USEB freshness gate passes after 6+ minutes of agent inactivity
- [x] Profile key name consistent between YAML and docs (fixed in W1 prep)

---

#### W2 — Ceremony Auto-Ingest (medium)

**Problem:** Manual `useb_submit.py` call is the only required operator action after a ceremony fires. It breaks the loop.

**Solution:** When `ThresholdState` transitions to `elevated` (or `returning` from `elevated`), the main process automatically invokes the USEB submission — same as the operator script but spawned via `child_process` with `XCHANGE_INGEST_TOKEN` from the session environment.

**New IPC channel:** `bridge:ceremony-close` → main → spawns `useb_submit.py --contract-satisfied --submit`

**Failure handling:** Non-blocking — if USEB fails, Glass continues normally; failure logged to `[glass]` prefixed console output.

**Exit criteria:**
- [ ] Elevated ceremony triggers USEB submission automatically
- [ ] Failure path is silent in the canvas (logged only)
- [ ] Unit test: IPC handler spawns USEB with correct args
- [ ] Integration test: ceremony transition → auto-submit verified end-to-end

---

#### W3 — Reward State Block (medium)

**Problem:** x-change `payment_confirmed` event produces no feedback in the Glass canvas. Developer must leave the canvas to check reward lifecycle.

**Solution:**
- New glass-server tool: `glass_reward_state` — polls `GET /v0/state/reward/<id>` on a configurable interval (default 120s)
- Result rendered as a read-only `output`-type block in the Glass canvas, positioned in a fixed corner
- Block updates in place (same block ID, content patched) when reward state changes
- Visual: reward lifecycle as a minimal state badge — `earned → payment_pending → payment_confirmed → acknowledged`

**New glass-server tool:**

```ts
glass_reward_state({ reward_id: string, poll_interval_seconds?: number })
  → { state: RewardState, last_polled: string, block_id: string }
```

**Exit criteria:**
- [ ] Reward state block appears on canvas after first poll
- [ ] Block updates in place on state change (no duplicate blocks)
- [ ] Correct state badge at each lifecycle step
- [ ] Test: poll response maps to correct badge label

---

#### W4 — Semantic Block Index (medium-large)

**Problem:** `SimilarityPane` and `searchSemantic` exist but use a shallow local-search implementation. With a growing block inventory, discoverability is low.

**Solution:**
- Extend `local-search.ts` with a proper inverted index over block content + asset metadata (label, category, glyph, source_ceremony)
- TF-IDF scoring over block text; exact match + fuzzy match for asset fields
- `searchSemantic` IPC handler routes through new index
- Index rebuilds on every `BridgeState` update (debounced 2s)

**Files touched:** `src/main/local-search.ts`, `src/main/index.ts`

**Exit criteria:**
- [ ] Semantic search returns ranked results from block content
- [ ] Asset metadata (label, category, rarity) is searchable
- [ ] Index rebuild debounce prevents thrashing on rapid bridge updates
- [ ] Existing `searchSemantic` tests pass; new tests cover TF-IDF ranking

---

### Execution order

```
W1 (Bridge Heartbeat) → W2 (Ceremony Auto-Ingest) → W3 (Reward State Block) → W4 (Semantic Index)
```

W1 and W2 ship first — they remove the blocking gaps. W3 requires W2 (auto-ingest must land before the reverse channel is meaningful). W4 is independent and can proceed in parallel after W1.

### Sizing

| Workstream | Estimated effort | Can ship independently? |
|---|---|---|
| W1 — Bridge Heartbeat | Small (1 session) | Yes |
| W2 — Ceremony Auto-Ingest | Medium (1–2 sessions) | Yes |
| W3 — Reward State Block | Medium (2 sessions) | After W2 |
| W4 — Semantic Block Index | Medium-large (2–3 sessions) | Yes (after W1) |

---

## Appendix: Flags and Open Questions

| Item | Status |
|---|---|
| `.glass-profile.yaml` key name consistency verified (fixed: `auto_evaluate_after_commits: 15`) | ✅ Resolved in W1 prep |
| Marker 4 PARTIAL — `search:semantic` inline payload validation | Fix in W4 (same file) |
| `XCHANGE_INGEST_TOKEN` secure injection | Out of scope Phase 4 |
| Kosmik shutdown (May 2026) — audience opening | Consider demo/share artifact as Phase 4 delivery alongside W1–W4 |
| 3D semantic asset work on `arch/3d-semantic-assets` — committed as `feat(tooling): arrow-audit CLI + 3D visualization` (PR #159) | ✅ Shipped |

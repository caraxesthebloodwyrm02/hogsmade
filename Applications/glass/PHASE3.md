# Glass Phase 3 — Live Agent Integration

## Phase Context

| Phase | Name                   | Status             | Core Delivery                                                                                                                                                                                              |
| ----- | ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Render Pipeline        | Complete           | Field, presences, modulation engine, ceremony states, blocks, conversation, audio. Canvas2D render loop driven by bridge file.                                                                             |
| 2     | Interactivity          | Complete (ca59ece) | User text input, block spawn (right-click + Ctrl+N), block drag (grip strip), session persistence (camera offset), IPC round-trip through bridge file, Claude Code hook reminder.                          |
| 3     | Live Agent Integration | **Complete**       | Glass becomes a working development surface — the field reflects real agent sessions, signals derive from real work, ceremony triggers from real conditions, conversation is bidirectional with the agent. |

## Phase 3 Definition

Glass currently visualizes bridge state and writes to the bridge during normal work. Phase 3 closes the loop: a Claude Code session **drives** the field in real time, and user actions in Glass **reach** the agent.

## Workstreams

### W1: Session Lifecycle Automation

**Status:** Complete
**Goal:** Agent sessions automatically initialize and update Glass without manual bridge edits.

**Current state:**

- `glass-server` MCP tools exist: `glass_session_start`, `glass_bridge_write`, `glass_emit_turn`, `glass_session_resume`
- `session-start.sh` hook emits a passive reminder about Glass tools
- No tool is called automatically — agent must decide to call them

**Phase 3 target:**

- `glass_session_start` called at session open when working in a Glass-profiled workspace (detected by `.glass-profile.yaml` presence)
- `agent_state` transitions emitted at natural boundaries: `idle` -> `thinking` (on user prompt) -> `writing` (on file edit) -> `reviewing` (on test/lint) -> `idle` (on turn end)
- `glass_session_resume` called on session resume to restore field continuity

**Implementation surface:**

- Extend `session-start.sh` to detect `.glass-profile.yaml` in CWD and auto-call `glass_session_start` via the MCP tool reminder
- OR: Create a `/glass` skill that wraps session initialization + state emission as a dispatchable command
- Agent-state transitions require a `PostToolUse` hook or explicit emit calls woven into the agent's response cycle

**Decision required:** Passive (agent calls tools when reminded) vs. active (hooks call bridge-write directly). Passive is safer — active risks writing stale state when the agent isn't actually using Glass.

---

### W2: Signal-Driven Field Modulation

**Status:** Complete
**Goal:** Bridge `signals` reflect real work metrics, driving field intensity through the modulation engine.

**Current state:**

- `ModulationEngine` reads `thresholdState` and `progress` to produce ADSR envelope -> LFO -> bus values
- `signals` object exists in bridge: `{ git_diff_lines, iteration_count, session_age_minutes }`
- Nothing populates signals from real data

**Phase 3 target:**

- `git_diff_lines`: computed from `git diff --stat` at each agent turn boundary
- `iteration_count`: incremented per agent tool call or turn
- `session_age_minutes`: elapsed time since `glass_session_start`
- Signals feed into field ambient intensity, oval stadium opacity, disk brightness
- `.glass-profile.yaml` `signals.hot_threshold` values (git_diff_lines: 200, iteration_count: 15) define the "hot" boundary where field enters heightened state

**Implementation surface:**

- `glass_emit_turn` already accepts `agent_state` — extend to accept optional `signals` patch
- OR: Dedicated `glass_update_signals` tool that reads git state and computes metrics
- Signal -> modulation mapping: normalize signals against hot_threshold, feed as a multiplier into `ModulationEngine` base values
- Requires renderer change: `FieldState` passes signals to `ModulationEngine.tick()`, which adjusts envelope sustain/LFO based on signal heat

**Data flow:**

```
git diff --stat -> agent reads line count -> glass_emit_turn({signals: {git_diff_lines: N}})
  -> bridge file update -> fs.watch -> FieldState.update()
  -> ModulationEngine receives signal heat -> bus values shift
  -> field ambient intensity rises -> grain increases, disk brightens, oval markers glow
```

---

### W3: Ceremony Activation from Real Conditions

**Status:** Complete
**Goal:** Threshold ceremony (evaluating -> floor_rising -> voices -> elevated) triggers from actual work conditions, not manual bridge edits.

**Current state:**

- Full ceremony rendering implemented (ThresholdLine, VoiceSequencer, VoiceLayer, DiskEngine states, floor-rise animation)
- `.glass-profile.yaml` defines triggers: `auto_evaluate_after_commits: 5`, `auto_return_after_idle_minutes: 10`
- Triadic guard in `glass-server` enforces valid state transitions (cannot jump ground -> elevated)
- Nothing evaluates these triggers

**Phase 3 target:**

- After N commits (from profile), agent or automation sets `threshold_state: "evaluating"`
- Evaluation runs the Triadic Safeguard: Voice I (Velocity/amber), Voice II (Guard/silver), Voice III (Lens/gold) each assess the work
- If all three voices approve, ceremony progresses: `floor_rising` -> `voices_appearing` -> `voice_1_active` -> `voice_2_active` -> `voice_3_active` -> `elevated`
- If denied: `denied` state, field flashes, returns to ground
- After idle timeout: `returning` state, field settles

**Implementation surface:**

- Ceremony trigger logic belongs in glass-server or a dedicated `/rift` integration, not in the Electron renderer
- glass-server needs a `glass_evaluate_ceremony` tool that: reads commit count from signals, compares to profile threshold, initiates state transition sequence
- Voice text content comes from the agent's assessment — each voice is a structured evaluation prompt
- Progress (0.0-1.0) advances over time during each ceremony state, controlled by the emitting agent

**Constraint:** The renderer is a dumb display. It does not decide whether ceremony starts. The agent (or glass-server tool) is the ceremony controller. The renderer animates whatever `threshold_state` + `progress` + `voices[]` the bridge file contains.

---

### W4: Blocks as Work Artifacts

**Status:** Complete
**Goal:** Code blocks in the field represent real files and changes from the agent's work.

**Current state:**

- `glass_bridge_write` can push `blocks[]` with arbitrary content
- Blocks render as Monaco editors, agent-origin blocks are read-only
- User can create blocks (right-click spawn) and edit user-origin blocks
- User block edits write back to bridge via `bridge:patch-block`

**Phase 3 target:**

- Agent emits code blocks showing key file changes: `{ type: "code", language: "typescript", content: <file excerpt>, origin: "agent" }`
- Output blocks show command results: `{ type: "output", content: <test output>, origin: "agent" }`
- Note blocks for agent explanations: `{ type: "note", content: <reasoning>, origin: "agent" }`
- Blocks position intelligently: new blocks appear near the Spaceman, then spread outward
- Stale blocks (from previous turns) fade or are cleaned up

**Implementation surface:**

- Positioning logic: glass-server assigns positions based on block count and field dimensions (or uses a simple spiral/grid layout)
- Block lifecycle: glass-server manages block array — adds on emit, removes stale blocks after N turns
- No renderer change needed for basic functionality — existing `BlockManager.sync()` handles add/remove from bridge state

---

### W5: Bidirectional Conversation

**Status:** Complete
**Goal:** User messages typed in Glass reach the Claude Code agent, and agent responses appear in the field.

**Current state:**

- User text input writes to bridge `conversation[]` via `bridge:send-message` IPC
- ConversationLayer renders messages from bridge with role-based colors and age-based fade
- `glass_emit_turn` appends agent messages to conversation
- No mechanism connects Glass user input to the Claude Code session's stdin/prompt

**Phase 3 target:**

- Agent reads conversation from bridge (via `glass_session_resume`) to see user messages
- Agent responds via `glass_emit_turn` which appends to conversation and updates field
- Full cycle: user types in Glass -> bridge updates -> agent reads on next turn -> agent responds via glass_emit_turn -> bridge updates -> ConversationLayer renders

**Implementation surface:**

- The missing link is: how does the agent **know** the user typed something in Glass between turns?
  - Option A: Polling — agent periodically calls `glass_session_resume` to check for new user messages
  - Option B: Hook-driven — a `UserPromptSubmit` hook reads the bridge and injects recent Glass messages as context
  - Option C: The user copy-pastes or references their Glass message in the Claude Code prompt
- Option B is the cleanest: `user-prompt-submit.sh` reads `field-bridge.json`, extracts conversation entries newer than last check, injects as `additionalContext`

**Constraint:** Glass is not a terminal. It cannot send keystrokes to the Claude Code CLI. The connection is always mediated through the bridge file + hooks/MCP tools.

---

## Dependency Graph

```
W1 (session lifecycle)
 |
 +-- W2 (signals) — needs session to be active, needs turn boundaries
 |
 +-- W4 (blocks) — needs emit infrastructure from W1
 |
 +-- W5 (conversation) — needs session context, needs turn emission
 |
W3 (ceremony) — needs W2 signals to trigger, needs W1 session active
```

**Recommended order:** W1 -> W2 -> W5 -> W4 -> W3

W1 is foundational. W2 and W5 are high-impact and independent after W1. W4 is valuable but the agent can already push blocks manually. W3 is the capstone — ceremony only makes sense when signals and conversation are flowing.

## Non-Goals for Phase 3

- Glass does not replace the Claude Code CLI terminal
- Glass does not execute code or run commands
- Glass does not manage git operations
- Glass does not persist conversation history beyond the current session
- The renderer does not make decisions — it displays bridge state

## Success Criteria

Phase 3 is complete when:

1. Starting a Claude Code session in a Glass-profiled workspace automatically initializes the field
2. The field visibly responds to work intensity (more edits = brighter field, faster LFO)
3. Agent responses appear in the conversation layer without manual bridge edits
4. At least one ceremony cycle has fired from real conditions (N commits threshold met)
5. Code blocks from agent work appear in the field showing real file content

## Completion Acceptance Matrix

| Criterion                                                    | Workstream(s) | Evidence Surface                                                                                         | Status |
| ------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| Session auto-init and continuity in profiled workspace       | W1            | `glass-server` session tools + `src/main/index.ts` bridge update routing + main tests                    | Pass   |
| Signal-driven modulation reacts to real work intensity       | W2            | `src/renderer/field/ModulationEngine.ts`, `src/renderer/field/signal-heat.ts`, renderer tests            | Pass   |
| Bidirectional conversation loop (user -> agent -> field)     | W5            | `bridge:send-message` path, bridge conversation state, `ConversationLayer` tests, `glass_emit_turn` path | Pass   |
| Agent artifacts appear as concrete blocks in the field       | W4            | Block sync/render path (`BlockManager`, `CodeBlock`, `NoteBlock`, `AssetBlock`) + block tests            | Pass   |
| Ceremony progression/guardrails trigger from real conditions | W3            | Renderer ceremony integration tests + glass-server triadic/transition tests                              | Pass   |

See `PHASE3_SIGNOFF.md` for verification command records and closure packet.

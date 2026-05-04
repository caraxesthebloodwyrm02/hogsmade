# Glass — Design Document

A spatial development environment. Dark simulation field. Two presences. Conversation and code in the same rendered surface.

---

## What it is

Glass is an Electron app. It renders a dark canvas where a user and an agent co-exist, edit code cells, arrange blocks, and converse — inside the same surface. The field is not a wrapper around a chat interface. It IS the working environment.

The session opens. The field is dark. Two presences appear. Work begins.

---

## Architecture — 6 Components

### 1. Field

The rendered surface. Dark, terminal-like. Morphs and moves with shifting context.

- **Technology:** Electron + Chromium renderer process. Three.js or raw Canvas2D (decide at build time — Three.js if depth/parallax needed, Canvas2D if staying flat).
- **Background:** Near-black (`#0a0a0c`), not pure black. Subtle grain texture. No grid lines by default.
- **Camera:** Panning, no zoom in MVP. The field is larger than the viewport — content draws you through it.
- **Adaptive rendering:** Field density, light intensity, and motion speed respond to bridge file signals. Low signal = quiet field. Active session = subtle ambient motion.

### 2. Blocks

Editable code cells rendered as objects in the Field.

- **Technology:** Monaco Editor instances embedded in Electron renderer, positioned absolutely over the canvas.
- **Shape:** Rectangular, minimal border, dark fill with slight contrast against field. No chrome, no titlebars.
- **Interaction:** Click to focus, edit directly. Drag to reposition. Blocks persist position in session state.
- **Types:** `code`, `note`, `output`. Output blocks are read-only, fed by bridge file.
- **Spawn:** Agent or user can create blocks. Agent-spawned blocks appear with a brief fade-in from the agent's presence position.

### 3. Presences

Two entities in the field. Not avatars. Indicators of occupancy.

- **User presence:** A cursor-like point of light. Moves with mouse. Leaves a brief trail that fades.
- **Agent presence:** The Spaceman — a small, quiet logo mark. Warm against the dark field. Inspired by Novo Amor remix ambiance: present, still, organic. Not animated unless active. When the agent is writing to the bridge file, the Spaceman breathes — a slow, subtle pulse. When idle, completely still.
- **Spaceman design direction:** Simple geometric silhouette of a suited figure, soft warm fill (`#c8b89a` range), no hard outlines. Feels hand-drawn at small scale. Positioned in the upper-left quadrant of the field by default. Does not follow the user cursor.

### 4. State Bridge

The signal channel between the agent and the field.

- **Protocol:** File-based. Agent writes structured JSON to `~/.caraxes/field-bridge.json`. Glass watches this file with `fs.watch()`.
- **Schema:**
  ```json
  {
    "timestamp": "ISO8601",
    "session_id": "string",
    "agent_state": "idle | thinking | writing | reviewing | elevated",
    "blocks": [
      {
        "id": "string",
        "type": "code | note | output",
        "language": "typescript | python | bash | text",
        "content": "string",
        "position": { "x": number, "y": number },
        "origin": "user | agent"
      }
    ],
    "conversation": [
      {
        "role": "user | agent",
        "text": "string",
        "timestamp": "ISO8601"
      }
    ],
    "threshold_state": "ground | evaluating | elevated",
    "signals": {
      "git_diff_lines": number,
      "iteration_count": number,
      "session_age_minutes": number
    }
  }
  ```
- **Watch behavior:** On file change, Glass reads and diffs against previous state. Only re-renders what changed — blocks, agent_state, threshold_state.
- **Write side:** Agent (Claude Code session) writes to this file via a small helper: `~/.caraxes/bin/glass-bridge-write.sh` — a bash script that takes a JSON patch argument and merges it into the file atomically.

### 5. Threshold Engine

The /rift quality gate, rendered in the field.

- **Trigger:** When `threshold_state` transitions through ceremony states.
- **Ground state:** Normal field. Quiet ambient motion.
- **Evaluating state:** Field darkens slightly. Spaceman pulses once. A thin horizontal line appears across the field — the threshold line.
- **Floor Rising state (`floor_rising`):** Field begins to brighten from the bottom up — a slow floor-rise animation over ~2 seconds. The threshold line dissolves.
- **Elevated state (rift opens):** The Spaceman moves to center. Conversation layer expands to full height.
- **Voices Appearing state (`voices_appearing`):** Ceremony voices enter the field as colored orbs orbiting the Spaceman.
- **Voice Active states (`voice_1_active`, `voice_2_active`, `voice_3_active`):** The respective voice orb flares and pulses while its message renders in the conversation layer.
- **Returning state (`returning`):** The field settles. Orbs fade. Spaceman returns to the upper-left quadrant.
- **Denied state:** Field flashes once (subtle), threshold line persists briefly then fades. Spaceman returns to idle.

### 5.1 Voice System UX

The Voice System represents the Triadic Safeguard. Voices render as colored orbs orbiting the Spaceman when active.

- **Voice I (Velocity):** Amber. Represents autonomy.
- **Voice II (Guard):** Silver. Represents safety.
- **Voice III (Lens):** Gold. Represents correctness.
- The UI handles the orchestration of these voices visually via the `ThresholdState` machine, ensuring each voice receives focus during its turn.

### 6. Conversation Layer

The dialogue interface within the field.

- **Not a chat sidebar.** Text appears in the field directly — agent output renders as floating text near the Spaceman's position. User input is a single-line input at the bottom of the field, always visible.
- **Typography:** Monospace, small, high contrast against dark field. Agent text: warm white (`#f0ead8`). User text: cooler white (`#e8eef4`).
- **History:** Scrollable within the field. Older messages fade in opacity as they scroll up — the field has memory but doesn't hold everything at equal weight.

---

## File Structure

```
CascadeProjects/Applications/glass/
├── package.json
├── electron.vite.config.ts       # electron-vite config
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron main process
│   │   └── bridge-watcher.ts    # fs.watch on field-bridge.json
│   ├── renderer/
│   │   ├── index.html
│   │   ├── index.ts              # renderer entry
│   │   ├── field/
│   │   │   ├── Field.ts          # canvas render loop
│   │   │   ├── Presence.ts       # user + spaceman indicators
│   │   │   └── ThresholdLine.ts  # threshold animation
│   │   ├── blocks/
│   │   │   ├── BlockManager.ts   # create, position, destroy blocks
│   │   │   └── CodeBlock.ts      # Monaco wrapper
│   │   ├── conversation/
│   │   │   └── ConversationLayer.ts
│   │   └── state/
│   │       ├── FieldState.ts     # reactive state from bridge
│   │       └── SessionState.ts  # user-side session state
│   └── preload/
│       └── index.ts
├── assets/
│   └── spaceman.svg              # Spaceman logo mark
└── bridge/
    └── schema.ts                 # TypeScript types for bridge JSON
```

---

## Bridge Write Helper

`~/.caraxes/bin/glass-bridge-write.sh` — agent-side writer:

```bash
#!/usr/bin/env bash
# Usage: glass-bridge-write.sh '{"agent_state": "thinking"}'
BRIDGE_FILE="${GLASS_BRIDGE_PATH:-$HOME/.caraxes/field-bridge.json}"
PATCH="$1"
if [ -z "$PATCH" ]; then exit 1; fi
CURRENT=$(cat "$BRIDGE_FILE" 2>/dev/null || echo '{}')
MERGED=$(echo "$CURRENT $PATCH" | jq -s '.[0] * .[1] | .timestamp = now | todate')
echo "$MERGED" > "${BRIDGE_FILE}.tmp" && mv "${BRIDGE_FILE}.tmp" "$BRIDGE_FILE"
```

---

## Build Sequence

1. Scaffold Electron app with `electron-vite` (TypeScript template)
2. Prove Field renders — dark canvas, camera pan, two presence indicators
3. Add Monaco code block — one hardcoded block, editable
4. Wire bridge watcher — read `field-bridge.json`, update FieldState
5. Connect FieldState to Field render loop — agent_state drives Spaceman pulse
6. Conversation layer — floating text in field
7. Threshold Engine animations
8. Spaceman SVG asset — final design

---

## MVP Definition

**Done when:**

- Electron window opens to dark field
- User presence (cursor light trail) visible
- Spaceman logo visible, pulses when bridge file updates
- One code block spawnable, editable with Monaco
- Bridge file changes update field state in real time
- Conversation text renders in field near Spaceman

Everything else (threshold animations, block dragging, history fading) is post-MVP.

---

## Technology Decisions

| Concern      | Choice                                     | Reason                                                  |
| ------------ | ------------------------------------------ | ------------------------------------------------------- |
| App shell    | Electron                                   | Local file access, fs.watch, owns the window            |
| Build tool   | electron-vite                              | TypeScript out of box, fast HMR in renderer             |
| Canvas       | Canvas2D (MVP), Three.js (if depth needed) | Start flat, add depth only if the field needs it        |
| Code editor  | Monaco                                     | Already in VS Code, handles syntax, theming             |
| State        | Vanilla reactive (no framework)            | No virtual DOM needed — field is canvas, not components |
| Bridge       | File-based JSON + fs.watch                 | Maximum signal variation, agent writes freely           |
| Bridge write | jq + bash atomic write                     | Agent-side, zero new dependencies                       |

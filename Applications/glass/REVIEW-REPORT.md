# Glass — Focused Code Review

**Date:** 2026-05-05
**Branch:** arch/3d-semantic-assets
**Reviewer:** /s&pp systematic sweep (phased)
**Scope:** All 52 source files across main process, preload, renderer, bridge schema. 193 tests across 24 test files.

---

## Phase 1 — Code Quality

### TypeScript Strictness

**Medium — `asset?: any` in preload**
`src/preload/index.ts:21` — `addBlock` signature uses `asset?: any`. The asset object passes through contextBridge without a preload-level type check. Main process validates via `validateAssetMeta()`, so runtime risk is contained, but the type contract is broken at the preload boundary.

**Medium — `(window as any).glass` in Field.ts**
`src/renderer/field/Field.ts` — 8 call sites use `(window as any).glass?.methodName?.()`. The renderer entry `src/renderer/index.ts` correctly declares `global { interface Window { glass: {...} } }`, giving a typed `window.glass`. Field.ts bypasses this entirely. This is a type safety gap, not a runtime security issue (contextBridge isolation still holds), but it means the compiler cannot catch mismatched arguments or renamed methods.

**Low — explicit `any` in bridge-watcher**
`src/main/bridge-watcher.ts:179` — `.map((m: any) => ({...}))` in the conversation array. The surrounding array is already validated but the lambda parameter is untyped. Use `unknown` and narrow.

### Error Handling

**Medium — silent inventory read failure**
`src/main/index.ts:36-43` — `readInventoryAssets()` catches `ENOENT` silently but all other errors only `console.warn` and return `[]`. A corrupted `glass-inventory.json` will silently return no assets with no user-visible signal. Acceptable for local tooling, but a structured error event to the renderer would improve diagnostics.

**Low — IPC write errors swallowed in renderer**
`src/renderer/blocks/CodeBlock.ts` — Monaco blur handler calls `window.glass.patchBlock(id, content)` with no error handling. The IPC send is fire-and-forget; if main process rejects the write (e.g. block not found, content too long), the renderer has no feedback path. The block appears saved but isn't.

### IPC Boilerplate Repetition

**Low — 7× duplicated null-check pattern in main**
`src/main/index.ts:111–226` — Every `ipcMain.on` handler opens with:

```ts
if (typeof payload !== "object" || payload === null) { ... return; }
```

This exact pattern is repeated 7 times. See Phase 2 for consolidation opportunity.

### Test Coverage Gaps

The following modules have **no test file**:

| Module                                           | Risk                                          |
| ------------------------------------------------ | --------------------------------------------- |
| `src/renderer/field/ModulationEngine.ts`         | Core signal chain — envelope math is untested |
| `src/renderer/field/Camera.ts`                   | Easing logic — `tick(dt)` is untested         |
| `src/renderer/blocks/GlobalHeader.ts`            | UI — no DOM behaviour tests                   |
| `src/renderer/blocks/SimilarityPane.ts`          | Search + pane lifecycle — untested            |
| `src/renderer/blocks/InventoryMenu.ts`           | Asset rendering — untested                    |
| `src/renderer/blocks/BlockSpawnMenu.ts`          | Context menu — untested                       |
| `src/renderer/conversation/ConversationLayer.ts` | Message age/fade logic — untested             |
| `src/renderer/audio/AudioEngine.ts`              | Frequency map + gain — untested               |
| `src/renderer/field/Presence.ts`                 | Trail history, agent animation — untested     |

The main process and bridge-watcher have solid coverage. The renderer subsystems are essentially untested — 52 source files, 23 test files means roughly half the surface has no coverage.

---

## Phase 2 — Simplification & Consolidation

### Opportunity A — Bridge Write Helper (Extract)

**Files:** `src/main/bridge-watcher.ts:248–259`, `313`, `354`, `395`, `428`, `452`

The read-modify-write-atomically pattern is repeated 6 times:

```ts
const state = readBridgeFile();
// ...modify state...
const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.<tag>`;
fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
fs.renameSync(tmp, BRIDGE_PATH);
```

**Extract to:**

```ts
function withBridgeState(tag: string, mutate: (s: BridgeState) => void): void {
  const state = readBridgeFile();
  mutate(state);
  const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.${tag}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tmp, BRIDGE_PATH);
}
```

Estimated savings: ~40 lines. Eliminates 6 copy-paste surfaces for future bugs.

### Opportunity B — IPC Payload Guard (Extract)

**File:** `src/main/index.ts:111–226`

Extract a guard function:

```ts
function asObject(payload: unknown, channel: string): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] ${channel} rejected — payload is not an object`);
    return null;
  }
  return payload as Record<string, unknown>;
}
```

Reduces each handler's boilerplate from 5 lines to 2. Estimated savings: ~25 lines.

### Opportunity C — Block Interface (Consolidate)

**Files:** `src/renderer/blocks/CodeBlock.ts`, `AssetBlock.ts`, `NoteBlock.ts`

All three block types implement the same 6 methods with identical signatures:
`setPosition(x, y)`, `setContent(content)`, `dispose()`, `getGripElement()`, `updateOpacity(age, mod)`, `setThresholdState(state)`

No shared interface or abstract base exists — `Field.ts` uses a union type `CodeBlock | AssetBlock | NoteBlock`. Declaring a `BlockView` interface (or abstract base class) would:

- Surface any future method divergence at compile time
- Enable cleaner generic helpers in `Field.ts`
- Make adding a 4th block type safe by contract

### Opportunity D — DOM Style Helper (Extract)

**Files:** `src/renderer/blocks/GlobalHeader.ts`, `BlockSpawnMenu.ts`, `InventoryMenu.ts`, `SimilarityPane.ts`

All four UI modules apply dozens of inline CSS properties via `el.style.property = value` chains. A shared utility:

```ts
function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}
```

Would reduce visual noise significantly. These modules account for roughly 400 lines of style assignments. Not a correctness issue — a readability one.

### Opportunity E — Dual `camera.transform()` Per Frame (Minor)

**File:** `src/renderer/field/Field.ts:365`, `495`

`camera.transform()` is called twice per frame — once in `render()` for the canvas translate and once in `positionBlockHost()` for the CSS transform. Each call returns a new `{ tx, ty }` object. Store the result of the first call and pass it to `positionBlockHost()` as a parameter to avoid the second allocation and second method call.

---

## Phase 3 — Optimization (Subtle / Core)

Rules applied: no API changes, no infrastructure changes, internals only, non-breaking.

### O1 — `drawGrain`: Replace per-frame RNG with noise buffer

**File:** `src/renderer/field/Field.ts:382–391`
**Impact: Minor**

Current:

```ts
for (let i = 0; i < count; i++) {
  // 300–500 iterations/frame
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
}
```

`Math.random()` is called 600–1000 times per frame (2 calls per iteration). Pre-allocate a `Float32Array` noise buffer at construction time and cycle through it:

```ts
// In constructor:
private noiseBuffer = new Float32Array(2048).map(() => Math.random());
private noiseCursor = 0;

// In drawGrain:
for (let i = 0; i < count; i++) {
  ctx.fillRect(
    this.noiseBuffer[this.noiseCursor++ & 2047] * canvas.width,
    this.noiseBuffer[this.noiseCursor++ & 2047] * canvas.height,
    1, 1
  );
}
```

Eliminates 600–1000 RNG calls per frame. Buffer loops — grain pattern repeats every ~1 second at 60fps, imperceptible. Also removes the repeated `ctx.fillStyle = "#ffffff"` assignment (set once before the loop instead).

### O2 — Merge `updateBlockOpacities` + `updateBlockColorTemp` iterations

**File:** `src/renderer/field/Field.ts:480–491`
**Impact: Micro**

Two separate `for` loops iterate the same block collection per frame:

```ts
private updateBlockOpacities(levitationMod: number): void {
  for (const block of this.blockManager.getAll()) { ... }
}
private updateBlockColorTemp(state: ThresholdState): void {
  for (const cb of this.blockViews.values()) { ... }
}
```

These can be merged into one loop over `this.blockManager.getAll()` since `blockViews` is keyed by `block.id`. One traversal instead of two per frame.

### O3 — Cache `camera.transform()` result within frame

**File:** `src/renderer/field/Field.ts:338–379`
**Impact: Micro**

Covered in Phase 2 (Opportunity E). In render loop terms: one fewer object allocation per frame, one fewer method call.

### O4 — `ModulationEngine`: `stateAge` is tracked but never read

**File:** `src/renderer/field/ModulationEngine.ts:61`
**Impact: Info**

`this.stateAge += dt` accumulates on every tick but `stateAge` is never used in any output calculation. Either it's scaffolding for future ADSR release-phase work (worth a comment) or it's dead computation. If not needed, remove. If needed, document.

---

## Phase 4 — Structural Domain Review

### Current Domains

| Domain              | Status     | Key Files                                                            | Notes                              |
| ------------------- | ---------- | -------------------------------------------------------------------- | ---------------------------------- |
| Rendering pipeline  | Complete   | `Field.ts`, `ModulationEngine.ts`, `DiskEngine.ts`, `OvalStadium.ts` | Stable 60fps rAF loop              |
| Bridge/IPC          | Complete   | `bridge-watcher.ts`, `preload/index.ts`, `main/index.ts`             | Robust validation, atomic writes   |
| Block management    | Functional | `BlockManager.ts`, `CodeBlock.ts`, `AssetBlock.ts`, `NoteBlock.ts`   | No undo, no history                |
| Audio               | Functional | `AudioEngine.ts`                                                     | Single oscillator; minimal         |
| Spatial camera      | Partial    | `Camera.ts`                                                          | Pan only — no zoom                 |
| Semantic search     | Basic      | `local-search.ts`, `SimilarityPane.ts`                               | Text matching; not vector          |
| Session persistence | Minimal    | `SessionState.ts`                                                    | Camera offset in localStorage only |
| Ceremony machine    | Complete   | `ThresholdLine.ts`, `VoiceSequencer.ts`, `ModulationEngine.ts`       | 10-state machine                   |
| Asset/Inventory     | Functional | `InventoryMenu.ts`, `glass-inventory.json`                           | Read-only ledger; no DB            |

### Missing / Underdeveloped Domains

**1. Persistence / Database**

- **Gap:** All state lives in a single JSON file. Block content, positions, conversation, and inventory are flat. No query layer. As session length grows, the full bridge file is read and rewritten on every block drag event.
- **Unlock:** Block history, conversation search, session replay, usage analytics per workspace.
- **Fit:** `better-sqlite3` in the main process (Node-only). Bridge file remains as the real-time sync channel; SQLite becomes the historical record.
- **Effort:** Medium. Requires deciding what gets persisted vs. what stays ephemeral in the bridge.

**2. Undo / History**

- **Gap:** Zero. Every block position patch, content edit, and deletion is immediately committed with no rollback path.
- **Unlock:** Ctrl+Z to undo last block action; session replay from log.
- **Fit:** In-memory command stack in the main process (array of inverse operations). Fits inside `bridge-watcher.ts` or a new `history-manager.ts`. IPC channel `bridge:undo` would trigger pop.
- **Effort:** Medium. State shape is simple (positions + content strings); inverse operations are straightforward.

**3. Zoom**

- **Gap:** Camera supports pan only. No scale transform is ever applied to the canvas context. The spatial canvas cannot zoom in or out.
- **Unlock:** Deep spatial hierarchy — blocks can be far apart and still navigable; macro/micro views of the field.
- **Fit:** `Camera` gains a `scale` property; `Field.render()` adds `ctx.scale(scale, scale)` before other transforms; block DOM positions need to account for scale.
- **Effort:** Small for basic implementation. Medium when accounting for block DOM hit areas and position calculations throughout Field.ts.

**4. Collaboration / Real-time Sync**

- **Gap:** Single-user, local-only. Bridge file is self-contained JSON — well-suited to be the sync payload.
- **Unlock:** Shared sessions, agent+human simultaneous presence, remote pair.
- **Fit:** A WebSocket relay in main process (or a local network mDNS peer) broadcasting bridge state changes. The existing bridge:update → renderer pattern maps directly onto WebSocket push.
- **Effort:** Large. Requires conflict resolution strategy (last-write-wins is easy but lossy; CRDT is robust but complex).

**5. Observability / Structured Logging**

- **Gap:** All logging is `console.warn/error` with `[glass]` prefix. No structured format, no log persistence, no error aggregation. Diagnosing a production issue means reading raw stdout.
- **Unlock:** Session diagnostics, error replay, performance telemetry, ceremony transition audit trail.
- **Fit:** A lightweight structured logger in `src/main/` writing NDJSON to `~/.caraxes/glass.log`. Renderer errors would come via a new IPC channel `glass:error`.
- **Effort:** Small. Zero risk to existing behaviour.

**6. Block Versioning**

- **Gap:** Block content is overwritten in place on every Monaco blur. Edit history is gone.
- **Unlock:** Diff view, restore previous version, attribution ("agent wrote this").
- **Fit:** Requires either the SQLite domain (above) or a per-block shadow file in `~/.caraxes/blocks/<id>/history/`.
- **Effort:** Medium, and depends on Persistence domain being in place first.

**7. Vector Search**

- **Gap:** `local-search.ts` performs text substring matching over the bridge blocks and inventory. Results are keyword-ranked, not semantically ranked.
- **Unlock:** "Find blocks like this one", semantic neighbourhood, cross-session recall.
- **Fit:** Ollama already runs locally in the Mangrove ecosystem (`nomic-embed-text-v2-moe`). An embedding pipeline in main process using the Ollama HTTP API would not require new infrastructure.
- **Effort:** Medium. Embedding store needs a home (likely SQLite or a flat binary file alongside the bridge).

---

## Phase 5 — Security Scan

### Web Research Summary

**Sources consulted:**

- [Electron Security Docs (official)](https://www.electronjs.org/docs/latest/tutorial/security)
- [Breaking the App Shell — Five New Electron Vulnerabilities (2026)](https://securityonline.info/electron-security-vulnerabilities-sandbox-escape-context-isolation/)
- [CVE-2026-34780 — WebCodecs VideoFrame context isolation bypass](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34776/)
- [Bishop Fox — Design a Reasonably Secure Electron Framework](https://bishopfox.com/blog/reasonably-secure-electron)
- [Content-Security-Policy: script-src blob risks (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)

**Current threat landscape (2025–2026):**

- Electron RCE vulnerabilities rose ~25% in 2025, driven primarily by misconfigured IPC channels where renderers can invoke Node APIs indirectly.
- CVE-2026-34780 (CVSS 8.4): WebCodecs API `VideoFrame` objects can escape context isolation in Electron < 41.0.0-beta.8 / < 40.7.0 / < 39.8.0. Fixed in Electron 41.1.0.
- CVE-2026-34769 (CVSS 7.8): `commandLineSwitches` webPreference can inject renderer switches if untrusted config objects are spread — relevant only if `webPreferences` is dynamically constructed from external data.
- Current best practice: one-method-per-IPC-message, no raw `ipcRenderer` exposure, strict navigation guards, `connect-src 'none'` in CSP.

### Findings Against Glass Codebase

| #   | Surface                                                  | File                                           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Severity   |
| --- | -------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| S1  | Window flags                                             | `src/main/index.ts:64–71`                      | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false` — all correct. `app.enableSandbox()` also called at app level (belt-and-suspenders).                                                                                                                                                                                                                                                                    | **Info**   |
| S2  | Electron version                                         | `package.json`                                 | Electron 41.1.0 — patched past CVE-2026-34780 (fixed in 41.0.0-beta.8). CVE-2026-34769 not applicable (webPreferences not dynamically constructed).                                                                                                                                                                                                                                                                                                                                    | **Info**   |
| S3  | Navigation guard                                         | `src/main/index.ts:74–81`                      | `will-navigate` blocks non-file:// and non-localhost URLs. `setWindowOpenHandler(() => ({ action: "deny" }))` denies all popups. Correct and complete.                                                                                                                                                                                                                                                                                                                                 | **Info**   |
| S4  | CSP — `connect-src 'none'`                               | `src/main/index.ts:88`                         | No renderer-initiated network requests possible. Strong isolation against data exfiltration from a compromised renderer.                                                                                                                                                                                                                                                                                                                                                               | **Info**   |
| S5  | CSP — `script-src blob:`                                 | `src/main/index.ts:88`                         | `blob:` in script-src is required by Monaco Editor web workers. A compromised renderer could construct and execute a blob: URL with arbitrary script. This is a known Monaco/Electron trade-off. Mitigation: ensure Monaco is loaded from `'self'` only and the CSP `default-src 'self'` limits other blob: sources.                                                                                                                                                                   | **Medium** |
| S6  | CSP — `style-src 'unsafe-inline'`                        | `src/main/index.ts:88`                         | Inline styles are needed for the imperative DOM modules. In a local-only Electron app with contextIsolation, XSS via injected styles is low risk. No external content loads.                                                                                                                                                                                                                                                                                                           | **Low**    |
| S7  | Preload `asset?: any`                                    | `src/preload/index.ts:21`                      | The `asset` parameter in `addBlock` is typed `any`, bypassing preload-level type checking. Main process validates via `validateAssetMeta()`, so runtime exploitation requires compromising the renderer first. Nonetheless, preload should narrow this type.                                                                                                                                                                                                                           | **Low**    |
| S8  | `(window as any).glass` in renderer                      | `src/renderer/field/Field.ts` (8 sites)        | Bypasses the typed `window.glass` declaration in `index.ts`. contextBridge isolation still holds — the underlying object is sandboxed. This is a compile-time safety gap, not a runtime vulnerability.                                                                                                                                                                                                                                                                                 | **Low**    |
| S9  | No IPC rate limiting                                     | `src/main/index.ts:110–227`                    | No rate limit on any IPC channel. A compromised or malfunctioning renderer could emit rapid `bridge:patch-block-position` messages (one per drag event is correct; a loop could flood bridge writes). Each write is a synchronous `fs.writeFileSync` + `fs.renameSync` in the main process. At sustained high rate this would serialize the main thread.                                                                                                                               | **Low**    |
| S10 | Bridge origin enforcement                                | `src/main/bridge-watcher.ts:341`, `385`, `424` | `patchBridgeBlockPosition`, `patchBridgeBlock`, and `deleteBridgeBlock` all check `block.origin !== "user"` and reject agent-owned blocks from renderer-initiated edits. This is correct and intentional — agent blocks are read-only from the user's perspective.                                                                                                                                                                                                                     | **Info**   |
| S11 | `NoteBlock.renderMarkdown()` innerHTML                   | `src/renderer/blocks/NoteBlock.ts:254–287`     | Content is HTML-escaped first (`&`, `<`, `>`) then regex-constructed into safe tags. The approach is sound for user-typed content. However, agent-written note blocks (origin: "agent") pass through this same path — an agent could craft content that survives the escape+regex pass in unexpected ways. Not an immediate exploit (no script tag can survive the escape), but belt-and-suspenders DOMPurify before the `innerHTML` assignment would eliminate the category entirely. | **Low**    |
| S12 | Ceremony state not validated against active profile gate | `src/main/bridge-watcher.ts:442–458`           | `setBridgeThresholdState` validates that the state is a known `ThresholdState` string but does not check whether the requested transition is permitted by the active field profile's `rarityGate`. The ceremony dropdown in GlobalHeader can force-jump to `elevated` without earning it. Intentional for development but worth gating in a production profile.                                                                                                                        | **Low**    |

**No Critical or High findings.** The security posture of Glass is strong for a local-only developer tool.

---

## Summary

- **Strongest asset:** The bridge-watcher validation layer is thorough and consistent — clamp-based sanitisation, allowlist sets, atomic writes with correct file permissions. This is the security spine of the app and it is well-built.
- **Biggest type safety gap:** `(window as any).glass` in `Field.ts` bypasses the typed `window.glass` declaration. 8 call sites — easy to fix, high compiler safety yield.
- **Biggest test coverage gap:** All renderer subsystems (ModulationEngine, Camera, AudioEngine, Presence, ConversationLayer, UI modules) have no tests. ~40% of the source surface is untested.
- **Highest-value consolidation:** The bridge read-modify-write pattern is repeated 6 times. A `withBridgeState()` helper would centralise the most error-prone logic in the codebase.
- **Best quick optimisation:** `drawGrain` calls `Math.random()` 600–1000×/frame. A pre-seeded noise buffer eliminates this cleanly with no behaviour change.
- **Most impactful missing domain:** Undo/history. Immediate data loss on any mis-drag or accidental delete; no recovery path. This is the highest user-pain gap relative to implementation effort.
- **Security:** No Critical or High findings. Electron 41.1.0 is patched past the 2026 CVEs. The only actionable item is narrowing `asset?: any` in the preload and tightening the CSP `blob:` notes as Monaco usage evolves.

---

## What to Do Next

1. **Fix `(window as any).glass` in Field.ts** — `src/renderer/field/Field.ts` should import or reference the typed `window.glass` declaration from `src/renderer/index.ts`. 8 call sites. Zero behaviour change. Compiler catches future mismatches. _(30 minutes)_

2. **Extract `withBridgeState()` helper** — `src/main/bridge-watcher.ts`. Wrap the 6 repeated read-modify-write-atomically blocks. Reduces the main write path from ~240 lines to ~160 lines and creates one canonical place to add future concerns (rate limiting, logging). _(1 hour)_

3. **Declare `BlockView` interface** — `src/renderer/blocks/`. Define `setPosition`, `setContent`, `dispose`, `getGripElement`, `updateOpacity`, `setThresholdState` as a shared interface. Update `Field.ts` to use it. Compile-time safety for the block system. _(1 hour)_

4. **Noise buffer for `drawGrain`** — `src/renderer/field/Field.ts:382`. Pre-allocate `Float32Array(2048)` in the constructor. Eliminate 600–1000 `Math.random()` calls per frame. _(20 minutes)_

5. **Add `Camera.ts` and `ModulationEngine.ts` tests** — These are core signal-chain components with no tests. `Camera.tick(dt)` easing and `ModulationEngine.envelopeValue()` are the highest-value targets. _(2 hours)_

6. **Narrow `asset?: any` in preload** — `src/preload/index.ts:21`. Import `AssetMeta` from `bridge/schema` and type the parameter. Main process validates anyway but the preload should not be a typed hole. _(15 minutes)_

7. **Plan the undo stack** — Design decision required: command-based (inverse operations) vs. snapshot-based (full bridge state on each action). Given the bridge file is small JSON, snapshot-based is simplest. Store last N states in a `history: BridgeState[]` ring buffer in main process. IPC channel `bridge:undo`. _(Architecture: 30 minutes. Implementation: 3–4 hours)_

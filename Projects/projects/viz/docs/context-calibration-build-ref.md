# Context Calibration — Build Reference

> Technical document. Implementation details, data structures, architecture, math, and status tracking for continuing development.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Map](#file-map)
3. [Data Structures](#data-structures)
4. [Math Layer — Biquad Transfer Function](#math-layer)
5. [Dimension System](#dimension-system)
6. [Phase Metrics Engine](#phase-metrics-engine)
7. [Delay Correction Engine](#delay-correction-engine)
8. [Rendering Pipeline](#rendering-pipeline)
9. [Interaction Model](#interaction-model)
10. [Export/Import Schema](#exportimport-schema)
11. [Honest Assessment — What Holds, What Doesn't](#honest-assessment)
12. [Pending Work — Phaser + Batch Synthesis](#pending-work)
13. [Source Lineage](#source-lineage)

---

## Architecture Overview

```
context_calibration.html (single-file, ~1240 lines)
├── CSS (~375 lines)
│   └── Dark theme, hardware-knob aesthetic, responsive layout
├── HTML (~100 lines)
│   ├── cal-header — title + band/dimension badge
│   ├── spectrumWrap > spectrumCanvas — main visualization
│   ├── phase-strip — 4 aggregate metrics (Phase, Gap, Drift, Alignment)
│   ├── band-tabs — dynamic tab bar per band + add/remove
│   ├── knob-strip — Dimension selector + Gain/Q/Phase knobs + filter type
│   ├── delay-panel — correction recommendations
│   └── info-strip — hints + export/import buttons
├── JS (~760 lines)
│   ├── Canvas setup + hi-DPI scaling
│   ├── Dimension definitions (8 named discrete dimensions)
│   ├── EQ parameter constants + normalization functions
│   ├── Biquad coefficient calculation (Bristow-Johnson)
│   ├── Magnitude evaluation (frequency response)
│   ├── State management (bands[], activeBandIdx)
│   ├── Composite curve (sum all bands)
│   ├── Phase metrics calculation
│   ├── Delay correction generation
│   ├── Rendering (grid, dimensions, curves, handles, labels)
│   ├── UI sync (badge, phase strip, knobs, tabs, delay panel)
│   ├── Interaction (knob drag/scroll, spectrum click/drag, filter buttons)
│   └── Export/Import (JSON profile)
```

Design constraint: **single HTML file, zero dependencies, opens in any browser.**

---

## File Map

| File                                                   | Purpose                                    | Status                  |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------- |
| `projects/viz/context_calibration.html`                | Main tool — EQ + Phase + Delay calibration | Built, functional       |
| `projects/viz/parametric_eq.html`                      | Predecessor — single-band parametric EQ    | Built, standalone       |
| `projects/viz/angle_automation_phase_drift.html`       | LFO/orbit phase visualizer                 | Existing, not yet wired |
| `projects/viz/docs/context-calibration-study-guide.md` | Easy-difficulty study guide                | This session            |
| `projects/viz/docs/context-calibration-build-ref.md`   | This file                                  | This session            |
| `.claude/plans/replicated-herding-shore.md`            | Full design plan (approved)                | Reference               |

---

## Data Structures

### Band (per-measurement-point)

```js
{
  dimIdx: number,    // 0-7, index into DIMENSIONS[]
  gain: number,      // -24.0 to +24.0 (dB)
  q: number,         // 0.1 to 18.0 (bandwidth)
  phase: number,     // 0 to 360 (degrees)
  type: string,      // 'bell' | 'lowshelf' | 'highshelf' | 'notch'
  id: number         // auto-increment, for stable identity
}
```

### Dimension (fixed, 8 entries)

```js
{
  id: string,        // e.g. 'specificity'
  name: string,      // e.g. 'Specificity'
  color: string,     // hex color for visual identity
  desc: string       // human-readable description
}
```

### Phase Metrics (computed aggregate)

```js
{
  avgPhase: number,  // mean phase across all bands (degrees)
  gapCount: number,  // bands where |gain| > 3 dB
  drift: number,     // standard deviation of phase across bands (degrees)
  aligned: boolean   // true when avgPhase < 15 && drift < 10 && gapCount === 0
}
```

### Delay Correction (computed per-band)

```js
{
  dim: string,       // dimension name
  gain: number,      // band gain
  q: number,         // band Q
  phase: number,     // band phase
  type: string,      // band filter type
  severity: number,  // abs(gain) — used for sort order
  action: string,    // generated correction text
  color: string      // band display color
}
```

### Export Schema (JSON)

```json
{
  "version": 1,
  "timestamp": "ISO-8601",
  "bands": [{ "dimension": "constraints", "gain": 14.0, "q": 2.4, "phase": 62, "type": "bell" }],
  "metrics": { "avgPhase": 47, "gapCount": 3, "drift": 12, "aligned": false },
  "corrections": [
    { "dimension": "Constraints", "gain": 14.0, "q": 2.4, "phase": 62, "action": "..." }
  ]
}
```

---

## Math Layer

### Biquad Transfer Function (Bristow-Johnson Audio EQ Cookbook)

Four filter types implemented: Bell (peaking), Low Shelf, High Shelf, Notch.

**Coefficient calculation** — `calcBiquadCoeffs(freq, q, gainDb, type)`:

```
A = 10^(gainDb / 40)
w0 = 2π × freq / sampleRate
alpha = sin(w0) / (2 × Q)
```

Bell:

```
b0 = 1 + alpha×A     a0 = 1 + alpha/A
b1 = -2×cos(w0)      a1 = -2×cos(w0)
b2 = 1 - alpha×A     a2 = 1 - alpha/A
```

Normalized: divide all by a0.

**Magnitude evaluation** — `evalMagnitudeDb(coeffs, freq)`:

```
H(w) = (b0 + b1×e^(-jw) + b2×e^(-j2w)) / (1 + a1×e^(-jw) + a2×e^(-j2w))
|H(w)|² = (numRe² + numIm²) / (denRe² + denIm²)
dB = 10 × log10(|H(w)|²)
```

### Dimension-to-Frequency Mapping

Discrete dimensions mapped to pseudo-frequencies for biquad curve rendering:

```js
function dimToFreq(dimIdx) {
  const fMin = 80,
    fMax = 8000;
  return fMin * Math.pow(fMax / fMin, dimIdx / (DIM_COUNT - 1));
}
```

| dimIdx | Dimension   | Pseudo-freq (Hz) |
| ------ | ----------- | ---------------- |
| 0      | Specificity | 80               |
| 1      | Clarity     | 148              |
| 2      | Constraints | 274              |
| 3      | Domain      | 506              |
| 4      | Assumptions | 936              |
| 5      | Evidence    | 1,731            |
| 6      | Confidence  | 3,202            |
| 7      | Tension     | 8,000            |

**Note**: These frequencies are cosmetic — they exist so the biquad curves render smoothly between discrete dimension positions. The math is real (identical to `parametric_eq.html`), but the frequency values have no physical meaning in context calibration.

### Normalization Functions

| Function         | Domain      | Range       | Formula                                           |
| ---------------- | ----------- | ----------- | ------------------------------------------------- |
| `gainToNorm(g)`  | [-24, +24]  | [0, 1]      | `(g - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)`          |
| `normToGain(n)`  | [0, 1]      | [-24, +24]  | `GAIN_MIN + n * (GAIN_MAX - GAIN_MIN)`            |
| `qToNorm(q)`     | [0.1, 18.0] | [0, 1]      | `log(q / Q_MIN) / log(Q_MAX / Q_MIN)` (log-scale) |
| `normToQ(n)`     | [0, 1]      | [0.1, 18.0] | `Q_MIN * (Q_MAX / Q_MIN)^n`                       |
| `phaseToNorm(p)` | [0, 360]    | [0, 1]      | `p / 360` (linear)                                |
| `normToPhase(n)` | [0, 1]      | [0, 360]    | `n * 360`                                         |

---

## Dimension System

### Sources

| Dimension   | Source Module              | Original Metric                                        |
| ----------- | -------------------------- | ------------------------------------------------------ |
| Specificity | GRID `context_provider.py` | `sparsity` (inverted: high sparsity = low specificity) |
| Clarity     | GRID `context_provider.py` | `clarity` (0-1 scale)                                  |
| Constraints | Glimpse `confidence.js`    | `LOW_COVERAGE` gap type                                |
| Domain      | Prompt-specific            | No direct code source                                  |
| Assumptions | Glimpse `confidence.js`    | `WEAK_BASIS` gap type                                  |
| Evidence    | Glimpse `confidence.js`    | `CONFLICTING_EVIDENCE` gap type                        |
| Confidence  | GRID `context_provider.py` | `confidence` (0-1 scale)                               |
| Tension     | GRID `context_provider.py` | `attention_tension` (0-1 scale)                        |

### X-axis Layout

Evenly spaced across canvas with 60px padding on each side:

```js
function dimToX(dimIdx) {
  const pad = 60;
  const usable = dims.w - 2 * pad;
  return pad + (dimIdx / (DIM_COUNT - 1)) * usable;
}
```

### Y-axis (dB scale)

Linear mapping, +-24 dB range, 24px padding top and bottom:

```js
function dbToY(db) {
  const pad = 24;
  const usable = dims.h - 2 * pad;
  return pad + usable * (1 - (db - GAIN_MIN) / (GAIN_MAX - GAIN_MIN));
}
```

Grid markers at: -24, -18, -12, -6, 0, +6, +12, +18, +24 dB. The 0 dB line renders thicker with "ALIGNED" label.

---

## Phase Metrics Engine

### `calcPhaseMetrics()` — Aggregate computation

```
avgPhase = Σ(band.phase) / N
gapCount = count of bands where |gain| > 3 dB
drift = sqrt(Σ(band.phase - avgPhase)² / N)     // stddev of phase
aligned = avgPhase < 15° AND drift < 10° AND gapCount === 0
```

### Thresholds

| Metric           | Threshold       | Meaning                                  |
| ---------------- | --------------- | ---------------------------------------- |
| Gap              | \|gain\| > 3 dB | Significant distortion on this dimension |
| Alignment: phase | < 15° avg       | Directions mostly aligned                |
| Alignment: drift | < 10° stddev    | Consistent alignment across dimensions   |
| Alignment: gap   | 0 dimensions    | No significant distortions remaining     |

### Display

Phase strip shows: `Phase: Xdeg` / `Gap: N dim` / `Drift: Xdeg` / `Alignment: LOCKED|DRIFTING`

LOCKED = green (#00ff88). DRIFTING = red (#ff6b6b).

---

## Delay Correction Engine

### `calcDelayCorrections()` — Per-band recommendation generation

Decision tree:

```
For each band:
  IF gain > +3 dB (over-indexing):
    IF Q > 4: "Model over-assumes a specific point in {dim}. Add counter-statement."
    ELSE:     "Broad over-confidence in {dim}. Reduce emphasis or add qualifying context."

  IF gain < -3 dB (under-reading):
    IF Q > 4: "Narrow blind spot in {dim}. Add targeted example."
    ELSE:     "Wide gap in {dim}. Add foundational context."

  IF |gain| <= 3 dB: "{dim} within tolerance. No correction needed."

  THEN (phase overlay):
    IF phase > 90°: "Model interprets this dimension inversely. Reframe the prompt angle."
    IF 30° < phase <= 90°: "Partial misalignment. Clarify intent direction."
```

Results sorted by `severity = abs(gain)` descending — fix the worst distortions first.

### Known Limitation

The correction text is template-based. It describes the _type_ of problem (over-assuming vs blind spot, narrow vs wide, phase direction) but does not generate case-specific advice. This is the main area where the phaser mechanism would add value.

---

## Rendering Pipeline

### `draw()` — Full canvas redraw (called on every state change)

Render order (back to front):

1. Background fill (#1e1e24)
2. dB grid lines + labels (9 markers, 0 dB thicker)
3. Dimension zone lines + labels + color markers
4. Individual band curves (faded, active band brighter)
5. Composite curve (filled + stroked, purple #7b68ee)
6. Band handles (dot + optional glow + phase arc + label)
7. 0 dB "ALIGNED" label

### Curve Resolution

256 sample points per curve, logarithmically distributed across 80-8000 Hz range:

```js
for (let i = 0; i <= STEPS; i++) {
  const f = F_MIN * Math.pow(F_MAX / F_MIN, i / STEPS);
  // ...
}
```

### Composite Curve

```js
function compositeDb(freq) {
  let total = 0;
  for (const b of bands) {
    const f = dimToFreq(b.dimIdx);
    const coeffs = calcBiquadCoeffs(f, b.q, b.gain, b.type);
    total += evalMagnitudeDb(coeffs, freq);
  }
  return total;
}
```

Each band's response is calculated independently and summed (dB addition). This is mathematically correct for cascaded biquad filters.

### Band Handle Rendering

Each handle shows:

- Colored dot (4px inactive, 6px active)
- Radial glow (active only, 16px radius)
- Phase arc indicator (when phase > 5deg, arc from -90deg proportional to phase angle)
- Active label: `{DimName}  {+/-gain}dB  Q{q}  {phase}deg`

### Hi-DPI Scaling

```js
function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height };
}
```

Canvas pixel buffer scaled by DPR, CSS transform applied so coordinates remain in CSS pixels.

---

## Interaction Model

### Knobs (Gain, Q, Phase)

- **Drag**: mousedown records `dragStartY` + current normalized value. mousemove computes `dy * 0.005` delta.
- **Scroll**: `deltaY * 0.001` applied to normalized value.
- Range clamped to [0, 1] normalized, then mapped through normalization functions.

### Spectrum (Canvas)

- **Click near existing handle** (within 20px): selects that band.
- **Click elsewhere**: creates new band at nearest dimension, becomes active.
- **Drag vertically**: adjusts active band gain (Y position mapped to gain).
- **Scroll over spectrum**: adjusts active band Q.

### Band Tabs

- Click tab: selects corresponding band.
- `+ Add Band`: adds new band at first unused dimension.
- `Remove`: removes active band.

### Filter Type Buttons

Bell / Lo Sh / Hi Sh / Notch — sets `band.type`, triggers full refresh.

### Dimension Selector

Dropdown `<select>` with all 8 dimensions. Changes active band's `dimIdx`.

---

## Export/Import Schema

### Export

On "Export JSON" click:

- Builds object with `version`, `timestamp`, `bands[]`, `metrics`, `corrections[]`
- Bands store dimension by `id` string (not index) for portability
- Gains rounded to 1 decimal, Q to 2 decimals, phase to integer
- Creates Blob → ObjectURL → auto-downloads as `context-calibration-YYYY-MM-DD.json`

### Import

On "Import" click → hidden `<input type="file">`:

- Parses JSON, validates `data.bands` is array
- Maps `dimension` id strings back to `dimIdx` via `DIMENSIONS.findIndex()`
- Rebuilds `bands[]` with fresh `id` counters
- Defaults: `gain: 0, q: 1, phase: 0, type: 'bell'` for missing fields

---

## Honest Assessment

### Holds well (reliable foundation)

| Component                      | Why it holds                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| EQ spectrum + named dimensions | Clean mapping: dimensions as discrete positions, gain as severity, composite as full profile |
| Biquad math                    | Real math, not approximation. Identical to parametric_eq.html which renders correctly        |
| Multi-band system              | Add/select/remove works. Each band is independent. Composite sums correctly                  |
| Visual design                  | Modeled after FabFilter Pro-Q / Ableton EQ Eight — professional audio tool aesthetic         |
| Export/Import                  | Round-trips cleanly. Profiles are portable and diffable                                      |

### Partially holds (useful but imperfect)

| Component                        | Issue                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase knob                       | Manual user judgment, no measurement backing. You set it because it "feels" ~90deg off.                                                                                                       |
| Q (bandwidth)                    | On 8 discrete positions, bandwidth doesn't mean much. A Q of 2.4 on "Constraints" bleeds into adjacent dimensions visually, but that adjacency is arbitrary (left = Clarity, right = Domain). |
| Biquad curves between dimensions | The smooth curves between discrete dimension positions are cosmetic. The math is real, but there's nothing between "Clarity" and "Constraints" to measure.                                    |

### Doesn't hold (needs replacement or removal)

| Component               | Issue                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delay correction text   | Template-based output. `"Broad over-confidence in clarity. Reduce emphasis..."` — same text regardless of case. No analysis of _what_ the model actually said.          |
| Phase as circular 0-360 | Phase in audio is periodic (360deg = 0deg). In context calibration, intent displacement doesn't wrap around. A linear scale (0-100% misalignment) would be more honest. |

### Quantified: ~40% functional diagnostic, ~40% structured reflection exercise, ~20% aesthetic

---

## Pending Work — Phaser + Batch Synthesis

### Phaser Mechanism (not yet implemented)

From user specification: "the tool should use phasing in multiple turns to patch one area at a time, create a batch of patches and synthesize the batch into one coherently polished patch."

**Proposed flow:**

```
1. User marks distortions on spectrum (already built)
2. Phaser isolates the highest-severity band
3. For that band: generate targeted correction specification
4. User applies correction to prompt, tests against model
5. Re-measure that dimension — new calibration pass
6. Repeat for next-highest severity band
7. After all bands patched individually:
   → Batch synthesis: merge all per-band corrections into one coherent set
   → User applies synthesized corrections to original prompt
8. Final measurement pass: full spectrum re-calibration
```

### Source for phaser visuals

`angle_automation_phase_drift.html` contains:

- Phase accumulator logic
- Angular displacement calculation
- LFO orbit visualization
- Snap detection (quantized vs free-floating)
- Quadrant decomposition

These can provide the visual language for phase iteration tracking.

### Batch Synthesis (not yet designed)

The synthesis step merges per-band corrections. Open questions:

- How to handle conflicting corrections (adding specificity may reduce constraints flexibility)?
- Priority: severity-ordered or dependency-ordered?
- What does the "synthesized patch" artifact look like? Structured JSON? Prose document? Annotated prompt?

---

## Source Lineage

### Code ancestry

```
parametric_eq.html
├── Biquad math (calcBiquadCoeffs, evalMagnitudeDb)
├── Canvas rendering (grid, curves, hi-DPI)
├── Knob interaction (drag, scroll, normalization)
└── Filter type system (bell, lowshelf, highshelf, notch)
     │
     ▼
context_calibration.html
├── Multi-band system (bands[], activeBandIdx, compositeDb)
├── Named discrete dimensions (8 zones replacing continuous freq)
├── Phase metrics engine (avgPhase, gapCount, drift, alignment)
├── Delay correction engine (template-based recommendations)
├── Band management UI (tabs, add/remove)
└── Export/Import (JSON profile)
```

### Research inputs

| Source                                       | What it contributed                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| FabFilter Pro-Q 3                            | Visual language: spectrum + draggable handles + per-band curves               |
| Ableton EQ Eight                             | Minimalist 8-band approach, clean UI                                          |
| REW (Room EQ Wizard) docs                    | 7-step room calibration process → directly mapped to context calibration      |
| Sound On Sound (phase article)               | Complete phase theory: 0deg-180deg displacement, cancellation, comb filtering |
| LANDR (phase article)                        | Pre-ringing, transient smearing from out-of-phase signals                     |
| GRID ContextProvider (`context_provider.py`) | Dimension definitions: sparsity, clarity, confidence, attention_tension       |
| Glimpse Engine (`confidence.js`)             | Gap types: MISSING_DIMENSION, LOW_COVERAGE, CONFLICTING_EVIDENCE, WEAK_BASIS  |
| Robert Bristow-Johnson Audio EQ Cookbook     | Biquad filter coefficient formulas (all 4 types)                              |

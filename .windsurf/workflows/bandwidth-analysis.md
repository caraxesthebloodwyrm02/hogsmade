---
description: Bandwidth analysis — isolate low-ratio sweeps, render spectrum equalizer, execute concluding session sweep
---

# Bandwidth Analysis

Post-LUMOS routine that isolates remaining low-ratio entities, visualizes the ecosystem spectrum
as an equalizer, and runs a concluding sweep to finalize the session state.

**Prerequisite**: Run `/lumos` first (at minimum Fast Lane + Phases 1–3).

---

## When to Use

- After a LUMOS WATCH or ACT verdict, to zoom into the low-PATH entities
- End-of-session wrap-up when uncommitted drift or audit failures need triage
- Any time you want a frequency-domain view of ecosystem activity vs. health

---

## Phase A — Isolate Low-Ratio Sweeps

Collect all entities below the CLEAR tier (PATH < 65) from the most recent LUMOS run.

// turbo
1. Gather the 4 low-ratio signals in parallel:

```
Call in parallel:
  - mcp2_query_audit(status: "failure", limit: 30, since: <24h-ago-ISO>)
  - mcp3_list_active_cycles()
  - mcp16_ecosystem_scan(saveSnapshot: false)
  - mcp2_enforcement_status()
```

2. From the results, isolate entities with PATH < 65 and classify their dominant drag:

```
For each low-ratio entity:
  - Identify PRIMARY DRAG: drift | fail | trust | health | momentum
  - Identify ROOT CAUSE from audit metadata
  - Classify REMEDIATION: commit-sweep | API-fix | cycle-advance | structural
```

---

## Phase B — Render Equalizer Interface

**Interactive visualizers** in `Applications/bandwidth-equalizer/`:
- `index.html` — basic bar equalizer (v1)
- `parametric.html` — full parametric spectrum analyzer with HPF/LPF, sweep, bench, boost (v2)

Serve with `python3 -m http.server 8089` from that directory, then open:
- Basic: `http://localhost:8089`
- Parametric: `http://localhost:8089/parametric.html`

Render a text-based spectrum equalizer. Each "band" is an entity. The visualization shows:

- **Bar height** = PATH score (0–100 scale)
- **Spike markers** = audit failures in the 24h window
- **Band width** = issue scope (narrow = single cause, wide = multi-signal)

### Equalizer Layout

```
PATH
100 |
 95 |
 90 | ██
 85 | ██ ██          ██
 80 | ██ ██    ▓▓ ▓▓ ██
 75 | ██ ██    ▓▓ ▓▓ ██ ▓▓
 70 | ██ ██    ▓▓ ▓▓ ██ ▓▓
 65 |─██─██────▓▓─▓▓─██─▓▓──── CLEAR threshold
 60 |
 55 |                      ░░ ░░
 50 |                      ░░ ░░
 45 |                            ▒▒
 40 |                            ▒▒ ▒▒
 35 |                               ▒▒
     ─────────────────────────────────────
      AF  EC  Vi  Ap  GE  SS  HG  GR  EL  GS
      ██=CLEAR  ▓▓=CLEAR-low  ░░=WATCH  ▒▒=ACT

SPIKE OVERLAY (audit failures in 24h):
      AF  EC  Vi  Ap  GE  SS  HG  GR  EL  GS
       ·   ·   ·   ·   ·   ·   ·   ·  ×7  ×4
                                       ^^  ^^
                                    fetch + candidateCount=0
```

### Band Legend

| Band | Entity | PATH | Width | Spikes | Dominant Drag |
|------|--------|------|-------|--------|---------------|
| AF | afloat | 88.5 | narrow | 0 | — |
| EC | echoes | 83.5 | narrow | 0 | — |
| Vi | Vision | 76.3 | narrow | 0 | health (no git) |
| Ap | apiguard | 74.3 | narrow | 0 | health (no git) |
| GE | glimpse-engine | 78.8 | narrow | 0 | drift (10 uc) |
| SS | seeds-server | 72.8 | narrow | 0 | trust (0.50) |
| HG | hogsmade | 55.0 | wide | 0 | drift saturated (46 uc) |
| GR | GRID | 54.5 | wide | 0 | drift saturated (47 uc) + low trust |
| EL | eligibility-server | 49.9 | wide | 7 | fail + drift + stalled momentum |
| GS | grid-server | 41.4 | wide | 4 | 57% fail rate + drift + low trust |

### Frequency Spike Detail

| Entity | Failures | Tools Hit | Root Cause |
|--------|----------|-----------|------------|
| eligibility-server | 7 | explain_hierarchy, evaluate_candidate, collect_table, check_the_line | `candidateCount: 0` — no fixture or inline candidate provided |
| grid-server | 4 | admission_bannered_entities, admission_stats | `TypeError: fetch failed` — GRID API at localhost:8080 unreachable |

### Bandwidth Classification

| Category | Entities | Bandwidth | Signal |
|----------|----------|-----------|--------|
| **Flat spectrum** (CLEAR, no spikes) | afloat, echoes, glimpse-engine, seeds-server | Narrow, stable | Reference baseline |
| **Low-health plateau** (CLEAR, structural) | Vision, apiguard | Narrow, static | No git repos — cosmetic drag only |
| **Drift-saturated** (WATCH) | hogsmade, GRID | Wide, no spikes | 93 uncommitted files total — commit sweep clears both |
| **Spike + drift** (ACT) | eligibility-server, grid-server | Wide, active spikes | Audit failures + saturated drift — needs targeted fix |

---

## Phase C — Concluding Full Sweep Execution

A focused, single-pass routine that resolves remaining low-ratio items and closes the session.

### Step 1: Drift Sweep (WATCH → CLEAR)

For hogsmade and GRID — the two drift-saturated entities:

```bash
# Check what's uncommitted in hogsmade (CascadeProjects monorepo)
cd /home/caraxes/CascadeProjects && git status --short | head -20

# Check what's uncommitted in GRID
cd /home/caraxes/CascadeProjects/Projects/GRID-main && git status --short | head -20
```

Decision point: batch-commit or defer.

- If changes are intentional work-in-progress → defer, accept WATCH tier
- If changes are session artifacts → stage and commit with conventional format

### Step 2: Spike Resolution (ACT → WATCH)

**grid-server (4 failures — fetch failed)**:
- Root cause: GRID API at `localhost:8080` not running
- Fix: start GRID API server, or accept the failures as expected when API is down
- Verify: `mcp9_health_check()` after API start

**eligibility-server (7 failures — candidateCount: 0)**:
- Root cause: tools called without fixture or inline candidate
- Fix: these are likely test/exploration artifacts, not bugs
- Verify: `mcp3_check_the_line()` should remain clean

### Step 3: Evolution Cycle Check

The stalled evolution cycle `cycle-15bb439a` (Precedent Lifecycle Full-Cycle Validation):

```
Beat rail: map ✓ → balance [current] → tighten → verify
Momentum: 0.125 (low)
Drift: 0.117
Score: 0.486
Stalled since: 2026-01-01
```

Key blocker: `admit-integration` property at 0.40 (admission gate fetch failures).
This resolves when GRID API is running — same root cause as grid-server spikes.

Decision point:
- If GRID API will be started → record integration_call_succeeded signal, advance to tighten
- If GRID API stays down → leave at balance, accept current state

### Step 4: Session Finalize

// turbo
After resolving what you chose to fix, run the 3-call finalize batch:

```
Call in parallel:
  - mcp16_ecosystem_scan(saveSnapshot: true)   # persist the new state
  - mcp3_check_the_line()                       # confirm line is still clean
  - mcp2_enforcement_status()                   # confirm no new escalations
```

Then journal the session:

```
mcp15_journal_add({
  entry: "Bandwidth analysis complete. <N> items resolved, <M> deferred.",
  tags: ["bandwidth-analysis", "lumos", "session-close"],
  mood: "focused"
})
```

### Step 5: Verdict

Re-apply the looking-glass verdict from the 3 finalize signals:

```
CLEAR  → session clean, safe to close
WATCH  → known items deferred, documented
ACT    → items remain — carry forward to next session
```

---

## Reference: PATH Formula

```
PATH = 100 × [ (health/100 × 0.30)
              + (trust       × 0.25)
              + ((1 − drift)  × 0.20)
              + ((1 − fail)   × 0.15)
              + (momentum     × 0.10) ]
```

| Signal | Weight | Source | Normalization |
|--------|--------|--------|---------------|
| health | 0.30 | ecosystem_scan healthScore | 0–100 → /100 |
| trust | 0.25 | checkpoint cluster confidence | 0.0–1.0 |
| drift | 0.20 | uncommitted / 30, capped 1.0, inverted | 1 − drift |
| fail | 0.15 | failures / events in 24h window, inverted | 1 − fail |
| momentum | 0.10 | evolution cycle momentum, default 0.5 | 0.0–1.0 |

| Tier | PATH Range | Action |
|------|------------|--------|
| CLEAR | 65–100 | Reference baseline |
| WATCH | 50–64 | Monitor, batch-fix if convenient |
| ACT | 35–49 | Fix this session |
| URGENT | 0–34 | Stop everything, fix immediately |

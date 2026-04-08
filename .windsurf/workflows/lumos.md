---
description: Guided architectural illumination — probe, quantify, sort, and execute ecosystem PATHs ranked by composite signal weight
---

Run via `/lumos` for a full-light map of ecosystem state with ranked action paths and guided execution. PATH is a composite of health, trust, drift, failure rate, and momentum — sorted highest-priority first.

Dependency: `/startup` should be run first if GRID API or Ollama are down.

---

## Overview — LUMOS Pipeline

```
 FAST LANE (3 calls) ──→ verdict ──→ CLEAR? stop
                                  ──→ WATCH? phases 1–3 only
                                  ──→ ACT/URGENT? full pipeline ↓

 PROBE → QUANTIFY → SORT → GUIDE → EXECUTE → EVOLVE
  (1)      (2)       (3)    (4)      (5)       (6)
```

- **Fast Lane** — 3-call looking-glass check → go/no-go verdict in seconds
- **Phase 1–3** — Read-only: probe, score, rank (safe to run anytime)
- **Phase 4–6** — Write path: guided sweeps, commits, evolution advancement

---

## Fast Lane — glimpse-revise-looking-glass-check

A concise 3-call batch that returns a go/no-go verdict in seconds. Run this instead of the full pipeline when you need a quick mirror check without committing to all 6 phases.

**When to use**: Session start, mid-session sanity check, or pre-commit validation.

// turbo
1. Run the looking-glass batch — 3 parallel calls:

```
Call in parallel:
  - mcp3_check_the_line()
  - mcp16_ecosystem_scan(saveSnapshot: false)
  - mcp2_enforcement_status()
```

2. Read the three signals and apply the looking-glass verdict:

```
LOOKING-GLASS VERDICT:

  LINE     = check_the_line.clean (true/false)
  HEALTH   = ecosystem_scan.summary.overallScore (0–100)
  ENFORCE  = enforcement_status.status ("normal" / escalated)

  ┌──────────────────────────────────────────────────────────┐
  │ FAST CLEAR  — LINE clean + HEALTH ≥ 70 + ENFORCE normal │
  │   → Skip full pipeline. Safe to work.                   │
  │                                                         │
  │ FAST WATCH  — Any ONE signal degraded                   │
  │   → Run Phase 1–3 only (PROBE → QUANTIFY → SORT).      │
  │   → Review the ranked table, defer sweeps if stable.    │
  │                                                         │
  │ FAST ACT    — TWO or more signals degraded              │
  │   → Run full pipeline (all 6 phases).                   │
  │                                                         │
  │ FAST URGENT — LINE broken OR ENFORCE has blocked/       │
  │               restricted precedents                     │
  │   → Run hold_the_line() immediately, then full pipeline.│
  └──────────────────────────────────────────────────────────┘
```

**Example — Fast Clear (skip full pipeline)**:
```
  check_the_line → clean: true, 0 errors, 0 warnings
  ecosystem_scan → overallScore: 82, 0 issues
  enforcement    → status: normal, 0 escalated

  Verdict: FAST CLEAR — safe to work, no pipeline needed.
```

**Example — Fast Act (run full pipeline)**:
```
  check_the_line → clean: false, 2 errors
  ecosystem_scan → overallScore: 68
  enforcement    → status: normal

  Verdict: FAST ACT — line broken + health below 70.
  → Run hold_the_line(), then full LUMOS pipeline.
```

**Example — Fast Watch (probe only)**:
```
  check_the_line → clean: true
  ecosystem_scan → overallScore: 65
  enforcement    → status: normal

  Verdict: FAST WATCH — health dipped below 70.
  → Run Phases 1–3 to get ranked PATH table, then decide.
```

---

## Phase 1 — PROBE (read-only signal collection)

All calls are read-only with no side effects. Run in parallel.

// turbo
1. Run the parallel signal sweep — call all six tools simultaneously:

| Tool | Source Server | Signal Collected |
|------|---------------|------------------|
| `mcp13_checkpoint(depth: "deep")` | overview | Cluster health, trust scores, drift items |
| `mcp16_ecosystem_scan(saveSnapshot: true)` | seeds | Repo health, uncommitted counts, branch state |
| `mcp3_check_the_line()` | eligibility | Structural findings: barrel gaps, orphaned exports, import drift |
| `mcp3_list_active_cycles()` | eligibility | Evolution beat position, momentum, drift |
| `mcp2_enforcement_status()` | echoes | Precedent escalation levels, active counts |
| `mcp2_audit_stats()` | echoes | Failure rates, event counts by tool and source |

**Output**: Six signal sets that feed into the QUANTIFY formula.

---

## Phase 2 — QUANTIFY (compute PATH scores)

Each entity gets a **PATH score** (0–100) from five weighted signals. All inputs are normalized to 0–1 before weighting, then scaled to 0–100.

```
PATH = 100 × [ (health/100 × 0.30)
              + (trust       × 0.25)
              + ((1 - drift)  × 0.20)
              + ((1 - fail)   × 0.15)
              + (momentum     × 0.10) ]
```

| Signal    | Weight | Source                             | Raw → Normalized                  |
|-----------|--------|------------------------------------|-----------------------------------|
| health    | 0.30   | `ecosystem_scan` healthScore       | 0–100 → divide by 100             |
| trust     | 0.25   | `checkpoint` trust.confidence      | already 0.0–1.0                   |
| drift     | 0.20   | uncommitted file count / 30        | capped at 1.0; inverted (1−drift) |
| fail      | 0.15   | audit failures / total events      | already 0.0–1.0; inverted (1−fail)|
| momentum  | 0.10   | evolution cycle momentum           | 0.0–1.0; default 0.5 if no cycle  |

2. Apply the formula to each entity from Phase 1 data. For entities without a direct evolution cycle, use momentum = 0.5 (neutral). Group by cluster and average for cluster-level PATH.

**Reference scoring** (GRUFF baseline 2026-04-06):

| Rank | Entity             | Health | Trust | Drift | Fail  | Mom  | **PATH** | Tier   |
|------|--------------------|--------|-------|-------|-------|------|----------|--------|
|  1   | afloat             | 0.95   | 0.80  | 0.00  | 0.00  | 0.50 | **73.5** | CLEAR  |
|  2   | echoes             | 0.85   | 0.80  | 0.10  | 0.00  | 0.50 | **69.5** | CLEAR  |
|  3   | seeds-server       | 0.90   | 0.50  | 0.00  | 0.00  | 0.50 | **67.0** | CLEAR  |
|  4   | GRID               | 0.90   | 0.40  | 0.17  | 0.00  | 0.50 | **63.6** | WATCH  |
|  5   | glimpse-engine     | 0.85   | 0.80  | 0.33  | 0.00  | 0.50 | **64.9** | WATCH  |
|  6   | eligibility-server | 0.80   | 0.50  | 0.00  | 0.18  | 0.13 | **57.9** | WATCH  |
|  7   | apiguard           | 0.50   | 0.40  | 0.00  | 0.00  | 0.50 | **50.0** | WATCH  |
|  8   | Vision             | 0.50   | 0.40  | 0.00  | 0.00  | 0.50 | **50.0** | WATCH  |
|  9   | hogsmade           | 0.70   | 0.50  | 0.90  | 0.00  | 0.50 | **50.5** | WATCH  |
| 10   | grid-server        | 0.75   | 0.40  | 0.00  | 0.67  | 0.50 | **47.5** | ACT    |

---

## Phase 3 — SORT (rank and tier-assign)

| Tier       | PATH Range | Action Required                      |
|------------|------------|--------------------------------------|
| **CLEAR**  | 65–100     | None — reference baseline             |
| **WATCH**  | 50–64      | Monitor; batch-fix if convenient     |
| **ACT**    | 35–49      | Fix this session before continuing   |
| **URGENT** | 0–34       | Stop everything; fix immediately     |

3. Sort entities descending by PATH and assign tiers. Print the ranked table for the session.

**Baseline ranking** (2026-04-06):

| Rank | Entity             | PATH  | Tier    | Dominant Signal                  |
|------|--------------------|-------|---------|----------------------------------|
|  1   | afloat             | 73.5  | CLEAR   | High trust (0.80), zero drift    |
|  2   | echoes             | 69.5  | CLEAR   | Stable, 3 uncommitted only       |
|  3   | seeds-server       | 67.0  | CLEAR   | Zero audit failures              |
|  4   | glimpse-engine     | 64.9  | WATCH   | Drift: 10 uncommitted files      |
|  5   | GRID               | 63.6  | WATCH   | Low trust (0.40) despite 90 hp   |
|  6   | eligibility-server | 57.9  | WATCH   | 18% audit failure rate           |
|  7   | hogsmade           | 50.5  | WATCH   | 27 uncommitted (0.90 drift)      |
|  8   | apiguard           | 50.0  | WATCH   | No git repo — 50 health floor    |
|  9   | Vision             | 50.0  | WATCH   | No git repo — 50 health floor    |
| 10   | grid-server        | 47.5  | **ACT** | 67% audit failure rate           |

---

## Phase 4 — GUIDE (execution strategy per tier)

Sweeps are ordered by dependency. Grid-server must be fixed before evolution can advance. Structural line must be clean before commits.

---

### 4.1 — URGENT Tier Protocol (PATH < 35)

If any entity drops below 35, halt all other work:

```
URGENT PROTOCOL:
  1. mcp3_hold_the_line()        → auto-fix structural breaks
  2. mcp2_query_precedents(level: "blocked") → check enforcement blocks
  3. Fix root cause
  4. mcp3_check_the_line()       → confirm line is clean
  5. Resume normal sweep
```

**Example** — grid-server drops to 25 (admission gate cascade failure):
```bash
# Step 1: Start GRID API (dependency for grid-server)
cd /home/caraxes/CascadeProjects/Projects/GRID-main
GRID_API_URL=http://localhost:8080 nohup uv run python -m application.mothership.main > /tmp/grid-mothership.log 2>&1 &
sleep 5 && curl -s --max-time 5 http://localhost:8080/health
```
```
# Step 2: Verify
mcp9_health_check()              → should show "healthy"
mcp9_admission_stats()           → should return data (not fetch error)
```
```
# Step 3: Re-score — failure rate drops from 0.67 → ~0.10, PATH rises to ~60+
```

---

### 4.2 — ACT Tier Sweeps (PATH 35–49)

Currently 1 entity: **grid-server (47.5)**

#### Sweep A: grid-server — Resolve admission gate failures

**Root cause**: `GRID_API_URL` not set → `admission_*` tools return fetch errors → 67% failure rate.

**Dependency**: Requires GRID mothership on localhost:8080. Run `/startup` Area 4 if down.

```
SWEEP A — grid-server (requires user approval for server start)

  Step 1 — Check if GRID API is already running:
```
```bash
curl -s --max-time 3 http://localhost:8080/health || echo "DOWN — need /startup Area 4"
```
```
  Step 2 — If DOWN, start mothership:
```
```bash
cd /home/caraxes/CascadeProjects/Projects/GRID-main
GRID_API_URL=http://localhost:8080 nohup uv run python -m application.mothership.main > /tmp/grid-mothership.log 2>&1 &
sleep 5 && tail -5 /tmp/grid-mothership.log
```
```
  Step 3 — Verify grid-server reconnects:
    mcp9_health_check()
    mcp9_admission_stats()          → rejection counts should appear

  Step 4 — Confirm audit failures stop accumulating:
    mcp2_audit_stats()              → grid-server failure count should freeze

  Gate: PATH should rise from 47.5 → ~62+ (fail drops from 0.67 → <0.10)
```

---

### 4.3 — WATCH Tier Sweeps (PATH 50–64)

These are stable. Execute in batch if time permits, or defer to next session.

#### Sweep B: hogsmade — Commit 27 uncommitted changes

**Root cause**: Accumulated work across MCP servers, components, workflows, and config.

```
SWEEP B — hogsmade drift reduction
```
// turbo
```bash
echo "=== hogsmade uncommitted inventory ==="
git -C /home/caraxes/CascadeProjects status --short | head -40
```
```
  Step 1 — Inspect and group changes:
```
```bash
echo "--- MCP Servers ---"
git -C /home/caraxes/CascadeProjects diff --stat -- Tools/MCPServers/
echo "--- Components ---"
git -C /home/caraxes/CascadeProjects diff --stat -- Components/
echo "--- Workflows ---"
git -C /home/caraxes/CascadeProjects diff --stat -- .windsurf/
echo "--- Other ---"
git -C /home/caraxes/CascadeProjects diff --stat -- ':!Tools/MCPServers/' ':!Components/' ':!.windsurf/'
```
```
  Step 2 — Commit in conventional batches (requires user approval):
```
```bash
cd /home/caraxes/CascadeProjects
git add Tools/MCPServers/ && git commit -m "feat(mcp): update server implementations"
git add Components/ && git commit -m "fix(shared): update shared packages"
git add .windsurf/ && git commit -m "docs(workflows): add lumos workflow and updates"
git add -A && git commit -m "chore: batch remaining changes"
```
```
  Step 3 — Verify:
    mcp16_repo_detail(repoName: "hogsmade") → uncommitted should drop to 0
    Gate: PATH rises from 50.5 → ~68+ (drift drops from 0.90 → 0.00)
```

#### Sweep C: glimpse-engine — Commit 10 uncommitted files

```
SWEEP C — glimpse-engine drift reduction
```
// turbo
```bash
echo "=== glimpse-engine uncommitted ==="
git -C /home/caraxes/CascadeProjects diff --stat -- Applications/glimpse-engine/
```
```
  Step 1 — Batch commit:
```
```bash
cd /home/caraxes/CascadeProjects
git add Applications/glimpse-engine/ && git commit -m "feat(glimpse-engine): update engine and configs"
```
```
  Step 2 — Verify:
    mcp16_repo_detail(repoName: "glimpse-engine") → uncommitted → 0
    Gate: PATH rises from 64.9 → ~72+ (drift drops from 0.33 → 0.00)
```

#### Sweep D: GRID — Commit 5 uncommitted on feature branch

```
SWEEP D — GRID drift reduction
```
// turbo
```bash
echo "=== GRID uncommitted ==="
git -C /home/caraxes/CascadeProjects/Projects/GRID-main status --short
```
```
  Step 1 — Commit on feature branch:
```
```bash
cd /home/caraxes/CascadeProjects/Projects/GRID-main
git add -A && git commit -m "feat(knowledge): sqlite fts5 migration progress"
```
```
  Step 2 — Verify:
    mcp16_repo_detail(repoName: "GRID") → uncommitted → 0
    Gate: PATH rises from 63.6 → ~67+ (drift drops from 0.17 → 0.00)
```

#### Sweep E: eligibility-server — Classify audit failures

**Context**: 18% failure rate includes intentional `evolution_promotion_blocked` events from gate tests. These are mock-generated (see memory: eligibility-server tests mock audit-client).

```
SWEEP E — eligibility-server failure triage

  Step 1 — Inspect recent failures:
    mcp2_query_audit(tool: "evolution_promotion_blocked", status: "blocked", limit: 10)

  Step 2 — Classify:
    If all failures are from evolution gate tests → no fix needed
    If any are from live pipeline → investigate root cause

  Step 3 — Journal the finding:
    mcp15_journal_add(entry: "eligibility-server 18% fail rate is from
      mock-generated evolution_promotion_blocked events — no action needed",
      tags: ["audit", "triage"], mood: "focused")

  Gate: No PATH change expected — this is a classification sweep, not a fix
```

#### Sweep F: apiguard / Vision — Resolve no-git-repo status

```
SWEEP F — uninitialized repo decision (requires user decision)

  Option A — Initialize as git repos:
```
```bash
for dir in apiguard Vision; do
  path=$(find /home/caraxes/canopy /home/caraxes/grove -maxdepth 3 -type d -name "$dir" 2>/dev/null | head -1)
  [ -n "$path" ] && echo "Found: $path" && git -C "$path" init
done
```
```
  Option B — Exclude from scan roots (preferred if not source-controlled):
    Edit seeds-server config to exclude these directories from SEEDS_ROOT

  Gate: Ecosystem score rises from 75 → ~80+ if excluded or initialized
```

---

### 4.4 — CLEAR Tier (reference baselines — no action)

| Entity       | PATH | Role                                                |
|--------------|------|-----------------------------------------------------|
| afloat       | 73.5 | Gold standard: zero drift, 0.80 trust, 95 health   |
| echoes       | 69.5 | Near-clear: 3 uncommitted files, otherwise perfect  |
| seeds-server | 67.0 | Reliable signal source: zero failures, 9 clean events |

Use these as comparison anchors when evaluating sweep effectiveness.

---

## Phase 5 — EXECUTE (sweep pipeline with verification gates)

Execute sweeps in dependency order. Each sweep has a verification gate that must pass before the next sweep starts.

```
EXECUTION ORDER (dependency chain):

  Sweep A: grid-server ──────┐
    gate: health_check OK     │
                              ├─→ Sweep E: eligibility-server (can run parallel with B/C/D)
  Sweep B: hogsmade ──────────┤     gate: journal entry recorded
    gate: uncommitted → 0     │
                              ├─→ Sweep F: apiguard/Vision (user decision)
  Sweep C: glimpse-engine ────┤     gate: ecosystem score change
    gate: uncommitted → 0     │
                              │
  Sweep D: GRID ──────────────┘
    gate: uncommitted → 0

  After all gates pass → RE-PROBE
```

4. Execute Sweep A first (grid-server is the dependency for evolution advancement).

5. After Sweep A gate passes, execute Sweeps B, C, D, and E in parallel.

6. Execute Sweep F after user confirms intent (git init vs exclude).

7. After all sweeps complete, run the full re-probe:

// turbo
```bash
echo "=== LUMOS Re-probe ==="
echo "All sweeps complete. Collecting updated signals..."
```

```
Call in parallel:
  - mcp13_checkpoint(depth: "standard")
  - mcp16_ecosystem_scan(saveSnapshot: true)
  - mcp2_audit_stats()
  - mcp3_check_the_line()
```

8. Re-compute PATH scores and print the updated ranking. Confirm:
   - No entities in ACT or URGENT tier
   - Ecosystem score improved (target: 75 → 82+)
   - Total drift items decreased (target: 7 → 2 or fewer)
   - grid-server failure rate dropped below 15%

---

## Phase 6 — EVOLVE (evolution cycle advancement)

**Prerequisite**: Sweep A must be complete (grid-server healthy, admission gate operational).

9. Check evolution cycle readiness:

```
  mcp3_get_cycle_snapshot(caseId: "cycle-15bb439a")

  Advance conditions (all must be true):
    ✓ grid-server health_check returns OK
    ✓ momentum > 0.15 (currently 0.125 — borderline)
    ✓ sidewalkDrift < 0.15 (currently 0.117 — passes)
    ✓ No URGENT-tier entities remain
```

10. If conditions met, advance from `balance` → `tighten`:

```
  mcp3_advance_cycle(caseId: "cycle-15bb439a", direction: "forward",
    reason: "LUMOS sweep complete: grid-server restored, drift reduced, line clean")
```

11. If conditions NOT met, record the blocker and defer:

```
  mcp15_journal_add(entry: "LUMOS cycle advance deferred — <reason>",
    tags: ["evolution", "deferred"], linkedServer: "eligibility-server")
```

**Current state**:
```
  Case:     cycle-15bb439a
  Beat:     balance → (target: tighten)
  Score:    0.486
  Momentum: 0.125 (needs > 0.15 or signal boost)
  Drift:    0.117 (passes < 0.15 threshold)
  Blocker:  admission gate — resolves with Sweep A
```

---

## Quick Reference

### PATH Formula

```
PATH = 100 × [ (health/100 × 0.30) + (trust × 0.25) + ((1-drift) × 0.20)
              + ((1-fail) × 0.15)   + (momentum × 0.10) ]

Tiers: CLEAR ≥ 65 │ WATCH ≥ 50 │ ACT ≥ 35 │ URGENT < 35
```

### Sweep Dependency Chain

```
/startup (if GRID API down)
  └─→ Sweep A: grid-server (admission gate)
        ├─→ Sweep B: hogsmade (27 uncommitted)     ─┐
        ├─→ Sweep C: glimpse-engine (10 uncommitted) ├─→ RE-PROBE → EVOLVE
        ├─→ Sweep D: GRID (5 uncommitted)           ─┘
        ├─→ Sweep E: eligibility-server (triage)
        └─→ Sweep F: apiguard/Vision (user decision)
```

### Tool Cheat Sheet

| Phase    | Tools                                                                   |
|----------|-------------------------------------------------------------------------|
| PROBE    | `checkpoint`, `ecosystem_scan`, `check_the_line`, `audit_stats`, `enforcement_status`, `list_active_cycles` |
| STRUCT   | `hold_the_line`, `check_the_line`                                       |
| FIX      | `/startup`, `git add && git commit`, config edits                       |
| VERIFY   | `health_check`, `repo_detail`, `get_cycle_snapshot`, `audit_stats`      |
| EVOLVE   | `get_cycle_snapshot`, `advance_cycle`, `record_cycle_signal`            |
| JOURNAL  | `journal_add`, `focus_start`, `focus_end`                               |
| COMPARE  | `experiment_compare`, `ecosystem_trend`, `collect_table`                |

### Expected Outcomes After Full Sweep

| Metric             | Before | Target  |
|--------------------|--------|---------|
| Ecosystem score    | 75     | 82+     |
| Drift items        | 7      | ≤ 2     |
| ACT-tier entities  | 1      | 0       |
| grid-server fail%  | 67%    | < 15%   |
| Evolution beat     | balance| tighten |
| Uncommitted total  | 45     | < 5     |

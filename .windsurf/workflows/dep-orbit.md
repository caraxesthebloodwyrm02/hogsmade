---
description: Dependency orbit — read-mode continuous sweep of lockfile deltas, underground branch behavior, and dependency-test phase correlation across time windows
---

# DEP-ORBIT

Observation-first dependency intelligence loop. Read mode is the default and the priority — no mutations until explicitly escalated. Maintains forward momentum across three time windows (W7, W30, W90), exposes underground branch behavior (non-main lockfile divergence, pre-merge dep introductions), and correlates every dep change against ori test phases.

**Momentum rule**: the loop never stops for lack of findings. If a window is clean, record it as a green anchor and advance to the next window. Clean is signal too.

---

## When to Use

- Morning dep health check (replaces manual `npm audit` / `pip-audit` runs)
- Before merging a branch that touches a lockfile
- After an advisory is published against a dep in the ecosystem
- On any `dep-sweep` macro trigger from nuke
- When oriserver shows a threat coverage gap on grid-main

---

## ORBIT Pipeline

```
ANCHOR (current state) ──→ W7 ──→ W30 ──→ W90
                                    │
                               UNDERGROUND
                               (branch scan)
                                    │
                            TEST CORRELATION
                                    │
                            MOMENTUM SIGNAL
                                    │
                              (loop or park)
```

All phases are read-only unless the word **ESCALATE** appears in the phase header.

---

## Phase 0 — ANCHOR (read-only baseline, ~10s)

Establish current state before time-windowing. All four calls in parallel.

// turbo

1. Run anchor batch:

```
Call in parallel:
  - mcp11_full_diagnostic(saveReport: false)
  - mcp17_ecosystem_scan(saveSnapshot: false)
  - mcp13_get_threat_coverage_heatmap()
  - mcp2_audit_stats()
  - mcp11_dep_audit()  ← NEW: get current vulnerability state
```

2. Extract and hold these anchor values for delta comparison in later phases:

```
ANCHOR STATE:
  maintain_score     ← full_diagnostic.overallScore
  seeds_avg          ← ecosystem_scan.summary.overallScore
  dep_audit_result   ← dep_audit.summary
  npm_high_vulns     ← dep_audit.summary.bySeverity.high
  pip_moderate_vulns ← dep_audit.summary.bySeverity.moderate
  total_vulns        ← dep_audit.summary.totalVulnerabilities
  ori_degraded_count ← heatmap rows where all cells < 1.0
  echoes_fail_rate   ← audit_stats.failureRate
  anchored_at        ← ISO timestamp now
```

3. If `maintain_score < 80` → skip to **Phase 5 (Test Correlation)** first before windowing.
   Otherwise → proceed to Phase 1.

---

## Phase 1 — W7 WINDOW (7-day lockfile delta scan)

Inspect what changed in lockfiles across all active projects in the last 7 days.

// turbo

4. Run lockfile git log sweep across all known lockfile paths (read-only, no checkout):

```bash
echo "=== W7: Lockfile deltas (last 7 days) ==="
for lockfile in \
  /home/caraxes/CascadeProjects/package-lock.json \
  /home/caraxes/canopy/afloat/package-lock.json \
  /home/caraxes/CascadeProjects/Hogwarts/nuke/package-lock.json \
  /home/caraxes/canopy/echoes/uv.lock \
  /home/caraxes/CascadeProjects/Projects/GRID-main/uv.lock; do
    if [ -f "$lockfile" ]; then
      echo ""
      echo "--- $lockfile ---"
      git -C "$(dirname $lockfile)" log --oneline --since="7 days ago" -- "$(basename $lockfile)" 2>/dev/null | head -10
      echo "(last modified: $(git -C "$(dirname $lockfile)" log -1 --format="%cr" -- "$(basename $lockfile)" 2>/dev/null || echo "unknown"))"
    fi
done
```

5. For each lockfile that shows commits in W7, run a delta summary:

```bash
echo "=== W7: Dep delta for modified lockfiles ==="
# For each modified lockfile, show what packages changed
# npm: parse added/removed from package-lock diff
# pip: parse added/removed from uv.lock diff
for lockfile in \
  /home/caraxes/CascadeProjects/package-lock.json \
  /home/caraxes/canopy/afloat/package-lock.json \
  /home/caraxes/CascadeProjects/Hogwarts/nuke/package-lock.json; do
    if [ -f "$lockfile" ]; then
      dir="$(dirname $lockfile)"
      last_commit=$(git -C "$dir" log -1 --format="%H" --since="7 days ago" -- "$(basename $lockfile)" 2>/dev/null)
      if [ -n "$last_commit" ]; then
        echo ""
        echo "--- Delta: $lockfile ---"
        git -C "$dir" diff "${last_commit}^" "$last_commit" -- "$(basename $lockfile)" 2>/dev/null \
          | grep "^[+-]" | grep '"version"' | head -20
      fi
    fi
done
```

6. Record W7 findings:

```
W7 RESULT:
  lockfiles_touched  ← count of lockfiles with commits in window
  new_deps_added     ← list of packages with + version lines
  deps_removed       ← list of packages with - version lines
  deps_upgraded      ← packages with both + and - version lines (version bump)
  W7_status          ← CLEAN | DELTA | VULN_ADJACENT
```

If `W7_status = VULN_ADJACENT` (a dep in the advisory list was touched), flag for Phase 5.
Otherwise → proceed to Phase 2.

---

## Phase 2 — W30 WINDOW (30-day advisory + ecosystem trend)

Broaden to 30-day window. Focus on advisory publication timing vs. dep introduction timing.

// turbo

7. Run 30-day ecosystem trend and audit history in parallel:

```
Call in parallel:
  - mcp17_ecosystem_trend(limit: 5)
  - mcp2_query_audit(status: "failure", limit: 50, since: <30-days-ago-ISO>)
  - mcp11_report_history(limit: 5, metric: "all")
  - mcp11_dep_audit_history(limit: 10)  ← NEW: get dep vulnerability trend
```

8. Run 30-day lockfile git log sweep:

```bash
echo "=== W30: Lockfile commit history (last 30 days) ==="
for lockfile in \
  /home/caraxes/CascadeProjects/package-lock.json \
  /home/caraxes/canopy/afloat/package-lock.json \
  /home/caraxes/CascadeProjects/Hogwarts/nuke/package-lock.json \
  /home/caraxes/canopy/echoes/uv.lock \
  /home/caraxes/CascadeProjects/Projects/GRID-main/uv.lock; do
    if [ -f "$lockfile" ]; then
      echo ""
      echo "--- $lockfile ---"
      git -C "$(dirname $lockfile)" log --oneline --since="30 days ago" \
        --format="%h %ar | %s" -- "$(basename $lockfile)" 2>/dev/null | head -15
    fi
done
```

9. Build the advisory timeline: for each known vulnerability, determine when the dep version in question was introduced vs. when the advisory was published:

```
ADVISORY TIMELINE (known vulns as of anchor):

  GHSA-q4gf-8mx6-v5v3 (next, CVSS 7.5)
    dep introduced:   check `git log --since="90 days ago"` on afloat/package-lock.json
    advisory date:    2025-12 (from dep-audit-pipeline-design.md)
    gap (days):       dep_introduced_date - advisory_date
    exposure window:  if gap > 0 → dep was added AFTER advisory (known risk accepted)
                      if gap < 0 → dep was present BEFORE advisory (blind introduction)

  GHSA-6v7q-wjvx-w8wg (basic-ftp, CVSS 8.2)
    same analysis on CascadeProjects/package-lock.json

  GHSA-pjjw (uv, moderate)
    same analysis on GRID-main/uv.lock
```

10. Record W30 findings:

```
W30 RESULT:
  ecosystem_trend_delta  ← seeds improving/degrading/stable
  failure_rate_trend     ← echoes failure rate: rising | falling | stable
  health_score_trend     ← maintain score: stable (100 for last 5 reports)
  dep_vuln_trend        ← dep_audit_history.trend: improving | degrading | stable
  dep_history_count     ← dep_audit_history.available (number of saved audits)
  advisory_exposure      ← for each vuln: "blind" | "accepted" | "fixed"
  W30_status             ← CLEAN | TREND_DOWN | BLIND_INTRO
```

If `W30_status = TREND_DOWN` (including dep_vuln_trend = degrading), flag for Phase 5 and note which signal is degrading.
Otherwise → proceed to Phase 3.

---

## Phase 3 — W90 WINDOW (90-day dep lifecycle + branch stale scan)

Longest window. Identifies deps that have been present for a full quarter without review,
and projects where lockfiles are stale on non-main branches.

// turbo

11. Run 90-day lockfile age check and branch inventory:

```bash
echo "=== W90: Lockfile age (last touched) ==="
for lockfile in \
  /home/caraxes/CascadeProjects/package-lock.json \
  /home/caraxes/canopy/afloat/package-lock.json \
  /home/caraxes/CascadeProjects/Hogwarts/nuke/package-lock.json \
  /home/caraxes/canopy/echoes/uv.lock \
  /home/caraxes/CascadeProjects/Projects/GRID-main/uv.lock; do
    if [ -f "$lockfile" ]; then
      dir="$(dirname $lockfile)"
      last_touch=$(git -C "$dir" log -1 --format="%ar" -- "$(basename $lockfile)" 2>/dev/null || echo "never committed")
      last_hash=$(git -C "$dir" log -1 --format="%h" -- "$(basename $lockfile)" 2>/dev/null || echo "—")
      echo "  $lockfile"
      echo "    last touched: $last_touch ($last_hash)"
    fi
done
```

12. Scan for stale lockfiles on non-main branches (underground detection):

```bash
echo "=== UNDERGROUND: Branch lockfile divergence ==="
for repo_path in \
  /home/caraxes/CascadeProjects \
  /home/caraxes/canopy/afloat \
  /home/caraxes/CascadeProjects/Projects/GRID-main; do
    if [ -d "$repo_path/.git" ]; then
      echo ""
      echo "--- $repo_path ---"
      current=$(git -C "$repo_path" branch --show-current 2>/dev/null)
      echo "  current branch: $current"
      # List branches with lockfile changes diverged from main/master
      git -C "$repo_path" for-each-ref \
        --format='%(refname:short) %(committerdate:relative)' \
        refs/heads/ 2>/dev/null | grep -v "^$current " | head -10
    fi
done
```

13. For each non-main branch found, check if its lockfile diverges from the current branch:

```bash
echo "=== UNDERGROUND: Lockfile diff vs main (non-main branches) ==="
for repo_path in \
  /home/caraxes/CascadeProjects \
  /home/caraxes/canopy/afloat \
  /home/caraxes/CascadeProjects/Projects/GRID-main; do
    if [ -d "$repo_path/.git" ]; then
      main_branch=$(git -C "$repo_path" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||' || echo "main")
      current=$(git -C "$repo_path" branch --show-current 2>/dev/null)
      if [ "$current" != "$main_branch" ]; then
        lockfile=""
        [ -f "$repo_path/package-lock.json" ] && lockfile="package-lock.json"
        [ -f "$repo_path/uv.lock" ] && lockfile="uv.lock"
        if [ -n "$lockfile" ]; then
          echo "  $repo_path: checking $lockfile ($current vs $main_branch)"
          git -C "$repo_path" diff "$main_branch" HEAD -- "$lockfile" 2>/dev/null \
            | grep "^[+-]" | grep '"version"' | head -15
        fi
      fi
    fi
done
```

14. Record W90 + underground findings:

```
W90 RESULT:
  stale_lockfiles      ← lockfiles not touched in > 60 days
  non_main_branches    ← list of branches with lockfile divergence
  underground_deps     ← deps introduced on non-main branches (not yet in main)
  branch_dep_risk      ← for each underground dep: severity if known
  W90_status           ← CLEAN | STALE | UNDERGROUND_RISK
```

If `W90_status = UNDERGROUND_RISK`, these deps need advisory check before merge.

---

## Phase 4 — UNDERGROUND BRANCH BEHAVIOR REPORT

Synthesize the underground findings into a single structured report. Read-only.

15. For each non-main branch with lockfile divergence, produce a branch behavior card:

```
BRANCH BEHAVIOR CARD (template):

  Branch:         <name>
  Repo:           <path>
  Diverged from:  <main_branch> at <commit_hash> (<date>)
  Lockfile delta:
    + added:      <list of packages added on this branch>
    - removed:    <list of packages removed on this branch>
    ~ upgraded:   <list of version bumps on this branch>
  Advisory check: <CLEAN | <pkg>: <GHSA-xxx> severity>
  Merge risk:     LOW | MEDIUM | HIGH
  Stale since:    <last commit date on branch>
  Recommendation: MERGE_SAFE | AUDIT_BEFORE_MERGE | REBASE_NEEDED | ABANDON
```

16. Aggregate underground risk score:

```
UNDERGROUND AGGREGATE:
  total_non_main_branches    ← count
  branches_with_dep_changes  ← count
  highest_advisory_severity  ← NONE | moderate | high | critical
  total_underground_packages ← count of unique packages not in main lockfiles
  underground_risk_tier      ← CLEAR | WATCH | ACT
```

---

## Phase 5 — TEST CORRELATION (dep changes vs. test phase outcomes)

Map the W7/W30 lockfile deltas to the ori-server test run history. The question: did any dep change precede a test phase failure or degradation?

// turbo

17. Pull ori test run history and threat heatmap in parallel:

```
Call in parallel:
  - mcp13_list_runs(limit: 30)
  - mcp13_get_threat_coverage_heatmap()
  - mcp13_probe_test_suite()
```

18. Build the correlation table. For each test failure in the run history, check if the failure timestamp is within 7 days after a lockfile delta:

```
DEP → TEST CORRELATION TABLE:

  Project    | Lockfile delta | Delta date | Test failure | Failure date | Gap  | Correlated?
  ───────────────────────────────────────────────────────────────────────────────────────────
  afloat      | next bump      | <date>     | —            | —            | —    | no
  GRID-main   | —              | —          | timeout      | 2026-04-11   | —    | n/a (timeout)
  shared-types| —              | —          | passed       | 2026-04-11   | —    | clean
```

19. Apply correlation rule: if (lockfile_delta_date + 7d) >= test_failure_date → mark as `CORRELATED_CANDIDATE`. Does not mean causation — flags for human review.

20. Record test correlation findings:

```
TEST CORRELATION RESULT:
  correlated_candidates  ← list of (project, dep, test_failure, gap_days)
  clean_projects         ← projects with no lockfile delta and passing tests
  blind_projects         ← projects with no test coverage at all (unmapped in ori)
  grid_main_status       ← timeout (not a dep issue — ori runner timeout, not test failure)
  correlation_status     ← CLEAN | CANDIDATES | CONFIRMED_REGRESSION
```

---

## Phase 6 — MOMENTUM SIGNAL (keep the loop alive)

Emit the orbit result into ori-server's log collector and journal the cycle. This is what makes the loop self-sustaining — each orbit creates a record that DS-6 (RL datasheet) can consume as a training transition.

// turbo

21. Emit orbit signals to ori-server:

```
Call in parallel:
  - mcp13_collect_logs(
      source: "dep-orbit",
      lines: [
        "dep-orbit W7: <W7_status>. lockfiles_touched=<N>. delta_packages=<M>",
        "dep-orbit W30: <W30_status>. advisory_exposure=<summary>. trend=<direction>",
        "dep-orbit W90: underground_risk=<tier>. non_main_branches=<N>. stale_lockfiles=<N>",
        "dep-orbit test-correlation: <correlation_status>. correlated_candidates=<N>"
      ]
    )
  - mcp16_journal_add(
      entry: "dep-orbit complete. W7=<status> W30=<status> W90=<status>. underground_risk=<tier>. test_correlation=<status>.",
      tags: ["dep-orbit", "dependency", "read-mode"],
      mood: "focused"
    )
```

22. Apply momentum verdict:

```
ORBIT VERDICT:

  ┌─────────────────────────────────────────────────────────┐
  │ ORBIT CLEAR   — all windows CLEAN, underground CLEAR    │
  │   → Park. Next orbit: schedule at next session start.   │
  │                                                         │
  │ ORBIT WATCH   — any window shows DELTA or STALE         │
  │   → Re-run W7 next session. Journal the delta entries.  │
  │                                                         │
  │ ORBIT ACT     — UNDERGROUND_RISK=ACT or CORRELATED_CANDIDATE found │
  │   → Do not park. Escalate to /dep-escalate (see below). │
  │   → Surface findings to human before next merge.        │
  │                                                         │
  │ ORBIT URGENT  — advisory_severity = high/critical on    │
  │                 any branch (including non-main)         │
  │   → Immediate surface. Do not wait for next session.    │
  └─────────────────────────────────────────────────────────┘
```

23. If verdict is CLEAR or WATCH → record next orbit schedule:

```
  mcp13_notebook_add(
    category: "observation",
    title: "dep-orbit <ISO_date>: <VERDICT>",
    body: "W7=<status>. W30=<status>. W90=<status>. underground=<tier>. next_orbit=<date>.",
    tags: ["dep-orbit", "dependency"],
    projectId: "grid-main"
  )
```

---

## ESCALATE PATH — /dep-escalate (read → write transition, requires confirmation)

**Do not enter this path automatically.** Only enter when verdict is ACT or URGENT.

These steps transition from read mode to write mode. Each requires human confirmation before execution.

### E1 — Direct dep vulnerability fix (ACT)

```
Target: afloat / next (GHSA-q4gf-8mx6-v5v3, CVSS 7.5)
Command (requires approval):
  cd /home/caraxes/canopy/afloat && npm update next
Verification:
  npm audit | grep "next"        → should show 0 vulnerabilities
  npm test                       → must pass before commit
Commit:
  git commit -m "fix(deps): update next to resolve GHSA-q4gf-8mx6-v5v3"
```

### E2 — Transitive dep fix (MEDIUM)

```
Target: CascadeProjects / basic-ftp (GHSA-6v7q-wjvx-w8wg, CVSS 8.2)
Command (requires approval):
  cd /home/caraxes/CascadeProjects && npm audit fix
Verification:
  npm audit | grep "basic-ftp"   → should show 0 vulnerabilities
  npm run test:all               → must pass before commit
Commit:
  git commit -m "fix(deps): npm audit fix for GHSA-6v7q-wjvx-w8wg transitive"
```

### E3 — GRID-main ori timeout resolution (ACT)

```
Target: grid-main / ori-server timeout (all 6 TM vectors degraded)
Option A (preferred): run subset
  mcp13_run_tests(projectId: "grid-main", filter: "tests/unit", timeoutSeconds: 120)
Option B: increase timeout
  mcp13_configure_routes(action: "update", routeId: <grid-main-route>, trigger: { ... })
Verification:
  mcp13_get_threat_coverage_heatmap() → grid-main cells should rise from 0.5 → 1.0
```

### E4 — Underground branch merge gate

```
For each branch with underground_risk = ACT:
  1. Run npm audit / pip-audit on the branch lockfile before merging
  2. Surface any advisories found
  3. Human decides: merge | remediate first | abandon
  Read-only until human confirms merge intent.
```

---

## Quick Reference

### Time Window Summary

| Window      | Scope        | Key question                                                   | Tool                             |
| ----------- | ------------ | -------------------------------------------------------------- | -------------------------------- |
| W7          | 7 days       | What changed in lockfiles this week?                           | `git log --since="7 days ago"`   |
| W30         | 30 days      | Did any advisory-relevant dep appear in the last month?        | `git log + ecosystem_trend`      |
| W90         | 90 days      | Are any lockfiles untouched for a quarter? Any stale branches? | `git log + for-each-ref`         |
| UNDERGROUND | all branches | What's on non-main branches not yet in main?                   | `git diff main HEAD -- lockfile` |
| TEST CORR   | W7 window    | Did a dep change precede a test failure?                       | `list_runs + correlation`        |

### Orbit Status Codes

| Code                 | Meaning                                                   | Next action                     |
| -------------------- | --------------------------------------------------------- | ------------------------------- |
| CLEAN                | No changes, no advisories, no underground risk            | Park until next session         |
| DELTA                | Lockfile changed but no known advisory                    | Journal, re-check W30           |
| STALE                | Lockfile not touched in > 60 days                         | Flag for human awareness        |
| VULN_ADJACENT        | A dep matching an advisory was added/upgraded             | Escalate to Phase 5 immediately |
| BLIND_INTRO          | Dep was present before advisory published                 | Mark as "blind" — accepted risk |
| UNDERGROUND_RISK     | Non-main branch carries unaudited dep with known advisory | Block merge until E4            |
| CORRELATED_CANDIDATE | Dep delta within 7d of test failure                       | Human review before merge       |

### Momentum Rules

1. **Never stop on CLEAN** — record it and advance.
2. **Never stop on missing data** — if a lockfile has no git history, record `age=unknown` and continue.
3. **Never auto-escalate** — ACT/URGENT verdict surfaces to human, does not self-execute E1-E4.
4. **Loop trigger** — after any nuke `dep-check` knob fire, this workflow runs from Phase 0.

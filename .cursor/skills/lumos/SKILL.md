---
name: lumos
description: Full-light ecosystem state mapping with PATH scoring and ranked action paths. Run via /lumos for deep diagnostics, or use the Fast Lane (3-call looking-glass) for quick go/no-go verdicts. Dependency: /startup should be run first if GRID API or Ollama are down.
---

# LUMOS — Ecosystem State Mapper

Use LUMOS when you need a complete picture of ecosystem health, trust, drift, failure rates, and momentum across all repos and MCP servers. Returns ranked PATH scores and tier assignments (CLEAR/WATCH/ACT/URGENT) with specific remediation guidance.

## When to use

- Session start — get full ecosystem baseline
- Mid-session checkpoint — detect drift or degradation
- Pre-commit validation — verify changes haven't broken health
- Triage triage — identify which entities need immediate attention

## Fast Lane — Quick Go/No-Go

Run this 3-call batch for a verdict in seconds instead of the full pipeline:

```
Call in parallel:
  - mcp3_check_the_line()
  - mcp16_ecosystem_scan(saveSnapshot: false)
  - mcp2_enforcement_status()
```

**Verdicts:**

- **FAST CLEAR** (LINE clean + HEALTH ≥ 70 + ENFORCE normal) → Skip full pipeline, safe to work
- **FAST WATCH** (any ONE signal degraded) → Run Phase 1–3 only (PROBE → QUANTIFY → SORT)
- **FAST ACT** (TWO or more signals degraded) → Run full pipeline
- **FAST URGENT** (LINE broken OR ENFORCE has blocked/restricted precedents) → Run hold_the_line() immediately, then full pipeline

## Full Pipeline — All 6 Phases

### Phase 1 — PROBE (read-only signal collection)

Run all six tools in parallel (no side effects):

| Tool                                       | Source Server | Signal Collected                                                 |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| `mcp13_checkpoint(depth: "deep")`          | overview      | Cluster health, trust scores, drift items                        |
| `mcp16_ecosystem_scan(saveSnapshot: true)` | seeds         | Repo health, uncommitted counts, branch state                    |
| `mcp3_check_the_line()`                    | eligibility   | Structural findings: barrel gaps, orphaned exports, import drift |
| `mcp3_list_active_cycles()`                | eligibility   | Evolution beat position, momentum, drift                         |
| `mcp2_enforcement_status()`                | echoes        | Precedent escalation levels, active counts                       |
| `mcp2_audit_stats()`                       | echoes        | Failure rates, event counts by tool and source                   |

### Phase 2 — QUANTIFY (compute PATH scores)

Each entity gets a PATH score (0–100) from five weighted signals:

```
PATH = 100 × [ (health/100 × 0.30)
              + (trust       × 0.25)
              + ((1 - drift)  × 0.20)
              + ((1 - fail)   × 0.15)
              + (momentum     × 0.10) ]
```

| Signal   | Weight | Source                        | Normalization           |
| -------- | ------ | ----------------------------- | ----------------------- |
| health   | 0.30   | `ecosystem_scan` healthScore  | 0–100 → /100            |
| trust    | 0.25   | `checkpoint` trust.confidence | already 0.0–1.0         |
| drift    | 0.20   | uncommitted / 30 (capped)     | inverted (1−drift)      |
| fail     | 0.15   | audit failures / total events | inverted (1−fail)       |
| momentum | 0.10   | evolution cycle momentum      | default 0.5 if no cycle |

### Phase 3 — SORT (rank and tier-assign)

| Tier       | PATH Range | Action Required                    |
| ---------- | ---------- | ---------------------------------- |
| **CLEAR**  | 65–100     | None — reference baseline          |
| **WATCH**  | 50–64      | Monitor; batch-fix if convenient   |
| **ACT**    | 35–49      | Fix this session before continuing |
| **URGENT** | 0–34       | Stop everything; fix immediately   |

Sort entities descending by PATH and assign tiers. Print the ranked table.

### Phase 4 — GUIDE (generate action plan)

For each ACT/URGENT entity, generate specific remediation steps based on the dominant signal:

- Low health → run diagnostic, check dependencies
- Low trust → review governance, verify audit trail
- High drift → commit sweep, stash cleanup
- High fail rate → audit logs, fix root cause
- Low momentum → advance evolution cycle

### Phase 5 — EXECUTE (write path)

Execute the action plan:

- Run targeted fixes (hold_the_line, dependency updates, test fixes)
- Advance evolution cycles if promotion gates pass
- Commit changes with conventional commit format

### Phase 6 — EVOLVE (close the loop)

- Re-run Fast Lane to verify improvement
- Update snapshots for trend analysis
- Journal the session outcome

## Working rules

- Always run Fast Lane first to determine if full pipeline is needed
- For WATCH-tier entities, defer to Phase 3 unless multiple cluster together
- For ACT/URGENT entities, stop other work and remediate immediately
- Keep PATH scoring transparent — show the math when asked
- Use the baseline ranking (2026-04-06) as reference for drift detection

## Do not

- Do not skip Fast Lane unless explicitly told to run full pipeline
- Do not modify the PATH formula weights without explicit user request
- Do not run Phase 5 (EXECUTE) write operations without confirmation on ACT/URGENT items
- Do not ignore URGENT-tier entities — they must be addressed before continuing

## Reference baseline

Baseline ranking from 2026-04-06 (GRUFF reference):

| Rank | Entity             | PATH | Tier  | Dominant Signal               |
| ---- | ------------------ | ---- | ----- | ----------------------------- |
| 1    | afloat             | 73.5 | CLEAR | High trust (0.80), zero drift |
| 2    | echoes             | 69.5 | CLEAR | Stable, 3 uncommitted only    |
| 3    | seeds-server       | 67.0 | CLEAR | Zero audit failures           |
| 4    | GRID               | 63.6 | WATCH | Moderate trust, some drift    |
| 5    | glimpse-engine     | 64.9 | WATCH | High drift (33%)              |
| 6    | eligibility-server | 57.9 | WATCH | High fail rate (18%)          |
| 7    | apiguard           | 50.0 | WATCH | Low health (0.50)             |
| 8    | Vision             | 50.0 | WATCH | Low health (0.50)             |
| 9    | hogsmade           | 50.5 | WATCH | Extreme drift (90%)           |
| 10   | grid-server        | 47.5 | ACT   | High fail rate (67%)          |

Use this baseline to detect drift when re-running LUMOS in future sessions.

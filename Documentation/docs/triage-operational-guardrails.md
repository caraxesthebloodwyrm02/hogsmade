# Triage Operational Guardrails

> Derived from the 2026-04-10 triage execution. Applied lessons from noise ratio, dependency cascading, unpredicted regressions, and volume ≠ severity inversion.

---

## 1. Hiccup Matrix — Standing Categories

Every triage session's hiccup matrix **must** include these standing categories in addition to session-specific predictions:

| Category                         | Default Probability | Impact                                    | Detection Method                                      |
| -------------------------------- | ------------------- | ----------------------------------------- | ----------------------------------------------------- |
| GRID API offline                 | 40%                 | High — blocks test re-runs, admission     | `curl localhost:8080/health`                          |
| Ollama offline                   | 20%                 | Medium — blocks RAG-dependent tests       | `curl localhost:11434/api/tags`                       |
| Recent shared-lib changes        | 20%                 | High — can regress all downstream servers | `git log --since=48h -- Components/shared-types/src/` |
| Untracked noise in target repo   | 25%                 | Low — delays git init by 2 min            | `ls -la` + check for venvs, caches                    |
| Test re-runs produce audit noise | 70%                 | Low — expected synthetic failures         | Timestamps prove test origin                          |
| New precedent escalation         | 15%                 | Medium — could block future calls         | `mcp2_query_precedents` post-run                      |
| Merit guard regression           | 15%                 | High — blocks all MCP tools               | `npm run --workspace Components/shared-types test`    |

### Rationale for "Recent shared-lib changes"

The `shared-types` package is consumed by **12+ MCP servers**. A single regression in `mcp-guard-hardened.ts` or `merit-policy.ts` can silently break every server. The `NO_GRID_API` bug (2026-04-10, commit `4228ea7`) was invisible until a test explicitly exercised the code path.

**Detection**: Before any triage session, run:

```bash
git log --oneline --since=48h -- Components/shared-types/src/
```

If changes exist, prepend "verify shared-types tests" to Phase 1.

---

## 2. Impact Scoring

Volume-based prioritization inverts real priorities. Use `impact_score` to override:

### Scoring Rules

| Signal                                               | impact_score | Rationale                                         |
| ---------------------------------------------------- | ------------ | ------------------------------------------------- |
| Single defect blocking cascading downstream scores   | **100**      | Root cause; fixing it resolves N downstream items |
| Code regression in shared library                    | **90**       | Blast radius = all consumers                      |
| Test fixture failures (synthetic)                    | **1**        | High volume, zero real impact                     |
| Stale data timestamps                                | **5**        | Informational, no user impact                     |
| Infra dependency failures (API offline during tests) | **10**       | Transient; resolves when infra is restored        |
| Genuine test suite failures                          | **80**       | Real code defect requiring fix                    |

### Application in `what_should_i_work_on`

When reviewing the priority queue from `mcp16_what_should_i_work_on`:

1. Multiply `priority_score` by `impact_score / 100`
2. Items with `impact_score < 10` are noise — skip unless all high-impact items are resolved
3. Items with `impact_score ≥ 80` are addressed first regardless of volume

### Future: Automated Impact Scoring

The `NoiseClassification` type (added to `MeritAuditEntry` in `merit-policy.ts`) provides the foundation:

```typescript
type NoiseClassification = "synthetic" | "test_fixture" | "stale" | "cascading" | null;
```

When `noise !== null`, auto-assign `impact_score ≤ 10`. When `noise === null`, use the scoring rules above.

---

## 3. Dependency-Aware Triage

### Rule: Check upstream before fixing downstream

Before fixing a repo, query its dependencies:

```
mcp17_repo_detail → check healthScore
mcp17_ecosystem_trend → check if score is cascading from another repo
```

If the target repo's low health is **caused by** an upstream repo (e.g., `upwork-cli` → `seeds-server`), fix the upstream repo first. The downstream score will resolve automatically.

### Cascade Detection Heuristic

When `ecosystem_scan` reports multiple repos with similar health drops within the same scan window:

1. Identify the repo with the **lowest individual health** (likely root cause)
2. Fix that repo first
3. Re-scan — if other repos recover, they were cascading, not independent failures

### Automated Cascade Alert (Future)

When a repo's health improves by ≥ 20 points in a single scan:

- Auto-trigger `mcp16_what_should_i_work_on` for repos that were previously flagged in the same scan
- If those repos also improved, mark them as `noise: cascading` in the audit trail

---

## 4. Parallel Execution Protocol

### Batching Rules

| Phase Type                           | Parallelizable? | Rule                                                                 |
| ------------------------------------ | --------------- | -------------------------------------------------------------------- |
| Independent health checks            | **Yes**         | Batch all `health_check` calls                                       |
| Test re-runs (no shared state)       | **Yes**         | Run `grid-server`, `echoes-server`, `seeds-server` tests in parallel |
| Admission + Enforcement verification | **Yes**         | `admission_stats` + `enforcement_status` have no dependencies        |
| Sequential dependency phases         | **No**          | Phase 2 (fix) must complete before Phase 3 (test)                    |
| Deploy gate checks                   | **Yes**         | `ecosystem_scan` + `checkpoint` + `health_check` in parallel         |

### Time Savings Reference

From 2026-04-10 execution:

- **Projected serial**: 30 min
- **Actual parallel**: 18 min (-40%)
- **Primary savings**: Phases 4+5 batched (-3 min), Phase 1 no-op (-4 min), Phase 7 parallel (-2 min)

---

## 5. Morning Briefing Refinement

### Pre-filtering Protocol

Before reviewing morning briefing items:

1. **Tag synthetic noise**: Items where `source` matches test runner patterns → `noise: synthetic`
2. **Tag cascading items**: Items sharing the same root cause (e.g., same `lastCommit` window, same API dependency) → `noise: cascading`
3. **Tag stale data**: Items where the only issue is timestamp age → `noise: stale`
4. **Remaining items**: These are real defects — prioritize by `impact_score`

### Semantic Tags in Audit Trail

Every merit decision now includes `semantic: "local" | "remote" | "degraded"` in:

- `_meta` response field (visible to MCP consumers)
- `emitAudit` metadata (visible in echoes audit log)
- `MeritAuditEntry` interface (typed in shared-types)

Use these to filter morning briefing:

- `semantic: local` → Development/testing context, lower priority
- `semantic: remote` → Production path, higher priority
- `semantic: degraded` → Circuit breaker open, investigate

---

## 6. Strategic Guardrails Summary

| Guardrail                 | Rule                                                            | Exception                                               |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| **Noise filtering**       | Default `healthThreshold=70` in `what_should_i_work_on`         | Manual override for `semantic: local` issues            |
| **Dependency awareness**  | Check `repo_detail` for transitive fixes before starting a repo | Skip if repo has zero dependencies                      |
| **Parallelization**       | Batch independent queries per the table in §4                   | Sequential for phases with data dependencies            |
| **Impact scoring**        | Use `impact_score` to override volume-based prioritization      | All items reviewed if `impact_score ≥ 80` count is zero |
| **Shared-lib regression** | Run `shared-types` tests before any triage                      | Skip if `git log --since=48h` shows no changes          |

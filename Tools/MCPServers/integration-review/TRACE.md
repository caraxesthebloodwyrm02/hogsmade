# E2E Trace — ori-server v1.0.0

> Live capture of the test run and expected tool call sequence.
> Use this to verify output correctness and evaluate output quality.

---

## Test Run — 2026-04-08T20:32Z

```
 RUN  v4.1.2

 ✓ tests/interop.test.ts      (10 tests)   33ms
 ✓ tests/reporter.test.ts     (20 tests)   21ms
 ✓ tests/threat-model.test.ts (15 tests)  187ms
 ✓ tests/notebook.test.ts     (15 tests)  212ms
 ✓ tests/registry.test.ts     (14 tests)  204ms
 ✓ tests/smoke.test.ts        (10 tests)  243ms
 ✓ tests/executor.test.ts     (16 tests) 1463ms

 Test Files  7 passed (7)
      Tests  100 passed (100)
   Duration  1.59s
```

### Test Coverage Map

| Test File | What It Covers |
|-----------|---------------|
| `smoke.test.ts` | Server boots, health_check returns valid shape, all 22 tools registered |
| `executor.test.ts` | Sandbox validation, test execution, output capture, run result retrieval |
| `registry.test.ts` | Project CRUD, registry persistence, health status updates |
| `reporter.test.ts` | Report generation, conditional sections, markdown output |
| `threat-model.test.ts` | Threat parsing, coverage mapping, gap detection |
| `notebook.test.ts` | Note append, query filters, summary aggregation |
| `interop.test.ts` | Echoes audit parsing, seeds snapshot loading, graceful absence |

---

## Golden Path — Expected Tool Call Sequence

This is what a normal session looks like. Each step shows the tool call,
what it returns conceptually, and what to check.

### Step 1: health_check

```json
// Call
{ "tool": "health_check", "input": {} }

// Expected response shape
{
  "status": "healthy",         // or "degraded" if GRID offline
  "version": "1.0.0",
  "tools": 22,
  "dataDir": "~/.ori",
  "riskPatterns": 15,
  "circuitState": "CLOSED",    // "OPEN" if GRID unreachable
  "metrics": { "admitted": N, "rejected": N }
}
```

**Check**: status is "healthy" or "degraded" (not "error"). tools = 22.

### Step 2: list_projects

```json
// Call
{ "tool": "list_projects", "input": {} }

// Expected: array of project entries with id, name, location, healthStatus
// First run: seed data from registry-data.ts (25+ projects)
```

**Check**: Projects include ori-server itself. Locations are absolute paths (no /home/caraxes).

### Step 3: run_tests

```json
// Call
{ "tool": "run_tests", "input": { "projectId": "ori-server" } }

// Expected response shape
{
  "runId": "run_...",
  "summary": {
    "passed": 100,
    "failed": 0,
    "skipped": 0,
    "errors": 0,
    "durationMs": ~1500
  },
  "logEntriesCreated": N,
  "status": "passed"
}
```

**Check**: status = "passed", failed = 0. This is ori-server testing itself.

### Step 4: probe_test_suite

```json
// Call
{ "tool": "probe_test_suite", "input": {} }

// Expected response shape
{
  "totalEntries": N,
  "patternsMatched": { "pattern_id": count, ... },
  "severityCounts": { "critical": 0, "warning": N, "info": N },
  "timeWindow": { "earliest": "...", "latest": "..." }
}
```

**Check**: critical = 0 after a clean test run. Patterns detected are info/warning level.

### Step 5: get_recommendations

```json
// Call
{ "tool": "get_recommendations", "input": {} }

// Expected: array of recommendations, each with:
// { read: "what to look at", reason: "why it matters", action: "what to do", reproducibility: "how to verify" }
// After a clean run: 0 recommendations is normal.
```

**Check**: Recommendations are actionable. Zero after clean run = correct.

### Step 6: generate_report

```json
// Call
{ "tool": "generate_report", "input": {} }

// Expected: saves markdown report to ~/.ori/reports/YYYY-MM-DD-report.md
// Returns: { reportPath, sections: [...] }
```

**Check**: Report contains executive summary, test suite health table,
risk signal analysis, threat coverage. Sections with no data are omitted (conditional rendering).

---

## Degraded Mode — GRID Offline

When GRID API is unreachable:

| Tool | Behavior |
|------|----------|
| `health_check` | Returns `status: "degraded"`, `circuitState: "OPEN"` |
| `run_tests` | **Blocked** — merit guard rejects (circuit open) |
| `collect_logs` | Works normally |
| `probe_test_suite` | Works normally |
| `get_recommendations` | Works normally |
| `notebook_add` | Works normally |
| `generate_report` | **Blocked** — merit guard rejects |
| `ecosystem_context` | Works normally (reads local files only) |

**This is by design.** Read/analysis tools are independent of GRID.
Execution/reporting tools require the gate.

---

## Output Quality Questions for Reviewer

1. Is the risk pattern set (`src/patterns.ts`) comprehensive enough?
   - 15 patterns covering: assertion failures, timeouts, unhandled rejections,
     deprecation warnings, memory leaks, connection errors, permission denied,
     segfaults, import errors, type errors, uncaught exceptions, ENOENT,
     port conflicts, certificate errors, rate limiting.
   - **Missing patterns?** Flag them.

2. Is the report format (`src/reporter.ts`) useful?
   - Conditional sections, severity-sorted, threat-mapped.
   - **Too verbose? Too sparse?** Flag the specific section.

3. Are recommendations actionable?
   - Format: read → reason → action → reproducibility.
   - **Vague recommendations?** Flag with the pattern ID that triggered them.

4. Is the notebook useful for cross-run context?
   - Categories: observation, decision, anomaly, trend, cross-run-context.
   - **Missing categories?** Flag them.

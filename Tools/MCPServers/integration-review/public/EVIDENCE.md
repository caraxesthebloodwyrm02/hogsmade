# Evidence — ori-server v1.0.0

> Test results and expected behavior for verification.
> Use this as your reference for "what correct looks like."

---

## Test Suite Results

```
 7 test files
 100 tests passed
 0 tests failed
 0 tests skipped
 Duration: 1.59s
```

Test areas covered:
- Server initialization and tool registration
- Project registry CRUD and persistence
- Test execution sandbox and output capture
- Risk pattern matching and log classification
- Threat model parsing and coverage mapping
- Notebook persistence and querying
- Cross-server data reading and graceful absence
- Report generation with conditional sections

---

## Expected Tool Behavior

### health_check (no arguments)

Returns server status. Key fields:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "tools": 22,
  "riskPatterns": 15,
  "circuitState": "CLOSED"
}
```

- `status` is "healthy" when all systems are up, "degraded" when gate is unreachable
- `tools` should always be 22
- `circuitState` is "CLOSED" (gate reachable) or "OPEN" (gate unreachable)

### list_projects (no arguments)

Returns the project registry. First-time call returns seed data.
Each entry has: `id`, `name`, `location`, `runner`, `healthStatus`, `tags`.

### run_tests ({ projectId })

Executes the project's test suite in a sandboxed environment.
Returns a run summary with pass/fail counts and classified log entries.

- Requires gate to be reachable (guarded tool)
- Respects per-project timeout configuration
- Output is automatically classified against risk patterns

### probe_test_suite (no arguments or time filter)

Scans all collected logs and returns a structured breakdown:
- Total entries analyzed
- Patterns matched (by pattern ID and count)
- Severity distribution (critical, warning, info)
- Time window of analyzed data

After a clean test run: expect 0 critical, low warning count.

### get_recommendations (no arguments)

Generates structured recommendations from collected data.
Each recommendation has four fields:

- **read**: What to look at
- **reason**: Why it matters
- **action**: What to do about it
- **reproducibility**: How to verify the finding

After a clean run with no risk signals: 0 recommendations is correct.

### generate_report (no arguments)

Produces a full markdown research report. Sections include:
- Executive summary
- Test suite health table
- Risk signal analysis
- Threat coverage matrix
- Recommendations

Sections with no significant data are automatically omitted.
This is intentional — an empty report section means no findings in that area.

---

## Degraded Mode Behavior

When the gate API is unreachable:

| Category | Tools | Behavior |
|----------|-------|----------|
| Analysis | collect, filter, probe, recommend | **Work normally** |
| Memory | notebook_add, notebook_query, notebook_summary | **Work normally** |
| Integration | ecosystem_context | **Works normally** |
| Status | health_check | **Works** — reports degraded state |
| Execution | run_tests, run_all_tests, discover_tests | **Blocked** |
| Reporting | generate_report | **Blocked** |
| Destructive | clear_logs | **Blocked** |

This split is by design: reading and thinking should never be gated
behind the availability of an external service.

---

## Risk Pattern Coverage

The pattern library detects 15 categories of runtime signals:

1. Assertion failures
2. Test timeouts
3. Unhandled promise rejections
4. Deprecation warnings
5. Memory leak indicators
6. Connection/network errors
7. Permission denied
8. Segmentation faults
9. Import/module resolution failures
10. Type errors
11. Uncaught exceptions
12. File not found (ENOENT)
13. Port conflicts (EADDRINUSE)
14. Certificate/TLS errors
15. Rate limiting signals

Each pattern has a severity level (critical, warning, info) and a unique ID.
The `probe_test_suite` output references patterns by ID so findings
can be traced back to their classification rule.

---

## Verification Checklist

Use this to confirm ori-server behaves correctly on your machine:

- [ ] `health_check` returns status "healthy" or "degraded"
- [ ] `list_projects` returns project entries
- [ ] `run_tests` executes and returns pass/fail counts (requires gate)
- [ ] `probe_test_suite` returns severity counts after collecting logs
- [ ] `notebook_add` + `notebook_query` round-trips a note
- [ ] `generate_report` produces a markdown report (requires gate)
- [ ] `clear_logs` is rejected without the confirmation phrase
- [ ] Invalid tool inputs produce validation errors, not crashes
- [ ] Disconnecting the gate triggers circuit breaker on guarded tools
- [ ] Unguarded tools continue working when gate is disconnected

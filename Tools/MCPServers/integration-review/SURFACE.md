# Tool Surface — ori-server v1.0.0

> Mechanical reference for agents and humans reviewing the API surface.
> 22 tools across 4 categories. All use JSON Schema via zod.

---

## Transport

- **Protocol**: MCP (Model Context Protocol) over stdio
- **SDK**: @modelcontextprotocol/sdk ^1.28.0
- **Entry**: `npx tsx src/server.ts`

---

## Tool Catalog

### Collection & Analysis (5 tools)

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `collect_logs` | `{ lines: string[], source?: string }` | `{ ingested, classified, patterns[] }` | Ingest console log lines, classify by risk |
| `filter_logs` | `{ severity?, source?, patternIds?, since?, until?, limit?, sortBy?, sortOrder? }` | `{ entries[], total }` | Query stored logs with filters |
| `list_collected` | `{ limit?, offset?, sortBy?, sortOrder? }` | `{ entries[], total }` | Browse log store |
| `probe_test_suite` | `{ source?, since?, until? }` | `{ summary, patterns{}, severityCounts, timeWindow }` | Time-aware risk scan of collected logs |
| `clear_logs` | `{ confirm: "CLEAR-ORI-LOGS" }` | `{ cleared: true }` | Purge all collected data (destructive) |

### Registry & Execution (6 tools)

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `list_projects` | `{ tags?, healthStatus? }` | `{ projects[] }` | Browse project registry |
| `get_project` | `{ projectId }` | `{ project, lastRun?, threatMapping }` | Full project detail |
| `discover_tests` | `{ projectId }` | `{ testFiles, runnerAvailable }` | Scan project test dirs |
| `run_tests` | `{ projectId, filter?, timeoutSeconds? }` | `{ runId, summary, logEntries }` | Execute test suite in sandbox |
| `run_all_tests` | `{ projectIds?, stopOnFailure?, timeoutSeconds? }` | `{ results[] }` | Sequential multi-project run |
| `get_run_result` | `{ runId, includeStdout? }` | `{ run, stdout? }` | Retrieve past run detail |

### Intelligence & Reporting (6 tools)

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `get_recommendations` | `{ source?, since?, until?, save? }` | `{ recommendations[] }` | Read-reason-actionable output |
| `get_coverage_gaps` | `{}` | `{ uncoveredThreats[], unhealthyProjects[] }` | Threats without test coverage |
| `parse_threat_model` | `{ refresh? }` | `{ threats, coverage, gaps }` | Parse markdown threat model |
| `map_threats` | `{ projectId?, threatId? }` | `{ mappings[] }` | Threat-to-test coverage map |
| `generate_report` | `{ projectIds?, includeEcosystemContext?, publish? }` | `{ reportPath, sections }` | Full markdown research report |
| `list_runs` | `{ projectId?, status?, limit?, offset? }` | `{ runs[] }` | Browse test run history |

### Memory & Integration (5 tools)

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `notebook_add` | `{ category, title, body, projectId?, tags? }` | `{ noteId }` | Append observation/decision/anomaly |
| `notebook_query` | `{ category?, tags?, projectId?, since?, until?, limit? }` | `{ notes[] }` | Query persistent notebook |
| `notebook_summary` | `{}` | `{ total, byCategory, bySource, uniqueProjects }` | Notebook aggregate stats |
| `ecosystem_context` | `{ includeRecentEvents? }` | `{ echoes, seeds, summary }` | Cross-server read (echoes + seeds) |
| `health_check` | `{}` | `{ status, tools, dataDir, circuitState, metrics }` | Server health + merit guard state |

---

## Schemas to Examine

Every tool uses zod for input validation. To inspect the actual schemas:

- **Source of truth**: `src/server.ts` — each `registerTool` / `registerGuardedTool` call
  includes the zod schema inline with descriptions.
- **Live introspection**: Connect via MCP Inspector and call `tools/list`.

---

## Design Decisions to Evaluate

1. **Tool naming**: kebab_case with verb prefixes (`collect_`, `filter_`, `list_`, `get_`, `run_`, `generate_`, `parse_`, `map_`, `clear_`)
   - *Question for reviewer*: Is this consistent? Are any names misleading?

2. **Guarded vs unguarded tools**: 5 tools use `registerGuardedTool` (merit guard + rate limit),
   the rest use `registerTool` (rate limit only).
   - Guarded: `run_tests`, `run_all_tests`, `generate_report`, `clear_logs`, `discover_tests`
   - *Question for reviewer*: Should any unguarded tool be guarded? Any guarded tool unguarded?

3. **Destructive operations**: Only `clear_logs` requires a confirmation phrase (`CLEAR-ORI-LOGS`).
   - *Question for reviewer*: Are there other destructive operations that need confirmation?

4. **Output shape**: All tools return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.
   - *Question for reviewer*: Is the output structure adequate for downstream consumption?

5. **Report rendering**: Conditional sections — only render if data meets significance thresholds.
   - See `src/reporter.ts` for the rendering logic.
   - *Question for reviewer*: Are the thresholds reasonable?

---

## Dependency Map

```
ori-server
├── @cascade/shared-types (local)  ← build first
│   ├── generateId()               — UUID generation
│   ├── emitAudit()                — echoes audit trail (no-ops if unavailable)
│   ├── SessionRateLimiter         — per-tool rate limiting
│   ├── createHardenedMeritGuard   — GRID gate validation (circuit-breaker fallback)
│   └── ExecutionPolicyEngine      — path sandboxing for test execution
├── @modelcontextprotocol/sdk      — MCP protocol implementation
└── zod                            — input schema validation
```

All three runtime deps are required. shared-types is the only local dependency.

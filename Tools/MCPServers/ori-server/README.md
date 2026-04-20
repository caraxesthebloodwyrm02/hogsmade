# ori-server

Edge-sanding MCP server — test suite research and reporting system for CascadeProjects.

## Purpose

Ori operates alongside your test suite, collecting console output in real-time, classifying each line against known risk patterns, and producing **read-reason-actionable** recommendations. It maps the CascadeProjects threat model to test coverage, generates research reports, and maintains a persistent notebook for cross-run context. The philosophy is subtlety: a large test collection is a mix of various signals — sort + filter = good note material.

## Tools (23)

### Collection & Analysis

| Tool                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `health_check`        | Verify ori-server operational state                     |
| `collect_logs`        | Ingest console log lines from a test run                |
| `filter_logs`         | Apply severity/pattern/source/time filters with sorting |
| `probe_test_suite`    | Time-aware scan of collected logs for risk signals      |
| `get_recommendations` | Generate read-reason-actionable output for edge cases   |
| `list_collected`      | Browse stored log entries with sorting and pagination   |
| `clear_logs`          | Purge all collected log data (requires confirmation)    |

### Registry & Execution

| Tool             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `list_projects`  | List registered projects with optional tag/health filter |
| `get_project`    | Get detailed info for a specific project                 |
| `discover_tests` | Validate project on disk and count test files            |
| `run_tests`      | Execute a project's test suite via subprocess sandbox    |
| `run_all_tests`  | Run test suites for multiple projects sequentially       |
| `get_run_result` | Retrieve a completed test run with optional stdout       |
| `list_runs`      | Browse test run history with filters                     |

### Intelligence & Reporting

| Tool                          | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `parse_threat_model`          | Parse/refresh the CascadeProjects threat model           |
| `map_threats`                 | Map threats to test coverage by project or threat ID     |
| `get_threat_coverage_heatmap` | JSON grid: threats × projects with health/mapping scores |
| `generate_report`             | Full research report (health, threats, recommendations)  |
| `get_coverage_gaps`           | Identify threats without adequate test coverage          |

### Memory & Integration

| Tool                | Description                                        |
| ------------------- | -------------------------------------------------- |
| `notebook_add`      | Add an observation, decision, or anomaly note      |
| `notebook_query`    | Query notebook by category, tags, project, or time |
| `notebook_summary`  | Overview of notebook state and aggregations        |
| `ecosystem_context` | Cross-server context (Echoes audit, Seeds health)  |

## Risk Patterns

| ID                    | Label                       | Severity |
| --------------------- | --------------------------- | -------- |
| `assertion_error`     | Assertion failure           | critical |
| `timeout`             | Timeout detected            | critical |
| `unhandled_rejection` | Unhandled promise rejection | critical |
| `race_condition`      | Race condition signal       | critical |
| `deprecation`         | Deprecation warning         | warning  |
| `memory_leak`         | Memory concern              | warning  |
| `type_error`          | Type mismatch               | warning  |
| `network_error`       | Network failure             | warning  |
| `console_error`       | Console error               | warning  |
| `flaky_test`          | Flaky test signal           | warning  |
| `console_warn`        | Console warning             | info     |
| `test_skip`           | Skipped test                | info     |

## Usage

### Collect logs from a test run

```
Use collect_logs with lines=["AssertionError: expected 200", "PASS tests/unit.test.ts"]
```

### Filter for critical signals only

```
Use filter_logs with severity=["critical"], sortBy="severity", sortOrder="desc"
```

### Probe the test suite

```
Use probe_test_suite with source="my-test-suite"
```

### Get recommendations

```
Use get_recommendations with save=true
```

## Data Storage

```
~/.ori/
  logs/              Daily NDJSON log files
  probes/            Probe result JSON
  recommendations/   Recommendation JSON
  registry/          Project registry state
  runs/              Structured test run results + raw stdout/stderr
  reports/           Generated research reports (markdown)
  threat-model/      Parsed threat model cache
  notebook/          Persistent NDJSON notebook
```

## Development

```bash
npm install
npm run dev        # watch mode
npm run test       # run tests
npm run test:coverage  # with coverage
npm run build      # TypeScript compile
npm run lint       # type check
```

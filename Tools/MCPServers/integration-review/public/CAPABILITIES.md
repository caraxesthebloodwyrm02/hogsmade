# Capabilities — ori-server v1.0.0

## What It Is

A Model Context Protocol (MCP) server that monitors test suites,
classifies console output by risk severity, and generates structured
research reports. Think of it as a test-suite analyst that reads every
line of output and tells you what needs attention.

## What It Does

ori-server provides 22 tools organized into four functional areas:

### 1. Collection & Analysis

Ingest console log lines from any test runner. Each line is classified
against a pattern library that detects assertion failures, timeouts,
unhandled rejections, memory leaks, connection errors, permission issues,
import failures, and other runtime signals.

| Tool | What It Does |
|------|-------------|
| `collect_logs` | Ingest log lines, classify each by risk severity |
| `filter_logs` | Query stored logs by severity, source, pattern, time range |
| `list_collected` | Browse the log store with pagination and sorting |
| `probe_test_suite` | Time-aware scan — produces severity counts and pattern breakdown |
| `clear_logs` | Purge all collected data (requires confirmation phrase) |

### 2. Project Registry & Test Execution

Maintains a registry of projects with their test configurations.
Executes test suites inside a sandboxed environment with path restriction,
timeout enforcement, and buffer limits.

| Tool | What It Does |
|------|-------------|
| `list_projects` | Browse registered projects, filter by health or tags |
| `get_project` | Full project detail including last run and threat mapping |
| `discover_tests` | Scan a project's test directories and validate runner availability |
| `run_tests` | Execute a project's test suite in sandbox, capture and classify output |
| `run_all_tests` | Sequential multi-project execution with optional stop-on-failure |
| `get_run_result` | Retrieve detailed results from a past run |

### 3. Intelligence & Reporting

Transforms collected data into actionable intelligence: recommendations
in read-reason-action format, threat model coverage maps, and full
markdown research reports with conditional sections.

| Tool | What It Does |
|------|-------------|
| `get_recommendations` | Structured recommendations: what to read, why, what to do |
| `get_coverage_gaps` | Threats without test coverage, projects under threat with no healthy run |
| `parse_threat_model` | Parse a markdown threat model document |
| `map_threats` | Map threats to test coverage for a project or threat ID |
| `generate_report` | Full markdown research report — sections only render if data is significant |
| `list_runs` | Browse test run history with filters |

### 4. Memory & Integration

Persistent notebook for observations across sessions. Read-only integration
with sibling data stores for audit trails and ecosystem health snapshots.

| Tool | What It Does |
|------|-------------|
| `notebook_add` | Record an observation, decision, anomaly, or trend |
| `notebook_query` | Query notes by category, tags, project, or time range |
| `notebook_summary` | Aggregate stats — total notes, breakdown by category |
| `ecosystem_context` | Read audit trail and ecosystem snapshots (read-only, graceful if absent) |
| `health_check` | Server status, tool count, data directory state, circuit breaker state |

---

## What It Does Not Do

- **Does not execute arbitrary code.** Only pre-registered test commands run.
- **Does not write to external systems.** Cross-server integration is read-only.
- **Does not require network access.** Runs entirely local over stdio.
- **Does not store user identity.** Logs contain test output only.

## Runtime Requirements

- Node.js 22+
- npm
- A shared types package (provided in the monorepo) — must be built first
- No Python, no external APIs, no database

## Graceful Degradation

ori-server validates certain tools against an external admission gate.
When the gate is unreachable:

- **Read/analysis tools work normally** — collect, filter, probe, recommend, notebook
- **Execution/reporting tools are blocked** — run_tests, generate_report
- **health_check reports the state** — `circuitState: "OPEN"` means degraded mode

This is intentional. Analysis should never be gated behind availability.

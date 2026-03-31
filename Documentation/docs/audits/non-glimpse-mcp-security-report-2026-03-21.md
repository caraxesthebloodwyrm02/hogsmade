# Non-Glimpse MCP Security Report

Date: 2026-03-21
Analyst: Codex
Scope: all canonical MCP servers in `/home/caraxes/CascadeProjects/mcp_config.json` except `glimpse-server`

## Scope And Method

Canonical scope comes from `/home/caraxes/CascadeProjects/mcp_config.json` and `/home/caraxes/CascadeProjects/mcp_inventory.manifest.json`.

- In scope: `afloat-server`, `echoes-server`, `grid-server`, `lots-server`, `maintain-server`, `pulse-server`, `seeds-server`, `grid-rag`, `grid-rag-enhanced`, `grid-enhanced-tools`, `portfolio-safety-lens`, `code-analysis`, `test-runner`
- Out of scope by request and manifest status: `glimpse-server`
- Transport model: editor-facing stdio MCP for all in-scope servers; `code-analysis` and `test-runner` use custom newline-delimited JSON-RPC stdio loops rather than the MCP SDK

Evidence collection used four sources:

- Static source inspection of the canonical config, manifest, tool registration sites, and server config files
- Live stdio runtime probe across all defined tools
- Isolated deep probe for `grid-rag`, `grid-rag-enhanced`, and `grid-enhanced-tools` using temporary data under `/tmp/mcp_deep_probe_20260321`
- Focused filesystem and service exposure audit for the MCP data stores and backend listeners

Runtime artifacts:

- `/tmp/mcp_security_probe_20260321/runtime_probe.json`
- `/tmp/mcp_security_probe_20260321/runtime_probe_summary.json`
- `/tmp/mcp_deep_probe_20260321/deep_probe.json`

Endpoint ID convention used in this report:

- MCP transport endpoint: `tools/call`
- Tool endpoint ID: `<server-key>.<tool-name>`

## Executive Findings

### High

1. Sensitive MCP state is world-readable on disk.
All inspected MCP state directories are `0755` and key files are `0644`: `/home/caraxes/.echoes/audit.ndjson`, `/home/caraxes/.pulse/journal/2026-03-21.json`, `/home/caraxes/.seeds-server/bookmarks.json`, `/home/caraxes/CascadeProjects/GATE/.nonce_registry.json`, `/home/caraxes/CascadeProjects/GATE/results/envelope_GRID-main_fec6aa7f.json`, and `/home/caraxes/roots/GRID/.rag_db/chroma.sqlite3`. Any local user on the workstation can read audit history, journals, bookmarks, nonce state, envelope results, and the RAG vector store.

2. Both RAG servers are misconfigured against the local Ollama model inventory.
`grid-rag` and `grid-rag-enhanced` are configured for `RAG_EMBEDDING_MODEL=nomic-embed-text-v2-moe:latest` and `RAG_LLM_MODEL_LOCAL=ministral:latest`, but `curl http://localhost:11434/api/tags | jq -r '.models[].name' | rg '^(nomic|ministral)'` returned only `ministral-3:14b-cloud`. The isolated deep probe showed that all embedding-dependent tools fail with `model "nomic-embed-text-v2-moe:latest" not found`.

3. `grid-enhanced-tools` silently falls back to the wrong Python interpreter.
The server is launched from the GRID virtualenv, but its tool implementations invoke bare `python` subprocesses instead of `sys.executable`. At runtime the tool responses were protocol-successful while the actual scanners failed with `/usr/bin/python: No module named bandit`, `detect-secrets`, `pip-audit`, `ruff`, and `radon`. This leaves the security and quality tooling surface effectively nonfunctional unless the system interpreter is separately provisioned.

### Medium

4. `portfolio-safety-lens` is fully unavailable.
All four tools returned backend-unavailable responses because startup hit `AttributeError: module 'databricks.sql' has no attribute 'Cursor'`.

5. `grid-server` advertises an HTTP dependency that is currently down.
The canonical config sets `GRID_API_URL=http://localhost:8080`, but `curl http://localhost:8080/health` failed to connect. `grid-server.validate_envelope` therefore reported `incoming/ directory not found`, and the gate audit path is currently empty.

6. `echoes-server` audit parsing is degraded.
`echoes-server.query_audit` returned only 2 valid entries with `parseErrors: 15`. That is an integrity and observability problem for anything relying on the audit log as a trustworthy record.

7. The RAG servers perform unexpected cold-start egress to Hugging Face.
During live probing both `grid-rag` and `grid-rag-enhanced` performed `HEAD` and `GET` requests to `https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2/...` while initializing the reranker. That is not exposed by the canonical config and matters for outbound-traffic review.

### Low / Positive Controls

8. The editor-facing MCP transport itself is not network-exposed.
The manifest correctly states stdio child-process transport for editor usage, and the port audit showed only `ollama` listening on a relevant backend port: `127.0.0.1:11434`. No listener existed on `localhost:8080`.

9. Several destructive surfaces are correctly gated.
`lots-server.experiment_run` is disabled unless `LOTS_ENABLE_EXPERIMENT_RUN=true`, `maintain-server.cleanup_execute` ran in dry-run mode and issues a preview token, `echoes-server.record_audit` rejected an unknown source by policy, and `test-runner` blocked paths resolving outside the GRID workspace root.

## Endpoint And Target Map

This table maps the server-level tool surface, the implementation anchor, and the concrete targets each tool family touches.

| Server | Implementation Anchor | Endpoint ID Namespace | Primary Targets | Network / Subprocess Targets | Current Security Posture |
| --- | --- | --- | --- | --- | --- |
| `afloat-server` | `afloat-server/src/server.ts`, `afloat-server/src/config.ts` | `afloat-server.*` | `~/.afloat/workflows`, `~/.afloat/history` | none | healthy, local FS only |
| `echoes-server` | `echoes-server/src/server.ts`, `echoes-server/src/config.ts` | `echoes-server.*` | `~/.echoes/audit.ndjson`, `~/.echoes/telemetry` | none | healthy, but audit parse integrity degraded |
| `grid-server` | `grid-server/src/server.ts`, `grid-server/src/config.ts` | `grid-server.*` | `/home/caraxes/CascadeProjects/GATE`, deployment targets under `/home/caraxes/CascadeProjects` | `http://localhost:8080/api/v1/gate/validate` | degraded, backend down |
| `lots-server` | `lots-server/src/server.ts`, `lots-server/src/config.ts` | `lots-server.*` | `/home/caraxes/CascadeProjects/experiments`, `~/.echoes`, `~/.afloat`, `~/.seeds-server` | `python`, `node`, `bash`, `powershell` for experiments | healthy, execution gate works |
| `maintain-server` | `maintain-server/src/server.ts`, `maintain-server/src/config.ts` | `maintain-server.*` | `~/.maintain-server`, `/tmp`, `/home/caraxes/CascadeProjects`, `/home/caraxes/seed` | `git`, `df`, `ps`, `npm`, `pip`, `powershell` | healthy, dry-run cleanup control works |
| `pulse-server` | `pulse-server/src/server.ts`, `pulse-server/src/config.ts` | `pulse-server.*` | `~/.pulse`, `~/.echoes`, `~/.afloat`, `~/.seeds-server` | none | healthy, reads multiple local state stores |
| `seeds-server` | `seeds-server/src/server.ts`, `seeds-server/src/config.ts` | `seeds-server.*` | `/home/caraxes/seed`, `~/.seeds-server` | `git` | healthy |
| `grid-rag` | `roots/GRID/mcp-setup/server/grid_rag_mcp_server.py`, `roots/GRID/src/tools/rag/config.py` | `grid-rag.*` | `/home/caraxes/roots/GRID/.rag_db` or temp vector store | `http://localhost:11434`, `https://huggingface.co/...` | online, but embedding-dependent tools fail |
| `grid-rag-enhanced` | `roots/GRID/src/grid/mcp/enhanced_rag_server.py`, `roots/GRID/src/tools/rag/config.py` | `grid-rag-enhanced.*` | `/home/caraxes/roots/GRID/.rag_db` or temp vector store, in-memory session store | `http://localhost:11434`, `https://huggingface.co/...` | online, but query/index fail |
| `grid-enhanced-tools` | `roots/GRID/mcp-setup/server/enhanced_tools_mcp_server.py` | `grid-enhanced-tools.*` | arbitrary target paths and generated docs output dirs | bare `python` subprocesses for `bandit`, `detect-secrets`, `pip-audit`, `pytest`, `sphinx`, `ruff`, `radon`, `black`, `mypy`, `pip-licenses` | protocol healthy, backend tooling mostly broken |
| `portfolio-safety-lens` | `roots/GRID/mcp-setup/server/portfolio_safety_mcp_server.py` | `portfolio-safety-lens.*` | portfolio analyzer, audit logger, governance checks | Databricks / Coinbase runtime dependencies | fully unavailable |
| `code-analysis` | `roots/GRID/mcp-setup/server/code_analysis_mcp_server.py` | `code-analysis.*` | target Python files inside GRID | `ruff`, `mypy`, `black` via subprocess | partially healthy, weak signal quality |
| `test-runner` | `roots/GRID/mcp-setup/server/test_runner_mcp_server.py` | `test-runner.*` | target tests inside GRID workspace | `pytest` via subprocess | healthy access control, current example calls blocked |

## Tool Runtime Record

### `afloat-server`

Targets: `~/.afloat/workflows`, `~/.afloat/history`

- `afloat-server.health_check`: returned zero workflows and zero executions in the isolated snapshot.
- `afloat-server.workflow_list`: returned an empty workflow list before creation.
- `afloat-server.workflow_history`: returned an empty history before execution and one completed dry-run execution after probe creation.
- `afloat-server.workflow_create`: created isolated workflow `security-probe-workflow`.
- `afloat-server.workflow_get`: retrieved the created workflow metadata.
- `afloat-server.workflow_execute`: completed a dry run and did not execute a real command.

### `echoes-server`

Targets: `~/.echoes/audit.ndjson`, `~/.echoes/telemetry`

- `echoes-server.health_check`: reported `auditLogBytes: 3943`, `auditLineCount: 17`, `auditCorruptLines: 0`, `telemetrySnapshots: 0`.
- `echoes-server.query_audit`: returned 2 valid `maintain-server` entries and `parseErrors: 15`.
- `echoes-server.audit_stats`: reported 2 success events, average duration `37500 ms`.
- `echoes-server.list_telemetry`: returned `0` snapshots before probe write and `1` snapshot after probe write.
- `echoes-server.record_audit`: rejected probe input with `Audit entry from unknown source 'security-probe'` under policy `P-INT-002`.
- `echoes-server.save_telemetry`: successfully wrote an isolated snapshot.

### `grid-server`

Targets: `/home/caraxes/CascadeProjects/GATE`, deployment roots under `/home/caraxes/CascadeProjects`

- `grid-server.health_check`: gate directory exists, but `incoming` and `auditLog` were absent; deployment targets were `grid-server`, `afloat-server`, `echoes-server`, `lots-server`, `experiments`.
- `grid-server.list_targets`: enumerated project roots and implied ports `8080`, `3000`, `8000`, `8001`.
- `grid-server.validate_envelope`: returned `valid: false` with `incoming/ directory not found`.
- `grid-server.gate_audit`: returned zero entries.
- `grid-server.nonce_status`: returned `total: 2`; the live registry includes a Windows-style source string `E:\\`.
- `grid-server.check_permission`: allowed `deploy` for `grid-server`.

### `lots-server`

Targets: `/home/caraxes/CascadeProjects/experiments`, plus read access to `~/.echoes`, `~/.afloat`, `~/.seeds-server`

- `lots-server.health_check`: reported zero experiments in the isolated store.
- `lots-server.experiment_list`: returned zero experiments, then two draft experiments after creation.
- `lots-server.experiment_create`: created two isolated draft experiments with Python script paths under the temp probe directory.
- `lots-server.experiment_get`: retrieved one created experiment.
- `lots-server.experiment_run`: correctly refused execution because `LOTS_ENABLE_EXPERIMENT_RUN` was not enabled.
- `lots-server.experiment_compare`: compared two draft experiments successfully.
- `lots-server.experiment_suggest`: returned zero detected patterns and zero proposals.

### `maintain-server`

Targets: `~/.maintain-server`, `/tmp`, `/home/caraxes/CascadeProjects`, `/home/caraxes/seed`

- `maintain-server.health_check`: reported one existing report and scan roots `/home/caraxes/CascadeProjects`, `/home/caraxes/seed`.
- `maintain-server.scan_temp`: found `/tmp` at `1378 MB` and `/root/.npm/_cacache` at `410 MB`, but `0 MB` reclaimable by current age filter.
- `maintain-server.scan_workspaces`: found `23` workspaces, `78 MB` total reclaimable, top reclaimable workspace `glimpse-artifact` at `13 MB`.
- `maintain-server.scan_git_repos`: flagged `mcp-tool-experiment` with `307 uncommitted changes`.
- `maintain-server.scan_system`: reported RAM usage `49%`, disk free `90%`, no warnings.
- `maintain-server.full_diagnostic`: overall score `100`, `totalIssues: 1`, `reclaimableTotalMB: 78`.
- `maintain-server.report_history`: reported 2 historical reports with stable trend.
- `maintain-server.cleanup_execute`: dry-run only; issued a preview token and removed nothing.

### `pulse-server`

Targets: `~/.pulse`, `~/.echoes`, `~/.afloat`, `~/.seeds-server`

- `pulse-server.health_check`: saw 9 journal entries, no active focus session, and confirmed local data-source presence for Echoes, Afloat, and Seeds.
- `pulse-server.morning_briefing`: generated a dashboard but reported ecosystem health `20/100` because several expected repo directories were not present.
- `pulse-server.check_alerts`: returned 7 repo-health alerts.
- `pulse-server.what_should_i_work_on`: prioritized ecosystem health recovery and degraded repo follow-up.
- `pulse-server.briefing_preferences_set`: wrote preferences successfully.
- `pulse-server.journal_add`: wrote a new journal entry.
- `pulse-server.journal_list`: returned 10 then 11 entries for the day, including prior security-hardening activity.
- `pulse-server.focus_start`: started a focus session.
- `pulse-server.focus_interrupt`: recorded one interruption.
- `pulse-server.focus_end`: closed the focus session and wrote a journal update.
- `pulse-server.daily_digest`: produced a daily digest with 11 journal entries, 1 focus session, and 21 audit events.

### `seeds-server`

Targets: `/home/caraxes/seed`, `~/.seeds-server/bookmarks.json`, `~/.seeds-server/snapshots`

- `seeds-server.health_check`: reported `reposDetected: 2`, `bookmarkCount: 5`, `snapshotCount: 1`.
- `seeds-server.ecosystem_scan`: reported overall score `78` across 9 repos; `GRID`, `afloat`, `echoes`, `glimpse-engine`, `apiguard`, `Vision`, and `hogsmade` existed, while `archive` and `templates` lacked git repos.
- `seeds-server.repo_detail`: returned detailed metadata for `GRID`, including `branch: main`, `uncommittedChanges: 2`, and stack `Python 3.13+, FastAPI, ChromaDB`.
- `seeds-server.bookmark_add`: created a new bookmark for `GRID/src/main.py`.
- `seeds-server.bookmark_list`: returned 5 bookmarks, including multiple security-related bookmarks under `caraxes`.
- `seeds-server.ecosystem_trend`: showed overall score improvement from `20` to `78`.

### `grid-rag`

Targets: vector store path and local / remote model backends

- `grid-rag.rag_index`: failed because local Ollama did not have `nomic-embed-text-v2-moe:latest`.
- `grid-rag.rag_stats`: succeeded and reported `Documents: 0`, collection `grid_knowledge_base`, embedding model `nomic-embed-text-v2-moe:latest`, LLM model `ministral:latest`.
- `grid-rag.rag_search`: failed with the same missing embedding model.
- `grid-rag.rag_query`: failed with the same missing embedding model.
- `grid-rag.rag_add_document`: failed with the same missing embedding model.
- `grid-rag.rag_on_demand`: failed with the same missing embedding model.

Observed backend calls during probe:

- `GET http://localhost:11434/api/tags`
- `HEAD` and `GET` requests to `https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2/...`

### `grid-rag-enhanced`

Targets: vector store path, session store, local / remote model backends

- `grid-rag-enhanced.index_documents`: failed because the configured embedding model was missing from local Ollama.
- `grid-rag-enhanced.get_stats`: succeeded and reported zero sessions, zero turns, and zero successful auto-index attempts.
- `grid-rag-enhanced.create_session`: created isolated session `probe-session`.
- `grid-rag-enhanced.get_session`: returned the session metadata and empty turn history.
- `grid-rag-enhanced.query`: failed because the configured embedding model was missing from local Ollama.
- `grid-rag-enhanced.delete_session`: deleted the isolated session successfully.

Observed backend calls during probe:

- `GET http://localhost:11434/api/tags`
- `HEAD` and `GET` requests to `https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2/...`

### `grid-enhanced-tools`

Targets: arbitrary file paths and subprocess-based developer tooling

- `grid-enhanced-tools.performance_profiler`: succeeded against an isolated Python file and returned `cProfile` output.
- `grid-enhanced-tools.security_auditor`: ran, but all backends failed because `/usr/bin/python` lacked `bandit`, `detect-secrets`, and `pip-audit`.
- `grid-enhanced-tools.test_coverage_analyzer`: ran but returned `success: false` and empty coverage data for the isolated target.
- `grid-enhanced-tools.documentation_generator`: ran but returned `success: false` and generated no files for the isolated target.
- `grid-enhanced-tools.dependency_health_monitor`: partially succeeded; it reported `PyGObject 3.54.5 -> 3.56.1` as outdated, but vulnerability checks failed because `/usr/bin/python` lacked `pip-audit`.
- `grid-enhanced-tools.code_quality_gate`: ran, but checks failed because `/usr/bin/python` lacked `ruff`, `radon`, and other expected tooling.
- `grid-enhanced-tools.workflow_orchestrator`: succeeded in dry-run mode and returned the planned testing workflow.

### `portfolio-safety-lens`

Targets: portfolio analyzer, governance checks, audit logger

- `portfolio-safety-lens.portfolio_summary_safe`: backend unavailable.
- `portfolio-safety-lens.portfolio_risk_signal`: backend unavailable.
- `portfolio-safety-lens.audit_log_tail`: backend unavailable.
- `portfolio-safety-lens.governance_lint`: backend unavailable.

Returned error for all four calls:

- `available: false`
- `error: AttributeError: module 'databricks.sql' has no attribute 'Cursor'`
- `hint: Install and configure the Coinbase/Databricks runtime before using this server.`

### `code-analysis`

Targets: Python files inside GRID, subprocess static analysis tools

- `code-analysis.analyze_code`: ran on `code_analysis_mcp_server.py`; `ruff` passed, `mypy` reported 5 type errors, and `black` failed because the module was not installed in the invoked environment.
- `code-analysis.check_security`: returned 10 issues, but they were generic pattern hits on strings like `api_key`, `secret_key`, `token`, `eval(`, and `exec(`, which indicates weak signal quality and high false-positive risk.
- `code-analysis.get_complexity`: reported `257` total lines, `201` code lines, `49` blank lines, and `7` comment lines.

### `test-runner`

Targets: tests inside the GRID workspace root

- `test-runner.discover_tests`: denied access because `tests` resolved outside `/home/caraxes/roots/GRID`.
- `test-runner.get_test_summary`: denied access for the same reason.
- `test-runner.run_tests`: denied access for the same reason.
- `test-runner.run_coverage`: denied access for the same reason.

This is a positive access-control result, not a bypass.

## Focused Filesystem Audit

| Path | Mode / Owner | Size | Security Note |
| --- | --- | --- | --- |
| `/home/caraxes/.afloat` | `drwxr-xr-x caraxes:caraxes` | `12K` | workflows and history are locally readable by all users |
| `/home/caraxes/.echoes` | `drwxr-xr-x caraxes:caraxes` | `72K` | `audit.ndjson`, `network.log`, and integrity files are `0644` |
| `/home/caraxes/.pulse` | `drwxr-xr-x caraxes:caraxes` | `24K` | journal and focus state are locally readable by all users |
| `/home/caraxes/.maintain-server` | `drwxr-xr-x caraxes:caraxes` | `20K` | historical reports are `0644` |
| `/home/caraxes/.seeds-server` | `drwxr-xr-x caraxes:caraxes` | `16K` | bookmarks and snapshots are `0644` |
| `/home/caraxes/CascadeProjects/GATE` | `drwxr-xr-x caraxes:caraxes` | `80K` | nonce registry and envelope results are `0644` |
| `/home/caraxes/CascadeProjects/experiments` | `drwxr-xr-x caraxes:caraxes` | `4.0K` | execution disabled by config, but storage path is not private |
| `/home/caraxes/roots/GRID/.rag_db` | `drwxr-xr-x caraxes:caraxes` | `740K` | Chroma DB store and index shards are `0644` |

Representative file-level exposure:

- `/home/caraxes/.echoes/audit.ndjson`: `-rw-r--r--`
- `/home/caraxes/.pulse/journal/2026-03-21.json`: `-rw-r--r--`
- `/home/caraxes/.seeds-server/bookmarks.json`: `-rw-r--r--`
- `/home/caraxes/CascadeProjects/GATE/.nonce_registry.json`: `-rw-r--r--`
- `/home/caraxes/CascadeProjects/GATE/results/envelope_GRID-main_fec6aa7f.json`: `-rw-r--r--`
- `/home/caraxes/roots/GRID/.rag_db/chroma.sqlite3`: `-rw-r--r--`

## Service Exposure Audit

`ss -ltnp` showed these relevant listeners:

- `127.0.0.1:11434` owned by `ollama`
- no listener on `127.0.0.1:8080`

Interpretation:

- The MCP servers themselves are not exposed as network listeners in the editor-canonical path.
- `grid-server` currently depends on a dead local HTTP backend.
- The RAG servers depend on a live local Ollama backend and additionally perform outbound Hugging Face fetches during cold start.

## Source Anchors

Canonical scope:

- `/home/caraxes/CascadeProjects/mcp_config.json:14-161`
- `/home/caraxes/CascadeProjects/mcp_inventory.manifest.json:11-117`

Tool registration anchors:

- `afloat-server/src/server.ts`: `165`, `203`, `255`, `289`, `320`, `394`
- `echoes-server/src/server.ts`: `239`, `286`, `333`, `359`, `375`, `403`
- `grid-server/src/server.ts`: `300`, `349`, `384`, `718`, `747`, `792`
- `lots-server/src/server.ts`: `158`, `194`, `296`, `356`, `549`, `585`, `970`
- `maintain-server/src/server.ts`: `1046`, `1097`, `1168`, `1268`, `1346`, `1395`, `1582`, `1846`
- `pulse-server/src/server.ts`: `784`, `826`, `1017`, `1081`, `1180`, `1218`, `1292`, `1332`, `1391`, `1433`, `1519`
- `seeds-server/src/server.ts`: `307`, `358`, `477`, `520`, `562`, `603`
- `roots/GRID/mcp-setup/server/grid_rag_mcp_server.py`: tool declarations at `201`, `227`, `257`, `278`, `306`, `331`
- `roots/GRID/src/grid/mcp/enhanced_rag_server.py`: tool declarations at `116`, `138`, `150`, `159`, `168`, `173`
- `roots/GRID/mcp-setup/server/enhanced_tools_mcp_server.py`: tool declarations at `100`, `123`, `146`, `164`, `182`, `204`, `226`
- `roots/GRID/mcp-setup/server/portfolio_safety_mcp_server.py`: tool declarations at `99`, `108`, `117`, `126`
- `roots/GRID/mcp-setup/server/code_analysis_mcp_server.py`: custom `tools/list` loop for `analyze_code`, `check_security`, `get_complexity`
- `roots/GRID/mcp-setup/server/test_runner_mcp_server.py`: custom `tools/list` loop for `run_tests`, `run_coverage`, `discover_tests`, `get_test_summary`

Config anchors for key targets:

- `/home/caraxes/CascadeProjects/afloat-server/src/config.ts`
- `/home/caraxes/CascadeProjects/echoes-server/src/config.ts`
- `/home/caraxes/CascadeProjects/grid-server/src/config.ts`
- `/home/caraxes/CascadeProjects/lots-server/src/config.ts`
- `/home/caraxes/CascadeProjects/maintain-server/src/config.ts`
- `/home/caraxes/CascadeProjects/pulse-server/src/config.ts`
- `/home/caraxes/CascadeProjects/seeds-server/src/config.ts`
- `/home/caraxes/CascadeProjects/shared-types/src/audit-client.ts`
- `/home/caraxes/roots/GRID/src/tools/rag/config.py`

## Recommended Remediation Order

1. Tighten filesystem permissions on all MCP state roots and files to user-private defaults (`0700` directories, `0600` files where feasible).
2. Fix the RAG model inventory mismatch by installing or reconfiguring the embedding and local LLM models actually referenced by the canonical config.
3. Change `grid-enhanced-tools` subprocess calls from bare `python` to the active interpreter path and verify required modules inside that environment.
4. Repair the `portfolio-safety-lens` Databricks runtime dependency before treating that server as available.
5. Either restore the backend at `http://localhost:8080` or remove / quarantine `grid-server` features that depend on it.
6. Repair or rotate the `echoes` audit log so parser errors stop masking the majority of entries.

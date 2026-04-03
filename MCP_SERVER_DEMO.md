# MCP Server Capabilities Demo

**Archival note**: This demo predates the 2026-04-04 layout reorg. Some example paths below still use the older flat workspace shape and are preserved for historical context only.

Generated: 2026-03-24
Purpose: Demonstrate all available MCP server tools and their capabilities

---

## 1. afloat-server (Workflow Orchestration)

**Health Status**: ✅ OK (v1.0.0)
**Data Directory**: `/home/caraxes/.afloat`

### Available Tools:

- `mcp0_health_check` - Server health and workflow count
- `mcp0_workflow_create` - Create new workflow definitions
- `mcp0_workflow_execute` - Execute workflows (dry-run or live)
- `mcp0_workflow_get` - Get workflow details by ID
- `mcp0_workflow_history` - List recent workflow executions
- `mcp0_workflow_list` - List all workflow definitions

### Demo Output:

```json
{
  "workflowCount": 0,
  "executionCount": 0
}
```

**Created Demo Workflow**: `wf-1774379594118-x6i3dl`

- Name: "Demo Workflow"
- Description: "A simple demo workflow to showcase afloat-server capabilities"
- Steps: 1 step (echo command)

---

## 2. echoes-server (Audit Log & Telemetry)

**Health Status**: ✅ OK (v1.0.0)
**Data Directory**: `/home/caraxes/.echoes`

### Available Tools:

- `mcp2_health_check` - Server health and audit log integrity
- `mcp2_audit_stats` - Aggregate statistics from audit log
- `mcp2_list_telemetry` - List telemetry snapshots for trend analysis
- `mcp2_query_audit` - Query audit log with filters
- `mcp2_record_audit` - Record audit entry from MCP pipeline
- `mcp2_save_telemetry` - Save workspace telemetry snapshot

### Demo Output:

```json
{
  "auditLogBytes": 8240,
  "auditLineCount": 35,
  "auditCorruptLines": 0,
  "telemetrySnapshots": 0
}
```

**Recent Audit Events**: 2 entries from maintain-server

- Security hardening operations
- File integrity baseline creation
- Firewall audit rules applied

---

## 3. overview-server (Ecosystem Overview)

**Health Status**: ✅ Healthy (v1.0.0)
**Data Directory**: `/home/caraxes/.overview-server`

### Available Tools:

- `mcp10_health_check` - Server health and data source connectivity
- `mcp10_checkpoint` - Generate checkpoint assessment (trajectory, cluster health, drift, trust)

### Demo Output:

```json
{
  "ecosystemScore": 96,
  "direction": "improving",
  "scoreDelta": 8,
  "confidence": "high",
  "trustScore": 80
}
```

**Cluster Health**:

- GRID Family: 100/100
- MCP Infrastructure: 85/100
- Canopy Applications: 100/100
- Glimpse Family: 90/100
- Deployment Pipeline: 100/100
- Seed & Archive: 100/100

---

## 4. pulse-server (Daily Workflow & Focus)

**Health Status**: ✅ OK (v1.0.0)
**Data Directory**: `/home/caraxes/.pulse`

### Available Tools:

- `mcp12_health_check` - Server health and data sources
- `mcp12_briefing_preferences_set` - Configure morning briefing preferences
- `mcp12_check_alerts` - Check for ecosystem alerts
- `mcp12_daily_digest` - Generate daily digest summary
- `mcp12_focus_end` - End focus session and record outcome
- `mcp12_focus_interrupt` - Record interruption during focus session
- `mcp12_focus_start` - Start a focus session
- `mcp12_journal_add` - Add journal entry
- `mcp12_journal_list` - List journal entries
- `mcp12_morning_briefing` - Generate morning briefing
- `mcp12_what_should_i_work_on` - Get prioritized work queue

### Demo Output:

```json
{
  "today": "2026-03-24",
  "journalEntries": 0,
  "activeFocusSession": false
}
```

**Morning Briefing**: All systems healthy, great day for deep work
**Work Queue**: No urgent items, good time for deep work
**Journal Entry Added**: "Demonstrating MCP server capabilities across the entire ecosystem"

---

## 5. seeds-server (Repository Health & Bookmarks)

**Health Status**: ✅ OK (v1.0.0)
**Seeds Root**: `/home/caraxes/seed`

### Available Tools:

- `mcp13_health_check` - Server health and data store status
- `mcp13_bookmark_add` - Bookmark repository or file
- `mcp13_bookmark_list` - List bookmarks with filters
- `mcp13_ecosystem_scan` - Scan all repositories for health
- `mcp13_ecosystem_trend` - Compare ecosystem snapshots
- `mcp13_repo_detail` - Get detailed health for single repo

### Demo Output:

```json
{
  "reposDetected": 2,
  "bookmarkCount": 5,
  "snapshotCount": 5
}
```

**Ecosystem Scan Results**:

- Overall Score: 92/100
- Total Repos: 7
- Active: 7, Stale: 0
- Issues: 1 (hogsmade has 17 uncommitted changes)

**Repository Health**:

- GRID: 100/100 (Python 3.13+, FastAPI, ChromaDB)
- afloat: 95/100 (TypeScript, Next.js, Stripe)
- echoes: 95/100 (Python 3.12+, FastAPI)
- glimpse-engine: 90/100 (JavaScript)
- apiguard: 95/100 (Python 3.13+)
- Vision: 95/100 (Python)
- hogsmade: 75/100 (TypeScript, Node.js) - 17 uncommitted changes

**Bookmarks**: 5 bookmarks (OS guardrails, security configs, skills)

---

## 6. maintain-server (System Maintenance & Diagnostics)

**Health Status**: ✅ OK (v1.0.0)
**Data Directory**: `/home/caraxes/.maintain-server`

### Available Tools:

- `mcp9_health_check` - Server health and data store status
- `mcp9_cleanup_execute` - Execute cleanup actions
- `mcp9_full_diagnostic` - Run all scans and generate unified report
- `mcp9_report_history` - Query past diagnostic reports
- `mcp9_scan_git_repos` - Scan git repositories for health issues
- `mcp9_scan_system` - Get system-level metrics (RAM, disk, processes)
- `mcp9_scan_temp` - Scan temporary and cache directories
- `mcp9_scan_workspaces` - Scan workspaces for hygiene issues

### Demo Output:

```json
{
  "reportCount": 2,
  "system": {
    "platform": "linux",
    "arch": "x64",
    "uptime": "3d 1h",
    "totalRamGB": 31,
    "freeRamGB": 15,
    "ramUsedPercent": 52
  }
}
```

**System Scan**:

- RAM: 52% used (15GB free of 31GB)
- Disk (/): 87% free (801GB free of 916GB)
- Top Processes: windsurf-next (1.2GB), chrome (951MB), language_server (793MB)

**Temp Scan**: No significant cleanup needed

- /tmp: 375MB, 8013 files
- npm cache: 432MB, 2300 files
- pip cache: 101MB, 815 files

---

## 7. lots-server (Experiment Management)

**Health Status**: ✅ OK (v1.0.0)
**Experiments Directory**: `/home/caraxes/CascadeProjects/experiments`

### Available Tools:

- `mcp8_health_check` - Server health and experiment catalog status
- `mcp8_experiment_compare` - Compare two experiments side by side
- `mcp8_experiment_create` - Register new experiment
- `mcp8_experiment_get` - Get experiment details and results
- `mcp8_experiment_list` - List experiments with filters
- `mcp8_experiment_run` - Execute experiment script
- `mcp8_experiment_suggest` - Generate experiment proposals from patterns

### Demo Output:

```json
{
  "totalExperiments": 0,
  "byStatus": {}
}
```

**Status**: No experiments registered yet (fresh catalog)

---

## 8. grid-server (GATE Deployment & Permissions)

**Health Status**: ✅ OK (v1.0.0)

### Available Tools:

- `mcp7_health_check` - Server health, GATE directory status, deployment targets
- `mcp7_check_permission` - Check if action is permitted on deployment target
- `mcp7_gate_audit` - Query GATE audit log for verification events
- `mcp7_list_targets` - List all GATE deployment targets with permissions
- `mcp7_nonce_status` - Check GATE nonce registry
- `mcp7_validate_envelope` - Validate GATE envelope

### Demo Output:

```json
{
  "gate": {
    "directory": true,
    "incoming": false,
    "auditLog": false,
    "nonceRegistry": true,
    "pendingEnvelopes": 0
  },
  "deploymentTargets": [
    "grid-server",
    "afloat-server",
    "echoes-server",
    "lots-server",
    "experiments"
  ]
}
```

**Deployment Targets**:

- grid-server: deploy, run_tests, start_server, write_results (port 8080)
- afloat-server: deploy, start_server (port 3000)
- echoes-server: deploy, run_tests, start_server, write_results (port 8000)
- lots-server: deploy, run_tests (port 8001)
- experiments: read_only, run_tests, write_results

---

## 9. code-analysis (Python Code Quality)

**Health Status**: ✅ Available
**Workspace**: GRID only

### Available Tools:

- `mcp1_analyze_code` - Analyze Python code for quality issues
- `mcp1_check_security` - Check for security issues
- `mcp1_get_complexity` - Get code complexity metrics

### Demo Output:

⚠️ **Access Restriction**: Only works within GRID workspace root (`/home/caraxes/roots/GRID`)

---

## 10. glimpse-server (Cognitive Data Analysis)

**Health Status**: ✅ Available

### Available Tools:

- `mcp3_glimpse_analyze` - Run full Glimpse pipeline on dataset
- `mcp3_glimpse_complexity` - Detect data complexity level
- `mcp3_glimpse_compress` - Score insight density
- `mcp3_glimpse_confidence` - Create confidence frame and detect gaps
- `mcp3_glimpse_paths` - Evaluate PATH system on session data
- `mcp3_glimpse_session` - Run full Glimpse pipeline on GRID event data
- `mcp3_glimpse_similarity` - Compute fuzzy similarity between dimension values
- `mcp3_glimpse_track` - Track incremental session state

### Demo Output:

```json
{
  "recordCount": 3,
  "entityCount": 3,
  "relationCount": 0,
  "complexity": {
    "level": "simple",
    "factors": {
      "entityCount": 3,
      "relationCount": 0,
      "compositeScore": 0.2
    }
  },
  "confidenceReport": {
    "overallScore": 0,
    "gapCount": 4
  }
}
```

**Analysis**: Simple dataset with 3 events, no relations, low confidence due to missing dimensions

---

## 11. grid-enhanced-tools (Development Workflow Tools)

**Health Status**: ✅ Available

### Available Tools:

- `mcp4_code_quality_gate` - Enforce code quality standards
- `mcp4_dependency_health_monitor` - Monitor dependency health
- `mcp4_documentation_generator` - Generate documentation from code
- `mcp4_performance_profiler` - Profile code execution performance
- `mcp4_security_auditor` - Audit code for security vulnerabilities
- `mcp4_test_coverage_analyzer` - Analyze test coverage
- `mcp4_workflow_orchestrator` - Automate development workflows

### Demo Output:

```json
{
  "success": true,
  "target": "/home/caraxes/CascadeProjects/afloat-server/src",
  "quality_metrics": ["lint", "complexity", "style", "type_check"]
}
```

**Note**: Requires Python tooling (ruff, radon, etc.) - some checks may fail if not installed

---

## 12. grid-rag (Knowledge Base Search)

**Health Status**: ❌ Error
**Issue**: No compatible embedding model found in Ollama

### Available Tools:

- `mcp5_rag_add_document` - Add document to knowledge base
- `mcp5_rag_index` - Index documents from directory
- `mcp5_rag_on_demand` - Query-time RAG with temporary index
- `mcp5_rag_query` - Search knowledge base with AI answers
- `mcp5_rag_search` - Semantic search without AI
- `mcp5_rag_stats` - Get knowledge base statistics

### Fix Required:

```bash
ollama pull nomic-embed-text-v2-moe:latest
```

---

## 13. grid-rag-enhanced (Enhanced RAG with Conversations)

**Health Status**: ❌ Error
**Issue**: Same as grid-rag (Ollama embedding model missing)

### Available Tools:

- `mcp6_create_session` - Create conversation session
- `mcp6_delete_session` - Delete conversation session
- `mcp6_get_session` - Get session information
- `mcp6_get_stats` - Get RAG system statistics
- `mcp6_index_documents` - Index documents for RAG
- `mcp6_query` - Query RAG with conversation support

### Fix Required: Same as grid-rag

---

## 14. portfolio-safety-lens (Portfolio Risk & Governance)

**Health Status**: ❌ Error
**Issue**: Databricks runtime not configured

### Available Tools:

- `mcp11_audit_log_tail` - Get recent security events (hashed IDs)
- `mcp11_governance_lint` - Check portfolio data policy compliance
- `mcp11_portfolio_risk_signal` - Get portfolio risk score and signals
- `mcp11_portfolio_summary_safe` - Get sanitized portfolio metrics

### Fix Required:

Install and configure Coinbase/Databricks runtime

---

## 15. test-runner (Test Discovery & Execution)

**Health Status**: ❌ Error
**Issue**: Path resolution outside GRID workspace

### Available Tools:

- `mcp14_discover_tests` - Discover available test files
- `mcp14_get_test_summary` - Get test summary without running
- `mcp14_run_coverage` - Run tests with coverage report
- `mcp14_run_tests` - Run pytest tests

### Note: Only works within GRID workspace root (`/home/caraxes/roots/GRID`)

---

## Summary

### Working Servers (10/15):

1. ✅ afloat-server - Workflow orchestration
2. ✅ echoes-server - Audit log & telemetry
3. ✅ overview-server - Ecosystem overview
4. ✅ pulse-server - Daily workflow & focus
5. ✅ seeds-server - Repository health & bookmarks
6. ✅ maintain-server - System maintenance
7. ✅ lots-server - Experiment management
8. ✅ grid-server - GATE deployment
9. ✅ code-analysis - Python code quality (GRID only)
10. ✅ glimpse-server - Cognitive data analysis
11. ✅ grid-enhanced-tools - Development workflow tools

### Servers with Issues (5/15):

12. ❌ grid-rag - Missing Ollama embedding model
13. ❌ grid-rag-enhanced - Missing Ollama embedding model
14. ❌ portfolio-safety-lens - Databricks runtime not configured
15. ❌ test-runner - GRID workspace restriction

### Key Capabilities Demonstrated:

- **Workflow Orchestration**: Created and executed demo workflow
- **Audit Trail**: Queryable audit log with statistics
- **Ecosystem Health**: 96/100 overall score across 6 clusters
- **Daily Briefing**: Morning briefing with priorities
- **Repository Management**: 7 repos tracked, 5 bookmarks
- **System Diagnostics**: RAM, disk, process monitoring
- **Experiment Catalog**: Ready for experiment registration
- **GATE Permissions**: 5 deployment targets with permission checks
- **Cognitive Analysis**: Glimpse pipeline for data insights
- **Code Quality**: Multi-metric quality gates

### Recommended Actions:

1. Pull Ollama model: `ollama pull nomic-embed-text-v2-moe:latest`
2. Configure Databricks runtime for portfolio-safety-lens
3. Use test-runner within GRID workspace context

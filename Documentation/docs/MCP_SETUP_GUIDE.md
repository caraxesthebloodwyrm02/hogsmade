# MCP Setup Guide

This guide documents the current MCP layout for CascadeProjects. The active config files are the repo-root `mcp_config.json` and `claude_code_config.json`.

## What is currently registered

### First-party TypeScript MCP servers

| Server               | Purpose                                   | Entry                                               |
| -------------------- | ----------------------------------------- | --------------------------------------------------- |
| `echoes-server`      | Persistent audit and telemetry            | `Tools/MCPServers/echoes-server/src/server.ts`      |
| `grid-server`        | GATE validation and target checks         | `Tools/MCPServers/grid-server/src/server.ts`        |
| `afloat-server`      | Workflow orchestration                    | `Tools/MCPServers/afloat-server/src/server.ts`      |
| `lots-server`        | Experiment catalog and runner             | `Tools/MCPServers/lots-server/src/server.ts`        |
| `maintain-server`    | Cleanup and diagnostics                   | `Tools/MCPServers/maintain-server/src/server.ts`    |
| `pulse-server`       | Briefings, focus, and journal tools       | `Tools/MCPServers/pulse-server/src/server.ts`       |
| `seeds-server`       | Ecosystem snapshots and scans             | `Tools/MCPServers/seeds-server/src/server.ts`       |
| `overview-server`    | Workspace health and checkpoint summaries | `Tools/MCPServers/overview-server/src/server.ts`    |
| `eligibility-server` | Promotion-gate and cycle tools            | `Tools/MCPServers/eligibility-server/src/server.ts` |
| `mangrove-server`    | DIO bridge and security helpers           | `Tools/MCPServers/mangrove-server/src/server.ts`    |
| `glimpse-server`     | Glimpse cognitive-engine tools            | `Tools/MCPServers/glimpse-server/src/server.ts`     |

### GRID Python MCP servers

| Server                  | Purpose                  | Entry                                                                |
| ----------------------- | ------------------------ | -------------------------------------------------------------------- |
| `grid-rag`              | Core GRID RAG server     | `Projects/GRID-main/mcp-setup/server/rag_mcp_server.py`              |
| `grid-rag-enhanced`     | Enhanced RAG server      | `Projects/GRID-main` module `grid.mcp.enhanced_rag_server`           |
| `grid-enhanced-tools`   | GRID tools server        | `Projects/GRID-main/mcp-setup/server/enhanced_tools_mcp_server.py`   |
| `grid-intelligence`     | GRID intelligence server | `Projects/GRID-main` module `grid.mcp.intelligence_server`           |
| `code-analysis`         | Code analysis server     | `Projects/GRID-main/mcp-setup/server/code_analysis_mcp_server.py`    |
| `test-runner`           | Test runner server       | `Projects/GRID-main/mcp-setup/server/test_runner_mcp_server.py`      |
| `portfolio-safety-lens` | Portfolio safety server  | `Projects/GRID-main/mcp-setup/server/portfolio_safety_mcp_server.py` |

Historical references to `mcp-tool-experiment` are archival only and are not active checkout paths in the current tree.

## Current config model

- `mcp_config.json` is the canonical local source of truth for server paths and environment variables
- `claude_code_config.json` mirrors the same workspace layout for Claude Code
- The current namespaced filesystem layout is `Applications/`, `Tools/MCPServers/`, `Projects/`, `Documentation/`, `Components/`, and `Shared/`

## Architecture

```text
CascadeProjects
    |
    +-- Tools/MCPServers/ -------> first-party TypeScript MCP servers
    |
    +-- Projects/GRID-main/ -----> GRID Python MCP servers
    |
    +-- Projects/GATE/ ---------> envelopes, contracts, runtime data
    |
    +-- Applications/ ----------> Glimpse app / engine work
    |
    +-- Components/ ------------> shared packages and utilities
```

## Usage demos

### 1. Audit and telemetry

```text
Use health_check on echoes-server
Use record_audit with source="echoes-server", tool="quick_status", status="success"
Use query_audit with limit=10
Use audit_stats
```

### 2. GATE validation

```text
Use list_targets
Use check_permission with target="echoes-server", action="deploy"
Use validate_envelope with envelope={"targets":["echoes-server"],"actions":["deploy"]}
Use gate_audit with limit=20
Use nonce_status
```

### 3. Afloat workflow server

```text
Use workflow_create with:
name="publish-docs"
description="Validate and publish docs"
steps=[
  {"name":"lint-docs","description":"Lint markdown","command":"npm run lint"},
  {"name":"publish","description":"Publish site","command":"npm run deploy"}
]

Use workflow_list
Use workflow_execute with workflowId="<id>", dryRun=true
Use workflow_history
```

### 4. Lots experiment server

```text
Use experiment_create with:
name="hello-python"
description="Test python execution"
script="print('hello from lots')"
language="python"
tags=["demo","python"]

Use experiment_list
Use experiment_run with experimentId="<id>"
Use experiment_get with experimentId="<id>"
```

## How to use these MCP servers

1. Start with a status tool such as `health_check`, `morning_briefing`, `ecosystem_scan`, or `checkpoint`
2. Inspect before editing
3. Dry-run risky actions where the server supports it
4. Keep examples local and use the current Linux paths from `mcp_config.json`

## Validation

After editing `mcp_config.json`, restart the host application that reads it so the updated server paths take effect.

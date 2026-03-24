# MCP Setup Guide

## What was added

This workspace now has:

- `mcp-tool-experiment/`
  - Primary `echoes` MCP server with safety pipeline
- `echoes-server/`
  - Persistent audit and telemetry MCP server
- `grid-server/`
  - GATE envelope verification MCP server
- `afloat-server/`
  - Workflow orchestration MCP server
- `lots-server/`
  - Experiment runner MCP server

Windsurf configuration was written to:

- `C:\Users\USER\.codeium\windsurf-next\mcp_config.json`

## Registered MCP servers

| Server | Purpose | Entry |
|---|---|---|
| `echoes` | Safety pipeline + productivity tools | `mcp-tool-experiment/src/server.ts` |
| `echoes-server` | Persistent audit and telemetry | `echoes-server/src/server.ts` |
| `grid-server` | GATE validation and deployment target checks | `grid-server/src/server.ts` |
| `afloat-server` | Workflow create/list/execute/history | `afloat-server/src/server.ts` |
| `lots-server` | Experiment create/run/compare | `lots-server/src/server.ts` |
| `maintain-server` | Cleanup, diagnostics, multi-step safety | `maintain-server/src/server.ts` |
| `grid-rag` | Existing GRID RAG server | `e:\grid\mcp-setup\server\grid_rag_mcp_server.py` |
| `grid-enhanced-tools` | Existing GRID tools server | `e:\grid\mcp-setup\server\enhanced_tools_mcp_server.py` |
| `code-analysis` | Existing GRID code analysis | `e:\grid\mcp-setup\server\code_analysis_mcp_server.py` |
| `test-runner` | Existing GRID test runner | `e:\grid\mcp-setup\server\test_runner_mcp_server.py` |
| `portfolio-safety-lens` | Existing GRID portfolio safety server | `e:\grid\mcp-setup\server\portfolio_safety_mcp_server.py` |

Canonical editor server keys come from `mcp_config.json`: `code-analysis` and `test-runner`.
Current Cascade tool names for those servers in this environment are `mcp1_analyze_code`, `mcp1_check_security`, `mcp1_get_complexity`, `mcp14_run_tests`, `mcp14_run_coverage`, `mcp14_discover_tests`, and `mcp14_get_test_summary`.
The numeric `mcpN_` prefix is assigned by the host tool registry, not by the server key or `mcp_config.json`.

## Architecture

```text
Windsurf Cascade
    |
    +-- echoes -----------------> safety pipeline, productivity tools
    |
    +-- echoes-server ----------> persistent audit log + telemetry snapshots
    |
    +-- grid-server ------------> GATE envelope validation + target permission checks
    |
    +-- afloat-server ----------> workflow definitions + execution history
    |
    +-- lots-server ------------> experiment catalog + script execution
    |
    +-- maintain-server -------> cleanup (dry-run → previewToken → execute), diagnostics
    |
    +-- GRID Python MCPs -------> RAG, analysis, testing, portfolio safety
```

## Usage demos

### 1. Echoes server

Ask Cascade:

```text
Use health_check on echoes
Use quick_status for /home/caraxes/CascadeProjects
Use productivity_pulse for /home/caraxes/CascadeProjects
```

### 2. Echoes persistent audit server

```text
Use record_audit with source="echoes", tool="quick_status", status="success"
Use query_audit with limit=10
Use audit_stats
Use save_telemetry with workspace="CascadeProjects", projects=10, activeServers=["echoes","grid-server"]
Use list_telemetry
```

### 3. Grid server

```text
Use list_targets
Use check_permission with target="echoes-server", action="deploy"
Use validate_envelope with envelope={"targets":["echoes-server"],"actions":["deploy"]}
Use gate_audit with limit=20
Use nonce_status
```

### 4. Afloat workflow server

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

### 5. Lots experiment server

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

1. **Start with a status tool.** Use `health_check`, `morning_briefing`, `ecosystem_scan`, or `checkpoint` before deeper work.
2. **Inspect before editing.** Search or read the relevant file first, then make the smallest targeted change.
3. **Dry-run risky actions.** Use `workflow_execute` with `dryRun=true`, `validate_envelope`, or test-run tools before execution.
4. **Keep examples local.** Use the canonical Linux paths from `mcp_config.json` and avoid copying Windows-style paths into new configs.

## CLI validation

The new TypeScript servers were validated with:

```powershell
npm install
npm run build
```

Completed for:

- `echoes-server`
- `grid-server`
- `afloat-server`
- `lots-server`

## Visual walkthrough / presentation outline

If you want to record a short demo video, use this sequence:

1. Open `MCPs` in Windsurf
2. Show `mcp_config.json`
3. Restart Windsurf
4. Ask: `What tools do you have access to?`
5. Demo `echoes` with `quick_status`
6. Demo `echoes-server` with `record_audit` then `query_audit`
7. Demo `grid-server` with `list_targets`
8. Demo `afloat-server` with `workflow_create` then `workflow_execute`
9. Demo `lots-server` with `experiment_create` then `experiment_run`

## Important notes

- Windsurf `mcp_config.json` does **not** support `cwd`
- All local TS MCP servers are registered using:
  - `command: "npx"`
  - `args: ["-y", "tsx", "<absolute path>"]`
- The GRID Python MCPs still depend on the GRID checkout referenced by `mcp_config.json` existing and being runnable
- After editing `mcp_config.json`, you must restart Windsurf to reload MCP servers

## Adding the Pulse-Server to Your Config

To register the new pulse-server, add this entry to your `mcp_config.json`:

```json
{
  "pulse-server": {
    "command": "npx",
    "args": ["-y", "tsx", "/home/caraxes/CascadeProjects/pulse-server/src/server.ts"]
  }
}

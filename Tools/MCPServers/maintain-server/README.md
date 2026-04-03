# Maintain Server

System optimization & maintenance MCP server for development workstations.

## Tools

| Tool              | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `health_check`    | Server status and quick system vitals                                           |
| `scan_temp`       | Scan temp/cache directories for cleanup opportunities                           |
| `scan_workspaces` | Scan dev workspaces for hygiene issues (node_modules, build artifacts, pycache) |
| `scan_git_repos`  | Git repository health (loose objects, stale branches, sync status)              |
| `scan_system`     | RAM, disk volumes, top processes, uptime                                        |
| `full_diagnostic` | Run all scans, produce unified report with health score                         |
| `cleanup_execute` | Execute cleanup actions (dry-run by default, requires confirmation)             |
| `report_history`  | Query past diagnostic reports for trend analysis                                |

## Cleanup Actions

Supported cleanup types:

- `temp_clean` — Purge stale files from temp directories
- `npm_cache` — Run `npm cache clean --force`
- `pip_cache` — Run `pip cache purge`
- `pycache` — Remove `__pycache__` directories recursively
- `build_artifacts` — Remove dist/build directories
- `log_files` — Remove `*.log` files
- `git_gc` — Run `git gc --aggressive` on repos
- `prefetch` — Clean Windows prefetch

## Safety Model

- **Multi-step required:** Step 1: run with `dryRun: true` (default) to get a `previewToken`. Step 2: pass that `previewToken` with `confirmPhrase: "CONFIRM-CLEANUP"` and `dryRun: false` to execute. The token expires in 5 minutes and must match the same actions.
- Single-call execute (no prior dry-run) is rejected.
- Every action is logged to `~/.maintain-server/cleanup-log.json`

## Data Directory

```
~/.maintain-server/
├── config.json          # User-configurable thresholds and targets
├── reports/             # Timestamped diagnostic reports
└── cleanup-log.json     # History of cleanup actions
```

## Usage

```bash
npm install
npm run build
npm test
npx -y tsx src/server.ts
```

## Required Environment

- `CASCADE_WORKSPACE_ROOT`
- `SEEDS_ROOT`

## Optional Environment

- `MAINTAIN_SCAN_ROOTS` comma-separated override for scan targets
- `ECHOES_AUDIT_PATH` override for cleanup audit forwarding

Registered in `mcp_config.json` for MCP clients (Windsurf, Cursor, VS Code).

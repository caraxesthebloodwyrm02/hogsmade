# Windows Task Scheduler

Pulse and Afloat stay MCP tools. Scheduling is handled outside the servers.

## Daily diagnostics

Run this from an elevated PowerShell prompt:

```powershell
cd C:\Users\USER\CascadeProjects\afloat-server
.\scripts\register_windows_task.ps1 -TaskName "CascadeProjects-ScheduledDiagnostics" -Hour 9 -Minute 0
```

## Runtime requirements

The scheduled task expects these environment variables to be available in the user context:

- `CASCADE_WORKSPACE_ROOT`
- `SEEDS_ROOT`
- `ECHOES_AUDIT_PATH`

The task runs `scripts/run_scheduled_diagnostics.ts`, which:

1. Imports `maintain-server`
2. Invokes `full_diagnostic`
3. Saves the diagnostic report through maintain-server
4. Appends a success or failure audit record to the Echoes audit log

# Windows Task Scheduler

Pulse and Afloat stay MCP tools. Scheduling is handled outside the servers.

## Daily diagnostics

Run this from an elevated PowerShell prompt:

```powershell
cd C:\Users\USER\CascadeProjects\afloat-server
.\scripts\register_windows_task.ps1 -TaskName "CascadeProjects-ScheduledDiagnostics" -Hour 9 -Minute 0
```

## Runtime requirements

The scheduled task needs these at execution time:

- `CASCADE_WORKSPACE_ROOT`
- `SEEDS_ROOT`
- `ECHOES_AUDIT_PATH`

**Registration:** `register_windows_task.ps1` reads them from the current PowerShell session and injects them into the task action. Set all three in your session before running the script (e.g. from `.env` or your shell profile), or the script will throw and not register the task.

**Execution:** When the task runs, the same values are set in the task’s process so the run does not depend on ambient user/system environment. The task will fail at runtime if `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`, or `ECHOES_AUDIT_PATH` are not set when the task runs (e.g. if injection was not used at registration).

The task runs `scripts/run_scheduled_diagnostics.ts`, which:

1. Imports `maintain-server`
2. Invokes `full_diagnostic`
3. Saves the diagnostic report through maintain-server
4. Appends a success or failure audit record to the Echoes audit log (via `@cascade/shared-types` audit-client)

**Proving the path:** For full step-by-step E2E verification (register → run task → confirm report + audit line), see [Phase 3 E2E verification guide](./phase3-e2e-verification.md).

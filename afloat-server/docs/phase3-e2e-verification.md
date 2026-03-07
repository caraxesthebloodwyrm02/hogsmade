# Phase 3 E2E Verification Guide

**Goal:** Prove the scheduled diagnostics path works through Windows Task Scheduler (not just when the runner is executed manually).

---

## What success looks like

At the end you should have all three of these:

1. **A registered Windows task** named `CascadeProjects-ScheduledDiagnostics`
2. **A fresh maintain report file** under `~/.maintain-server/reports/`
3. **A fresh audit line** in the Echoes audit file (e.g. `C:\Users\USER\.echoes\audit.ndjson`) with:
   - `source: "afloat-scheduler"`
   - `tool: "scheduled_diagnostics"`

---

## Step 1: Open PowerShell in the correct place

```powershell
Set-Location "C:\Users\USER\CascadeProjects\afloat-server"
```

Verify: `Get-Location` should show `C:\Users\USER\CascadeProjects\afloat-server`.

---

## Step 2: Set the three required environment variables

The registration script reads these and injects them into the scheduled task.

```powershell
$env:CASCADE_WORKSPACE_ROOT = "C:\Users\USER\CascadeProjects"
$env:SEEDS_ROOT = "E:\Seeds"
$env:ECHOES_AUDIT_PATH = "C:\Users\USER\.echoes\audit.ndjson"
```

Verify: `$env:CASCADE_WORKSPACE_ROOT`, `$env:SEEDS_ROOT`, `$env:ECHOES_AUDIT_PATH` each show the expected path.

---

## Step 3: Confirm paths exist before registration

```powershell
Test-Path $env:CASCADE_WORKSPACE_ROOT   # True
Test-Path $env:SEEDS_ROOT              # True
Test-Path (Split-Path $env:ECHOES_AUDIT_PATH -Parent)  # True
```

If the audit file itself does not exist yet, that is usually okay; the shared audit client creates it on first write.

---

## Step 4: Register the task

```powershell
.\scripts\register_windows_task.ps1 -TaskName "CascadeProjects-ScheduledDiagnostics" -Hour 9 -Minute 0
```

**Success:** Script completes without error.  
**Failure:** If an env var is missing you get a clear error, e.g. `Missing required environment variable for scheduled task: SEEDS_ROOT. Set it in this session...`

---

## Step 5: Inspect the registered task

```powershell
Get-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics"
```

You should see `State: Ready`. For full detail: `Get-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics" | Format-List *`

---

## Step 6: Inspect the action command

```powershell
(Get-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics").Actions | Format-List *
```

The action should be a PowerShell command that:

- Sets `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`, `ECHOES_AUDIT_PATH`
- Calls `Set-Location` to the afloat-server (or workspace) directory
- Runs `npx -y tsx scripts/run_scheduled_diagnostics.ts`

**Healthy example shape:**

- `Execute`: powershell.exe  
- `Arguments`: `-NoProfile -ExecutionPolicy Bypass -Command "$env:CASCADE_WORKSPACE_ROOT='...'; $env:SEEDS_ROOT='...'; $env:ECHOES_AUDIT_PATH='...'; Set-Location '...'; npx -y tsx 'scripts\run_scheduled_diagnostics.ts'"`

If the env vars are embedded, the working directory is correct, and the runner path is correct, registration-side environment work is proven.

---

## Step 7: Capture the “before” state

**Latest maintain reports before run:**

```powershell
Get-ChildItem "$env:USERPROFILE\.maintain-server\reports" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 3 FullName, LastWriteTime
```

**Latest audit lines before run:**

```powershell
if (Test-Path $env:ECHOES_AUDIT_PATH) {
  Get-Content $env:ECHOES_AUDIT_PATH -Tail 10
}
```

Use this for before/after comparison.

---

## Step 8: Run the task once manually

**Option A (PowerShell):**

```powershell
Start-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics"
```

**Option B (schtasks):**

```powershell
schtasks /run /tn "CascadeProjects-ScheduledDiagnostics"
```

---

## Step 9: Wait, then check task state

```powershell
Get-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics" | Select-Object TaskName, State
```

You may see `Running` then `Ready`. If it stays `Running` for a long time or returns to `Ready` quickly, continue to artifact checks.

---

## Step 10: Check last run result

```powershell
Get-ScheduledTaskInfo -TaskName "CascadeProjects-ScheduledDiagnostics" | Format-List *
```

**Important:** `LastRunTime`, `LastTaskResult`.  
**Healthy:** `LastTaskResult = 0` (success). Non-zero means the task failed; inspect the runner and env.

---

## Step 11: Check for a fresh maintain report

```powershell
Get-ChildItem "$env:USERPROFILE\.maintain-server\reports" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 5 FullName, LastWriteTime, Length
```

You should see a report newer than your Step 7 baseline.

---

## Step 12: Check for a fresh scheduler audit line

```powershell
Get-Content $env:ECHOES_AUDIT_PATH -Tail 20
```

Look for a new line containing `"source":"afloat-scheduler"`, `"tool":"scheduled_diagnostics"`, `"status":"success"`.

**Success example:**  
`{"timestamp":"...","source":"afloat-scheduler","tool":"scheduled_diagnostics","status":"success","metadata":{"startedAt":"...","reportId":"report-....json","overallScore":...}}`

**Failure example:**  
`"status":"failure"` with `metadata.error` (e.g. missing env at runtime).

---

## Step 13: Verification checklist

E2E proof is complete only if all are true:

| # | Criterion |
|---|-----------|
| A | Task is registered |
| B | Action contains injected env vars |
| C | Task can be started manually |
| D | LastTaskResult = 0 |
| E | New maintain report exists |
| F | New afloat-scheduler audit line exists |

If all six are true, the Phase 3 scheduler path is proven.

---

## Shortest runnable sequence

```powershell
Set-Location "C:\Users\USER\CascadeProjects\afloat-server"

$env:CASCADE_WORKSPACE_ROOT = "C:\Users\USER\CascadeProjects"
$env:SEEDS_ROOT = "E:\Seeds"
$env:ECHOES_AUDIT_PATH = "C:\Users\USER\.echoes\audit.ndjson"

.\scripts\register_windows_task.ps1 -TaskName "CascadeProjects-ScheduledDiagnostics" -Hour 9 -Minute 0

(Get-ScheduledTask -TaskName "CascadeProjects-ScheduledDiagnostics").Actions | Format-List *

schtasks /run /tn "CascadeProjects-ScheduledDiagnostics"

Start-Sleep -Seconds 5

Get-ScheduledTaskInfo -TaskName "CascadeProjects-ScheduledDiagnostics" | Select-Object LastRunTime, LastTaskResult

Get-ChildItem "$env:USERPROFILE\.maintain-server\reports" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName, LastWriteTime

Get-Content $env:ECHOES_AUDIT_PATH -Tail 10
```

---

## Common failure cases

| Symptom | Meaning | Fix |
|---------|--------|-----|
| Registration fails with “Missing required environment variable” | One of the three env vars was not set in the session | Set all three, then rerun registration. |
| Task registers but LastTaskResult ≠ 0 | npx/tsx not available to task, path/quoting, or execution policy | Inspect the action command; run the same PowerShell command manually in an interactive session. |
| Report exists but no audit line | Runner ran but audit write failed | Check ECHOES_AUDIT_PATH directory exists and is writable; confirm path in task action. |
| Audit line exists with status failure | Runner caught an error and emitted a failure event | Inspect `metadata.error` in the last audit line. |

---

## After you run it

To confirm E2E proof, you can share:

- Output of `Get-ScheduledTaskInfo -TaskName "CascadeProjects-ScheduledDiagnostics"`
- Newest report filename (or path)
- Last 5–10 lines of the audit file

Once this passes, the next implementation target is **Phase 3.1** (threshold check + scan_workspaces follow-up). See [Phase 3 next steps](../../docs/plans/2026-03-08-phase3-next-steps.md).

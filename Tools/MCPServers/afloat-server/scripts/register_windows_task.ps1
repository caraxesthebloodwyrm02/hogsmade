param(
  [string]$TaskName = "CascadeProjects-ScheduledDiagnostics",
  [int]$Hour = 9,
  [int]$Minute = 0
)

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "run_scheduled_diagnostics.ts"

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

# Required at runtime by run_scheduled_diagnostics.ts and maintain-server; inject into task so execution does not depend on ambient env.
$required = @(
  @{ Name = "CASCADE_WORKSPACE_ROOT"; Value = $env:CASCADE_WORKSPACE_ROOT },
  @{ Name = "SEEDS_ROOT"; Value = $env:SEEDS_ROOT },
  @{ Name = "ECHOES_AUDIT_PATH"; Value = $env:ECHOES_AUDIT_PATH }
)
foreach ($r in $required) {
  if (-not $r.Value) {
    throw "Missing required environment variable for scheduled task: $($r.Name). Set it in this session (e.g. from .env or shell) before registering the task."
  }
}

# Escape single quotes in values for use inside PowerShell single-quoted strings
$safeWorkspace = ($env:CASCADE_WORKSPACE_ROOT -replace "'", "''")
$safeSeeds = ($env:SEEDS_ROOT -replace "'", "''")
$safeEchoes = ($env:ECHOES_AUDIT_PATH -replace "'", "''")
$safeRunner = ($runnerPath -replace "'", "''")
$safeCd = ($workspaceRoot -replace "'", "''")

$innerCmd = "`$env:CASCADE_WORKSPACE_ROOT='$safeWorkspace'; `$env:SEEDS_ROOT='$safeSeeds'; `$env:ECHOES_AUDIT_PATH='$safeEchoes'; Set-Location '$safeCd'; npx -y tsx '$safeRunner'"

$actionArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  $innerCmd
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($Hour).AddMinutes($Minute))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs maintain-server full_diagnostic via the external CascadeProjects scheduler"

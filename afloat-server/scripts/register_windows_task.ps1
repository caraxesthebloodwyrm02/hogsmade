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

$actionArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "cd '$workspaceRoot'; npx -y tsx '$runnerPath'"
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

Show harness scenario status and threat model confirmation state (data domain).

Usage: /harness-status

1. Call `mcp__harness-server__scenario_list` to list all scenarios with
   their current status (pending / running / complete / failed).
2. Call `mcp__ori-server__get_threat_coverage_heatmap` with threatIdPrefix
   "TM-" to show which threat cells have confirmedVia set.
3. Present as two sections:
   - Scenario table: name | status | last run | signals emitted
   - Threat confirmation table: TM-ID | confirmed? | harnessRunId (truncated)

Flag any scenario still at "pending" after 24h as stale.

Domain: data

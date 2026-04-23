Replay a harness run from the ori notebook.

Usage: /notebook-replay [runId]

If runId is provided, retrieve that specific run result from ori-server using
`mcp__ori-server__get_run_result` with the given runId.

If no runId is provided, first call `mcp__ori-server__list_runs` to show
available runs (most recent first, limit 10), then ask the user which run
to replay.

After retrieving the run result:

1. Display the run summary: scenario name, step count, signals emitted,
   anomaly count, duration, status.
2. Show the confirmation entry if one was written (the run's harnessRunId
   appears in ~/.ori/confirmations/heatmap-confirmations.ndjson for runs
   that confirmed threat model coverage).
3. Offer to show the full log frames if the user wants details.

Output contract: structured prose summary, not raw JSON. Keep it scannable.
One paragraph per section: summary → threat confirmations → anomalies → next steps.

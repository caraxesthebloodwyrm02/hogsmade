# Integration Guide — ori-server

## Transport

ori-server uses **MCP over stdio**. It reads JSON-RPC from stdin and writes
to stdout. Any MCP-compatible client can connect.

## Connecting

### Option A: MCP Inspector (quickest for evaluation)

```bash
npx @modelcontextprotocol/inspector
```

Add ori-server as a stdio transport. You'll need:
- **Command**: `npx tsx <path-to-ori-server>/src/server.ts`
- **Env**: `CASCADE_WORKSPACE_ROOT=<your workspace path>`

### Option B: Editor MCP Config

Add to your editor's MCP server configuration:

```json
{
  "ori-server": {
    "command": "npx",
    "args": ["-y", "tsx", "<path>/src/server.ts"],
    "env": {
      "CASCADE_WORKSPACE_ROOT": "<your-workspace-path>"
    }
  }
}
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `CASCADE_WORKSPACE_ROOT` | Yes | Absolute path to the workspace root |
| `ECHOES_AUDIT_PATH` | No | Path to audit log file (for cross-server reads) |
| `ORI_DATA_DIR` | No | Override data storage directory (default: `~/.ori`) |

A `.env.example` is provided in the ori-server directory with all accepted variables.

---

## First Session — Recommended Sequence

### Step 1: Verify the server is healthy

Call `health_check` with no arguments. You should see:

- `status`: "healthy" or "degraded"
- `tools`: 22
- `circuitState`: "CLOSED" (or "OPEN" if no gate API)

If you see an error here, the server didn't start. Check the build steps.

### Step 2: Browse the project registry

Call `list_projects` with no arguments. This returns the seed data —
a set of pre-configured projects the server knows how to test.

### Step 3: Run a self-test

Call `run_tests` with `{ "projectId": "ori-server" }`.
ori-server will execute its own test suite and classify the output.

Expected result: 100 tests passed, 0 failed.

If the gate is offline (circuit OPEN), this tool will be blocked.
Skip to step 4 and work with pre-collected data instead.

### Step 4: Analyze the output

Call `probe_test_suite` — scans all collected logs for risk patterns.
After a clean test run, expect zero critical findings.

### Step 5: Get recommendations

Call `get_recommendations` — generates read-reason-action items.
After a clean run, zero recommendations is the correct output.

### Step 6: Generate a report

Call `generate_report` — renders a full markdown research report.
Sections with insufficient data are omitted automatically.

---

## Best Practices

### For agents integrating with ori-server

1. **Always start with `health_check`** — verify the server is reachable
   and check the circuit state before attempting guarded tools.

2. **Use `collect_logs` for external data** — if you have test output from
   another source, feed it to ori-server via `collect_logs` for classification.

3. **Use `notebook_add` to persist cross-session context** — observations,
   decisions, and anomalies survive server restarts.

4. **Check `ecosystem_context` for broader signals** — if sibling servers
   are running, this gives you audit trail and ecosystem health data.

5. **Handle degraded mode gracefully** — if `health_check` shows circuit OPEN,
   limit your calls to unguarded tools (collection, analysis, notebook).

### For humans evaluating ori-server

1. **Run the self-test first** — `run_tests` with `projectId: "ori-server"`
   proves the entire pipeline end-to-end in one call.

2. **Compare probe output to recommendations** — probe finds patterns,
   recommendations translate them into action. The gap between them
   is where you'll find design quality signals.

3. **Test the notebook persistence** — add a note, restart the server,
   query for it. This validates data integrity.

4. **Test graceful degradation** — disconnect the gate API and verify
   that read/analysis tools continue to function.

---

## Error Handling

All tools return structured errors. Common patterns:

| Error | Meaning | Response |
|-------|---------|----------|
| Circuit breaker OPEN | Gate API unreachable | Use unguarded tools only |
| Rate limit exceeded | Too many calls in window | Wait and retry |
| Project not found | Invalid projectId | Call `list_projects` to see valid IDs |
| Confirmation required | Destructive operation without phrase | Pass the required confirm string |
| Execution policy denied | Project path outside sandbox | Check workspace root configuration |

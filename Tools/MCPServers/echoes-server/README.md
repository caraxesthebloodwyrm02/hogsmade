# Echoes Server

Persistent audit and analytics MCP server — stores execution logs, provides historical queries, and workspace telemetry.

## Commands

```bash
npm install
# If using local shared-types (workspace root): build it first:
#   cd ../shared-types && npm run build
npm run build
npm test
npm run start
```

## Optional Environment

- `ECHOES_AUDIT_PATH`: override the default `~/.echoes/audit.ndjson` audit log path

## Notes

- Records audit entries from any MCP server pipeline execution.
- Provides precedent-based enforcement with escalation levels (observed → flagged → restricted → blocked).
- Telemetry snapshots support longitudinal workspace tracking.

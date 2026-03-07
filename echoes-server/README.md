# Echoes Server

Persistent audit and telemetry MCP server.

## Commands

```bash
npm install
npm run build
npm test
npm run start
```

## Optional Environment

- `ECHOES_DATA_DIR`: override the default `~/.echoes` data directory
- `ECHOES_AUDIT_PATH`: override the audit log path written and read by integrations

## Notes

- `*.ndjson` audit logs are intentionally operational data and are not tracked in git.
- Other servers can forward audit events directly to `ECHOES_AUDIT_PATH` as a local-first shortcut.

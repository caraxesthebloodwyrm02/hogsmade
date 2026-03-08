# Afloat Server

Workflow orchestration MCP server.

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

- `AFLOAT_DATA_DIR`: override the default `~/.afloat` workflow store

## Notes

- Execution remains dry-run by default.
- Scheduling is handled externally; this server is the workflow executor, not a daemon scheduler.
- Windows Task Scheduler integration lives in [docs/windows-task-scheduler.md](./docs/windows-task-scheduler.md).

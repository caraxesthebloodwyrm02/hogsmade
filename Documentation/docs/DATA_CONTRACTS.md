# Data Contracts

Workspace-level data contracts between MCP servers and shared storage. Treat these as the source of truth for cross-server compatibility.

---

## Echoes audit (NDJSON)

**Location**: Configurable via `ECHOES_AUDIT_PATH`; default `~/.echoes/audit.ndjson`.

**Producers**: Servers such as lots-server and maintain-server append audit events using `@cascade/shared-types` audit-client (`emitAudit`). Echoes-server also writes when tools (e.g. `record_audit`) are invoked.

**Consumers**: echoes-server (`query_audit`, `audit_stats`), pulse-server (morning briefing, correlation).

**Contract**: This is a **temporary local-first shortcut**. Servers write by appending lines to the same NDJSON file; echoes-server does not mediate or validate these writes. The long-term contract may become protocol-level forwarding through echoes-server. For now, direct file append is intentional and acceptable for single-user/local use.

**Format**: One JSON object per line (NDJSON). Each line should conform to the `AuditEvent` schema (timestamp, source, tool, status, optional durationMs, optional metadata).

- Producers may include `metadata.relatedRepo` (string) when the activity is scoped to a single known root.
- Current examples include `lots-server` `experiment_run` and `maintain-server` `cleanup_execute` for single-root runs.
- Producers must omit `metadata.relatedRepo` when the activity spans multiple roots or cannot be mapped confidently.

---

## Seeds ecosystem snapshots

**Location**: Configurable via seeds-server data dir; snapshot files live in a `snapshots/` subdirectory (e.g. `~/.seeds-server/snapshots/` or `SEEDS_DATA_DIR/snapshots/`). Pulse-server reads from `SEEDS_SNAPSHOTS_DIR` (default under same base).

**Producer**: seeds-server `ecosystem_scan` with `saveSnapshot: true`. Files are named like `snapshot-{timestamp}.json`.

**Consumers**: pulse-server `check_alerts`, morning briefing, and `what_should_i_work_on` read the latest snapshot file (by filename sort).

**Contract**: Each snapshot is a JSON object with:

- `overallScore` (number): ecosystem-wide health score.
- `repos` (array): each element has at least `name` (string) and `healthScore` (number). Other fields (e.g. `branch`, `issues`) may be present.

Pulse-server relies on `snapshot.overallScore` and `snapshot.repos[].healthScore` for alerts and prioritization. Do not remove or rename these fields without updating pulse-server.

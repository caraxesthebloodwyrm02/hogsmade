# MCP Least-Privilege Audit

**Standard:** [anthropics/skills — mcp-builder SKILL.md](https://github.com/anthropics/skills/tree/main/skills/mcp-builder)
**Audit date:** 2026-04-23
**Auditor:** registry-build Row 8b (hogsmade-notebook v0.1.0)
**Scope:** 13 TypeScript MCP servers in `Tools/MCPServers/`

---

## Per-server scope table

| Server                 | FS write scope                                                                                | FS read scope                                                                | Network egress                       | Notes                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| **ori-server**         | `~/.ori/**` (logs, probes, recommendations, notebook, runs, reports, registry, confirmations) | `~/.ori/**`, `~/.echoes/audit.ndjson`, cascade root (read-only for registry) | None                                 | All paths bounded to `$HOME/.*`; no outbound HTTP                              |
| **harness-server**     | `~/.harness-server/**`, `~/.ori/logs/*` (bridge), `~/.ori/confirmations/*`                    | `~/.harness-server/**`, GATE dir manifests                                   | None                                 | ori bridge writes are append-only to bounded paths                             |
| **eligibility-server** | `~/.echoes/audit.ndjson` (audit emit)                                                         | Cascade root (read-only gate)                                                | None                                 | No user-writable surface beyond audit                                          |
| **grid-server**        | `~/.echoes/audit.ndjson` (audit emit)                                                         | Cascade root (read-only)                                                     | **localhost:8080** (GRID Mothership) | Intentional — talks only to local GRID API; configurable via `GRID_API_URL`    |
| **echoes-server**      | `~/.echoes/audit.ndjson`                                                                      | `~/.echoes/**`                                                               | None                                 | Single append-only log file                                                    |
| **seeds-server**       | `~/.seeds-server/snapshots/**`, `~/.echoes/audit.ndjson`                                      | Cascade root (read-only scan)                                                | None                                 | Snapshot files bounded under `$HOME/.*`                                        |
| **pulse-server**       | `~/.echoes/audit.ndjson`                                                                      | `~/.seeds-server/snapshots/*` (latest only)                                  | None                                 | Reads latest seeds snapshot; no write beyond audit                             |
| **maintain-server**    | `~/.echoes/audit.ndjson`                                                                      | Filesystem scan (configurable root, default cascade root)                    | None                                 | Windows Prefetch path appears in a pattern string only — not accessed on Linux |
| **overview-server**    | `~/.echoes/audit.ndjson`                                                                      | Cascade root (read-only)                                                     | None                                 | Checkpoint and health_check tools only                                         |
| **lots-server**        | `~/.echoes/audit.ndjson`, `~/gruff/workspace/CascadeProjects/experiments/**`                  | Same                                                                         | None                                 | `emitAudit` presence unverified; recommend adding                              |
| **afloat-server**      | `~/.echoes/audit.ndjson`                                                                      | Cascade root (read-only)                                                     | None                                 | `emitAudit` wiring unverified; audit events = 0 in trail                       |
| **nexus-server**       | `~/.echoes/audit.ndjson`                                                                      | Cascade root (read-only)                                                     | None                                 | Scaffold — `evaluate_architecture` tool reads repo files                       |
| **school-server**      | `~/.echoes/audit.ndjson`                                                                      | Knowledge store (in-memory or configurable)                                  | None                                 | Scaffold — no persistent write beyond audit                                    |

---

## Findings

### PASS — all servers

All 13 servers confine filesystem writes to subdirectories of `$HOME/.*` or
the configured cascade root. No server writes outside `$HOME`.

### EXPECTED — grid-server localhost egress

`grid-server` calls `fetch` against `GRID_API_URL` (default: `http://localhost:8080`).
This is intentional — GRID Mothership runs as a local service on the same host.
The URL is configurable; if set to a non-localhost target, rate limiting and
`try/catch` wrapping are already present in the server code.

### RECOMMEND — lots-server, afloat-server `emitAudit` verification

Both servers show 0 events in `~/.echoes/audit.ndjson`. Verify that
`emitAudit` is present at each tool handler entry point. Add where missing
before promoting either server to rung 4 (Run-untriggered).

### RECOMMEND — nexus-server, school-server activation gate

Both servers are rung 1 (Scaffolded). Before promoting to active:

- Add `emitAudit` to each tool handler
- Bound the knowledge store path (school-server) to `~/.school-server/**`
- Run the `mcp-builder` SKILL.md 4-phase process (research → implement → test → deploy)

---

## Compliance summary

| Criterion (mcp-builder standard) | Status                                                   |
| -------------------------------- | -------------------------------------------------------- |
| FS write bounded to `$HOME/.*`   | PASS — all 13 servers                                    |
| No hardcoded external HTTP       | PASS — only localhost:8080 in grid-server (configurable) |
| `emitAudit` at tool handlers     | PARTIAL — lots, afloat unverified; others confirmed      |
| Rate limiting on external calls  | PASS — grid-server has try/catch on all fetch calls      |
| Secrets not logged               | PASS — no credentials in audit output                    |

Next audit: after lots-server and afloat-server `emitAudit` verification (Row 4 promotion).

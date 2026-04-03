# Phase 1 Execution Summary

**Date**: 2026-03-08  
**Spec**: [2026-03-08-iteration-phases.md](./2026-03-08-iteration-phases.md)  
**Truth docs**: [2026-03-08-status-report.md](./2026-03-08-status-report.md), [SECURITY_STATUS.md](../../SECURITY_STATUS.md)

---

## Wave 0: Baseline Lock — Done

- Execution spec: `docs/plans/2026-03-08-iteration-phases.md`
- Status/security truth: `docs/plans/2026-03-08-status-report.md`, `SECURITY_STATUS.md`
- No parallel feature work started ahead of housekeeping

---

## Wave 1: Phase 1 Housekeeping — Status

### 1.1 Workspace Git History

| Item                             | Status      | Notes                                                                                                      |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `.gitignore` at root             | Done        | Comprehensive; includes `*.ndjson`, editor state, secrets, build artifacts                                 |
| `*.ndjson` intentionally ignored | Done        | Comment in `.gitignore`: "Operational data: audit logs (append-only NDJSON). Intentionally not versioned." |
| First workspace-root commit      | **Pending** | Root has `git init` but **no commits yet**. Create first commit with current tree.                         |

**Next action**: From workspace root, create the first commit (e.g. `git add` per spec, then `git commit -m "chore: initial workspace baseline (Phase 1 housekeeping)"`). Do not start Wave 2 until this exists.

---

### 1.2 Environment Variable Migration

| Server          | Config module   | Required env vars                      | Fail-loud when missing | README         |
| --------------- | --------------- | -------------------------------------- | ---------------------- | -------------- |
| grid-server     | `src/config.ts` | `GATE_DIR`, `CASCADE_WORKSPACE_ROOT`   | Yes                    | Documents both |
| lots-server     | `src/config.ts` | `LOTS_EXPERIMENTS_DIR`                 | Yes                    | Documents it   |
| seeds-server    | `src/config.ts` | `SEEDS_ROOT`                           | Yes                    | Documents it   |
| maintain-server | `src/config.ts` | `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT` | Yes                    | Documents both |

Root `.env.example` exists with: `CASCADE_WORKSPACE_ROOT`, `GATE_DIR`, `LOTS_EXPERIMENTS_DIR`, `SEEDS_ROOT`, optional `GRID_API_URL`, `ECHOES_AUDIT_PATH`, and optional overrides.

**Note**: `maintain-server` has one fixed path `C:\Windows\Prefetch` in `DEFAULT_CONFIG.tempTargets.prefetch`. This is an OS standard location, not a workspace root; no change required for Phase 1.

**Exit criteria met**: All four path-sensitive servers start from env-backed config and fail loudly when required vars are missing.

---

### 1.3 MCP Server Smoke Tests

| Server          | `buildServer()` / testable shape           | Vitest | `tests/smoke.test.ts` | Result       |
| --------------- | ------------------------------------------ | ------ | --------------------- | ------------ |
| echoes-server   | Yes (`buildServer()` in server.ts)         | Yes    | Yes                   | 2 tests pass |
| grid-server     | Config + server; tests use getConfig + env | Yes    | Yes                   | 2 tests pass |
| lots-server     | Config + server; tests use getConfig + env | Yes    | Yes                   | 2 tests pass |
| seeds-server    | Config + server; tests use getConfig + env | Yes    | Yes                   | 2 tests pass |
| maintain-server | Config + server; tests use getConfig + env | Yes    | Yes                   | 2 tests pass |
| pulse-server    | Yes (`buildServer()` in server.ts)         | Yes    | Yes                   | 2 tests pass |
| afloat-server   | Yes (`buildServer()` in server.ts)         | Yes    | Yes                   | 2 tests pass |

**Exit criteria met**: Every MCP server has at least one passing smoke test (tool registration and config/health or tool call).

---

### 1.4 Afloat Consolidation

| Item                                            | Status          | Notes                                                                                                                  |
| ----------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Afloat/` at workspace root                     | **Not present** | Directory list shows `afloat-server/` only; no `Afloat/` folder.                                                       |
| Canonical Afloat location                       | Done            | `CLAUDE.md` and `AGENTS.md` already list only `afloat-server/` as the workflow MCP server.                             |
| Move `Afloat/agents.md` → `afloat-server/docs/` | N/A             | No `Afloat/` to move from. If `Afloat/` is recreated or exists elsewhere, move `agents.md` and remove empty `Afloat/`. |

**Exit criteria met**: Afloat has one canonical location (`afloat-server/`). No duplicate concept at root.

---

### 1.5 SECURITY_STATUS.md

- Present at workspace root.
- Aligned with implementation (implemented vs referenced-but-not-implemented).
- No change required for Phase 1.

---

## shared-types/ and Wave 2

- `shared-types/` **already exists** with: `AuditEvent`, `AuditQuery`, `AuditStatus`, `HealthCheckResponse`, `TelemetrySnapshot`, and `emitAudit` (audit-client).
- Phase 2 spec: create shared-types only for schemas identical in **3+ servers**, starting with `AuditEvent`, `HealthCheckResponse`, `TelemetrySnapshot`.
- **Recommendation**: Treat current `shared-types/` as acceptable Phase 2 scope. Before adding more types, confirm each is used by 3+ servers. Do not extract 2-server-only patterns.

---

## Wave 1 Exit Criteria — Checklist

| Criterion                                                                                       | Met                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------- |
| All 4 path-sensitive servers start from env-backed config without silent machine-layout guesses | Yes                          |
| Every MCP server has at least one passing smoke test                                            | Yes                          |
| Afloat has one canonical location                                                               | Yes (`afloat-server/`)       |
| Workspace root has initial git history                                                          | **No** — create first commit |

---

## Exact Next Actions

1. **Create the first workspace-root commit**
   - Stage files per spec (exclude node_modules, build artifacts, secrets; respect `.gitignore`).
   - Commit with a message that reflects Phase 1 baseline (e.g. initial housekeeping).
   - This unblocks tracking all further work at workspace root.

2. **Optional**: If you later introduce or find an `Afloat/` directory, complete 1.4 by moving `Afloat/agents.md` into `afloat-server/docs/` and removing the empty `Afloat/`.

3. **Do not start Wave 2 (Phase 2 Integration)** until the first commit exists and any final Wave 1 checks (e.g. fresh clone + env from `.env.example` + run all server smoke tests) are satisfied.

---

## Test Commands (Quick Reference)

From workspace root, each server runs its smoke tests with:

```bash
cd <server-dir> && npm run test
```

Servers: `echoes-server`, `grid-server`, `lots-server`, `seeds-server`, `maintain-server`, `pulse-server`, `afloat-server`. All seven passed on 2026-03-08.

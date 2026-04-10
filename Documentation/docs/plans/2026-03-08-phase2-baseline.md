# Phase 2 Baseline Verification

**Date**: 2026-03-08
**Spec**: [2026-03-08-iteration-phases.md](./2026-03-08-iteration-phases.md) (Phase 2)
**Data contracts**: [../DATA_CONTRACTS.md](../DATA_CONTRACTS.md)

---

## Wave 2 baseline status (verified)

### Audit

- **NDJSON shortcut documented as temporary**: [docs/DATA_CONTRACTS.md](../DATA_CONTRACTS.md) states that direct file append to the echoes audit log is a temporary local-first shortcut; echoes-server does not mediate these writes; long-term contract may be protocol-level forwarding.
- **audit-client in use**: lots-server and maintain-server use `@cascade/shared-types` audit-client (`emitAudit`) to append audit events.
- **Correlation metadata in use**: lots-server emits `metadata.relatedRepo` for experiment runs where the repo can be inferred from tags, and maintain-server emits `metadata.relatedRepo` for single-root cleanup runs.

### shared-types

- **Audopted**: `AuditEvent` and `emitAudit` (audit-client) — used by lots-server, maintain-server.
- **Deferred with reason**: `HealthCheckResponse`, `TelemetrySnapshot` — documented in [shared-types/README.md](../../shared-types/README.md) as deferred for Phase 2 close because 3+ server adoption is not complete and forcing adoption now would add schema churn.

### GRID integration

- **grid-server behavior and fallback documented**: [grid-server/README.md](../../grid-server/README.md) describes optional `GRID_API_URL`, the call to `POST .../api/v1/gate/validate` after local checks pass, and fallback when unset or on failure (`approved: true`, `flags: ['grid_unavailable']`).
- **Test added**: grid-server smoke test includes “validate_envelope succeeds with local checks when GRID_API_URL is unset and enhancedValidation is null.”
- **GRID-main endpoint**: Optional and not yet implemented; when implemented, should follow the request/response shape used by grid-server.

### Seeds snapshot contract

- **Documented**: [docs/DATA_CONTRACTS.md](../DATA_CONTRACTS.md) defines the seeds snapshot shape (`overallScore`, `repos[].healthScore`). [seeds-server/README.md](../../seeds-server/README.md) references the contract and states that pulse-server relies on it.
- **Pulse and seeds shapes aligned**: seeds-server writes the expected shape; pulse-server reads it for `check_alerts` and morning briefing.

---

## Exit criteria (Wave 2 baseline slice)

| Criterion                                                                                                       | Met |
| --------------------------------------------------------------------------------------------------------------- | --- |
| Audit shortcut documented as temporary; audit-client in use by lots + maintain; relatedRepo behavior documented | Yes |
| shared-types adoption documented; health/telemetry either adopted broadly or explicitly deferred                | Yes |
| GRID optional behavior documented; test for no GRID / fallback; endpoint deferred                               | Yes |
| Seeds snapshot contract documented; pulse and seeds shapes aligned                                              | Yes |

---

## References

- Execution plan: [2026-03-08-iteration-phases.md](./2026-03-08-iteration-phases.md)
- Phase 1 summary: [2026-03-08-phase1-execution-summary.md](./2026-03-08-phase1-execution-summary.md)
- Data contracts: [../DATA_CONTRACTS.md](../DATA_CONTRACTS.md)

---

## Phase 2 closed (2026-03-08)

All four close criteria met:

1. One failure + one low-health repo → one ranked pulse action (pulse smoke test passing)
2. grid-server validates locally without GRID-main, tests pass
3. DATA_CONTRACTS.md and shared-types README match behavior
4. shared-types health/telemetry adopted in 3+ or deferral documented (deferred with reason in README)

Evidence validated:

- Real seeds snapshot and audit events in `~/.echoes/audit.ndjson`
- `relatedRepo` contract (single-root only, omit when ambiguous) documented in DATA_CONTRACTS.md
- HealthCheckResponse / TelemetrySnapshot deferral and reason documented in shared-types README
- Phase 2 baseline doc and pulse smoke test updated and passing

Further integration (e.g., GRID-main endpoint, broader shared-types adoption, automated workflow orchestration) is out of scope for this close.

---

## Cleanup path blockers for Phase 3

Items to resolve or document before or when starting Phase 3 (scheduled diagnostics, workflow automation) so the path is unblocked:

1. **Scheduled task environment** — **Resolved.**
   `register_windows_task.ps1` now reads `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`, and `ECHOES_AUDIT_PATH` from the current session and injects them into the task action. Registration fails with a clear error if any are missing. The task no longer depends on ambient user/system env at execution time.

2. **Audit consistency** — **Resolved.**
   `run_scheduled_diagnostics.ts` uses the `@cascade/shared-types` audit-client (`emitAudit`); no separate implementation.

3. **Docs**
   [afloat-server/docs/windows-task-scheduler.md](../../afloat-server/docs/windows-task-scheduler.md) already lists the runtime requirements.
   Ensure it states explicitly that the scheduled task will fail at runtime if `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`, and `ECHOES_AUDIT_PATH` are not set in the environment when the task runs.

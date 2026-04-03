# Phase 3 — Next Steps and Actionable Recommendations

**Date**: 2026-03-08  
**Spec**: [2026-03-08-iteration-phases.md](./2026-03-08-iteration-phases.md) (Phase 3)  
**Prerequisite**: [Phase 2 baseline](./2026-03-08-phase2-baseline.md) closed

---

## Current state (in place)

- **Cursor MCP**: `.cursor/mcp.json` exposes maintain-server at workspace level; available in Cursor after reload/restart.
- **Docs**: MCP_SETUP_GUIDE.md includes maintain-server; this doc gives the Phase 3 sequence.
- **Cleanup safety**: `cleanup_execute` uses dry-run → `previewToken` → second call with `confirmPhrase` and that token (multi-step).
- **Scheduled task env**: Resolved — `register_windows_task.ps1` injects `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`, `ECHOES_AUDIT_PATH`; registration fails clearly if any are missing.
- **Runner**: `afloat-server/scripts/run_scheduled_diagnostics.ts` runs maintain-server `full_diagnostic`, saves report, appends one audit line. No threshold/follow-up yet.

**Phase 2**: Closed. **Phase 3 setup**: Largely prepared.

---

## Updated readiness (now resolved)

- **Scheduler audit path**: `run_scheduled_diagnostics.ts` uses `@cascade/shared-types` audit-client; duplicated append path removed.
- **Runtime failure wording**: [afloat-server/docs/windows-task-scheduler.md](../../afloat-server/docs/windows-task-scheduler.md) explicitly covers runtime failure if required env is missing.
- **Runner smoke validation**: Running the runner directly with env set succeeds; report output is produced; audit writes through the shared client.

**Main remaining issue:** Full scheduled-task E2E proof is still pending (register task → trigger via Task Scheduler / schtasks → confirm new maintain report + new afloat-scheduler audit line). That is the only meaningful remaining readiness gap for the Phase 3 scheduler path.

**Remaining non-blocking risk:** previewToken is process-local — acceptable for current single-user local flow; not durable across restart; not multi-session safe. Real limitation but does not block scheduled diagnostics.

---

## Revised major conflicts / issues

1. **Scheduled diagnostics not yet proven via actual Task Scheduler execution** — Use the [Phase 3 E2E verification guide](../../afloat-server/docs/phase3-e2e-verification.md).
2. **previewToken safety flow is in-memory and single-process** — Documented; acceptable for single-user; not durable or multi-session safe.
3. **Scope control** — Do not jump into 3.1 / 3.2 / 3.3 before the scheduled run is proven.

---

## Unresolved risks and limitations (detail)

1. **previewToken is process-local and fragile**
   - `lastPreview` is in-memory; only one preview stored; token expires in 5 minutes; cleared after execute.
   - **Risks**: Server restart between dry-run and execute loses the token; a second dry-run overwrites the first; parallel users/sessions can invalidate each other’s tokens.
   - **Impact**: Acceptable for local single-user use; not durable or multi-session safe.

- **Scheduler E2E**: Registration and env injection are fixed; proof is Task Scheduler run → new report + new audit line. Operational risk: task context, npx/tsx, PATH.
- **Phase 3 scope**: Do not add richer automation, proposal generation, or adaptive briefings before the scheduled runner is proven once.

---

## Next steps (prioritized)

### 1. End-to-end scheduled diagnostics verification (do first)

**Goal**: Prove the Phase 3 scheduler path works via real Task Scheduler execution.

**Best next action:** Complete the real scheduled-task E2E verification using the step-by-step walkthrough:

→ **[Phase 3 E2E verification guide](../../afloat-server/docs/phase3-e2e-verification.md)** — register task, set env, run task once, confirm new maintain report and new afloat-scheduler audit line. Includes checklist, shortest runnable sequence, and common failure cases.

**Success criteria:** Task registered → action contains injected env → LastTaskResult = 0 → new report in `~/.maintain-server/reports/` → new audit line with `source: "afloat-scheduler"`, `tool: "scheduled_diagnostics"`.

---

### 2. ~~Scheduler audit via shared audit client~~ — Done

`run_scheduled_diagnostics.ts` now uses `@cascade/shared-types` audit-client; payload shape unchanged.

---

### 3. ~~Docs: runtime failure wording~~ — Done

windows-task-scheduler.md now states that the task will fail at runtime if required env is not set.

---

### 4. ~~Phase 3.1 — Threshold and cleanup follow-up~~ — Done

**Implemented:** `run_scheduled_diagnostics.ts` reads `SCHEDULED_DIAGNOSTICS_HEALTH_THRESHOLD` from env (default 70; no upper clamp — 101+ forces follow-up). When `overallScore < threshold`, invokes `scan_workspaces` in the same process. Single audit event with optional `followUp` in metadata (triggered, reason, totalReclaimableMB, topReclaimable, recommendation). If `scan_workspaces` fails, follow-up records the error but the overall run still succeeds. No new dependencies or config files.

---

### 5. Phase 3.2 — Pattern-driven experiment suggestions — Done

**Goal**: Local pattern detection in lots-server drives experiment proposals (no GRID API).

| Action         | Detail                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design spike   | Define which GRID-main API (if any) exposes “deviation patterns” or recommendations; define the proposal schema that lots-server can accept (e.g. experiment draft with hypothesis, script template, expected outcome). |
| Policy         | Keep proposals as suggestions or drafts; require explicit user confirmation before auto-registering experiments until quality is proven.                                                                                |
| Implementation | Only after spike: add a flow (e.g. afloat or pulse tool) that calls GRID, maps to a proposal, and either returns it for user approval or writes a draft into lots-server.                                               |

---

### 6. Phase 3.3 — Adaptive morning briefings — Done

**Goal**: Pulse learns from preferences and de-prioritizes or promotes briefing sections.

| Action                      | Detail                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Store preferences           | `~/.pulse/preferences.json` via `briefing_preferences_set` — `skippedBriefingSections`, `promotedSignals`. |
| Use in briefing             | Morning briefing omits skipped sections and reorders priorities/warnings by promoted substrings.           |
| No change to data contracts | Use existing pulse and Echoes data; adaptation is local to pulse.                                          |

---

### 7. Phase 3.4 — “What should I work on?” tool (early thin version)

**Goal**: One pulse-server tool that returns a prioritized list with reasoning.

| Inputs | Seeds health, Echoes audit (recent failures), Afloat workflows (pending), journal/focus history, and optionally GRID patterns. |
| Output | Prioritized list with short reasoning (rules-based is fine for v1). |
| Scope | Can be a new tool that aggregates existing tools (seeds health, audit query, workflow list, etc.) and applies simple ranking rules; GRID pattern integration can be optional. |

**Spec note**: “Prototype in naive rules-based form as soon as Phase 2 cross-referencing exists” — Phase 2 is closed, so this is unblocked.

---

## Summary table

| Priority | Item                                                          | Status |
| -------- | ------------------------------------------------------------- | ------ |
| 1        | E2E scheduled diagnostics verification                        | Done   |
| 2        | Scheduler audit via shared audit-client                       | Done   |
| 3        | Docs: task runtime env failure sentence                       | Done   |
| 4        | Phase 3.1 Threshold + scan_workspaces in runner               | Done   |
| 5        | Pulse `what_should_i_work_on` rules-based improvements        | Done   |
| 6        | Phase 3.2 pattern-driven experiment suggestions (lots-server) | Done   |
| 7        | Phase 3.3 adaptive briefings                                  | Done   |

---

## Recommended order (current)

1. ~~E2E verification~~ — Done.
2. ~~Phase 3.1 (threshold + scan_workspaces)~~ — Done.
3. ~~Pulse `what_should_i_work_on`~~ — Rules-based improvements done.
4. ~~Phase 3.2 (pattern-driven experiments in lots-server)~~ — Done.
5. ~~Phase 3.3 (adaptive briefings)~~ — Done. Phase 3 complete. Next: Phase 4 (visual/dashboard) when desired.

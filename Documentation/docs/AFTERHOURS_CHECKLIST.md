# Afterhours debug sprint — checklist

Use during 90-minute afterhours windows (e.g. 21:00–03:00 Asia/Dhaka). Severity RED = failing tests or production-affecting.

## Before you start

- [ ] Reproduce the failure (exact command + output or steps).
- [ ] Create branch: `fix/red-<short-desc>` (or `fix/<ticket>-<short-desc>`).
- [ ] Timebox: 90 minutes. If unresolved, open follow-up ticket with repro, logs, next steps.

## Fix and verify

- [ ] Minimal change that fixes the repro; add a targeted test.
- [ ] Datetime: store UTC; surface +06:00 in logs/PR where needed.
- [ ] Run linters: `uv run ruff check .` (GRID-main), `npm run lint` (JS/TS projects).
- [ ] Run tests: unit + boundaries (GRID-main); `npm test` (afloat-server, etc.).
- [ ] One simple performance check if relevant (e.g. run a timed test or existing benchmark).

## Before merge

- [ ] CI green (all checks pass).
- [ ] Coverage not decreased.
- [ ] PR ≤ 200 LOC, single responsibility, clear title.
- [ ] Rollback: document revert steps or feature-flag/canary if risky.
- [ ] At least one reviewer sign-off (per project policy).

## Escalation and rollback

- **Who to page**: See project README or on-call doc for the repo.
- **Rollback**: `git revert <merge-commit>` or disable feature flag; redeploy per project runbook.
- **Revert command (example)**: `git revert -m 1 <merge_commit_sha> && git push`

## Post-merge

- [ ] Remove temporary debug instrumentation if any.
- [ ] Update ticket with resolution and any follow-up work.

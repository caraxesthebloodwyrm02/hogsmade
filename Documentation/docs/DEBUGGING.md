# Debugging — CascadeProjects

Short reference for afterhours debug sprints (platform: Cursor, mode: DEBUG). Timebox: 90 minutes; work window 21:00–03:00 Asia/Dhaka (UTC+06:00).

## Reproduce failing behavior

- **GRID-main (Python)**
  - Lint: `cd GRID-main && uv run ruff check .`
  - Unit tests: `cd GRID-main && uv run pytest tests/unit/ -q --tb=short`
  - Boundaries tests: `cd GRID-main && uv run pytest boundaries/tests -q --tb=short`
- **glimpse-artifact**
  - Lint: `cd glimpse-artifact && npm run lint`
  - Build: `cd glimpse-artifact && npm run build`
- **afloat-server**
  - Tests: `cd afloat-server && npm test`
  - Build shared-types first if needed: `cd shared-types && npm run build`

## Key logs and locations

| Project          | Log / artifact              | Location / command                                                                                                                |
| ---------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GRID-main        | Ruff output                 | `uv run ruff check .`                                                                                                             |
| GRID-main        | Transition Gate audit log   | Path set on `TransitionGate(audit_path=...)`; NDJSON lines, UTC + `timestamp_local_+06`                                           |
| glimpse-artifact | GATE view debug strip       | trace id, span id, UTC, local (Asia/Dhaka); console `gate.debug.snapshot_loaded`                                                  |
| GATE             | Envelopes, audit, nonce reg | Workspace root `GATE/` — `incoming/`, `results/`, `audit.ndjson`, `.nonce_registry.json`; see [GATE/README.md](../GATE/README.md) |
| afloat-server    | Vitest output               | `npm test`                                                                                                                        |
| Cursor debug     | Session log file            | See Cursor debug panel / workspace `.cursor` or session-provided path                                                             |

## Cursor session shortcut

Start a focused debug session (example):

```bash
cursor session start --repo . --branch <branch> --mode debug --label "afterhours:red-fix" --tz "Asia/Dhaka" --timebox 90m
```

## Timestamps

- **Store**: UTC (e.g. `datetime.now(UTC).isoformat()` in Python).
- **Surface**: Asia/Dhaka (+06:00) in audit logs and PR notes where applicable (e.g. `timestamp_local_+06` in Transition Gate audit entries).

## See also

- [AFTERHOURS_CHECKLIST.md](AFTERHOURS_CHECKLIST.md) — Escalation, rollback, merge criteria.
- [GIT_REPO.md](GIT_REPO.md) — Branch and commit conventions.

# Afterhours Debugging

## Repro

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. `npm run perf:smoke`

## What changed

- GATE timestamps now store UTC ISO strings and render a fixed `Asia/Dhaka` local annotation as `UTC+06:00`.
- The mock GATE flow now emits deterministic trace and span identifiers for afterhours debugging notes.
- The fast local static gate is `tsc --noEmit`, which is deterministic during afterhours triage.

## Logs to inspect

- Browser console: `gate.debug.snapshot_loaded`
- GATE view debug strip: trace id, span id, UTC timestamp, local `UTC+06:00` timestamp

## Cursor session shortcuts

- `cursor session start --repo /mnt/c/Users/USER/CascadeProjects/glimpse-artifact --branch main --mode debug --label "afterhours:red-fix" --tz "Asia/Dhaka" --timebox 90m`
- `make check`
- `make debug-gate`

## Afterhours checklist

- Page: primary repo owner, then UI maintainer if the GATE panel is blocking release notes or demos.
- Escalate: if `npm run check` fails twice on clean repro, open a follow-up with failing command, console log, and trace id.
- Rollback: revert the last `glimpse-artifact` commit and rerun `npm run build`.

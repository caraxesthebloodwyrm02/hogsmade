---
description: Dispatch a named cascade scheduler routine — list, dry-run, or execute
---

## Available routines

Run the dispatcher with `--list` to show all registered routines:

```bash
python3 ~/.claude/scheduler/dispatch.py --list
```

## Dispatch a routine

Replace `<name>` with one of: `session-gate`, `pipeline-sweep`, `dep-scan`, `remote-sweep`, `ori-health`

### Dry run (validate conditions without executing)

```bash
python3 ~/.claude/scheduler/dispatch.py --routine <name> --dry-run
```

### Execute (respects signal budget and dedupe window)

```bash
python3 ~/.claude/scheduler/dispatch.py --routine <name>
```

### Force execute (skip dedupe window and signal budget)

```bash
python3 ~/.claude/scheduler/dispatch.py --routine <name> --force
```

## Check systemd timer status

```bash
systemctl --user status cascade-pipeline.timer
systemctl --user list-timers --all | grep cascade
```

## Enable / disable pipeline timer

```bash
systemctl --user enable --now cascade-pipeline.timer
systemctl --user disable --now cascade-pipeline.timer
```

## Read last scheduler state

```bash
cat ~/.claude/scheduler/state/session-context.md
ls -la ~/.claude/scheduler/state/
```

## Tail audit trail for scheduler entries

```bash
grep cascade-scheduler ~/.echoes/audit.ndjson | tail -10 | python3 -m json.tool
```

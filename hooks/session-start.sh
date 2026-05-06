#!/usr/bin/env bash
# CascadeProjects/hooks/session-start.sh
# Claude Code SessionStart hook — surfaces the ori notebook welcome summary.
# Also detects Glass-profiled workspaces and surfaces Glass tool reminder.
#
# Prints a compact notebook status to stderr so Claude Code shows it in the
# session header. The message is informational only — no tools are called here.
# The notebook-pilot agent calls notebook_summary at the start of notebook tasks.
#
# For Glass: prints a reminder about glass_session_start tool when .glass-profile.yaml exists.

set -uo pipefail

# Ori notebook status
NOTEBOOK_FILE="${ORI_DATA_DIR:-$HOME/.ori}/notebook/notebook.ndjson"

if [[ ! -f "$NOTEBOOK_FILE" ]]; then
  echo "[hogsmade] ori notebook: empty — first session will initialize it" >&2
else
  python3 << 'PYEOF'
import json, os, pathlib, collections, datetime

nb = pathlib.Path(os.environ.get("ORI_DATA_DIR", os.path.expanduser("~/.ori")) / "notebook" / "notebook.ndjson"
if not nb.exists():
    print("[hogsmade] notebook: (empty)", file=__import__("sys").stderr)
    raise SystemExit(0)

entries = []
for line in nb.read_text(encoding="utf-8", errors="replace").splitlines():
    try:
        entries.append(json.loads(line))
    except Exception:
        continue

counts = collections.Counter(e.get("category", "?") for e in entries)
newest = max((e.get("timestamp", "") for e in entries), default="none")
total = len(entries)

print(
    f"[hogsmade] ori notebook: {total} entr{'y' if total == 1 else 'ies'} "
    f"| newest: {newest[:10]} "
    f"| by category: {dict(counts)}",
    file=__import__("sys").stderr,
)
PYEOF
fi

# Glass profile detection
if [[ -f ".glass-profile.yaml" ]]; then
  echo "[glass] Profile detected in $(pwd). Use glass_session_start tool to initialize Glass field." >&2
elif [[ -f "$HOME/.glass-profile.yaml" ]]; then
  echo "[glass] Global profile detected. Use glass_session_start tool to initialize Glass field." >&2
fi

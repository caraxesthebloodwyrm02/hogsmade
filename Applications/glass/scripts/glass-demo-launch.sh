#!/usr/bin/env bash
# glass-demo-launch.sh — Glass demo initiation routine.
#
# Validates the environment, optionally starts Glass (Electron), runs the
# Python demo sequence driver, then cleans up.
#
# Usage:
#   bash scripts/glass-demo-launch.sh [OPTIONS]
#
# Options:
#   --speed N        Playback speed multiplier passed to glass_demo.py (default: 1.0)
#   --dry-run        Pass --dry-run to glass_demo.py (print JSON, no bridge writes)
#   --no-electron    Skip Electron launch check (CI / headless environments)
#
# Environment:
#   GLASS_BRIDGE_PATH   Override bridge file location
#   GLASS_SKIP_LAUNCH   Set to 1 to skip Electron launch (same as --no-electron)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLASS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE_FILE="${GLASS_BRIDGE_PATH:-$HOME/.caraxes/field-bridge.json}"
BRIDGE_DIR="$(dirname "$BRIDGE_FILE")"
DEMO_SCRIPT="$SCRIPT_DIR/glass_demo.py"
ELECTRON_PID_FILE="$BRIDGE_DIR/.glass-electron.pid"

SPEED="1.0"
DRY_RUN_FLAG=""
SKIP_ELECTRON="${GLASS_SKIP_LAUNCH:-0}"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --speed)       SPEED="$2"; shift 2 ;;
    --dry-run)     DRY_RUN_FLAG="--dry-run"; shift ;;
    --no-electron) SKIP_ELECTRON=1; shift ;;
    *) printf 'Unknown flag: %s\n' "$1" >&2; exit 1 ;;
  esac
done

# ── Output helpers ────────────────────────────────────────────────────────────
ok()   { printf '  \033[0;32m✓\033[0m  %s\n' "$*"; }
warn() { printf '  \033[0;33m⚠\033[0m  %s\n' "$*"; }
err()  { printf '  \033[0;31m✗\033[0m  %s\n' "$*" >&2; }
hr()   { printf '  %s\n' "──────────────────────────────────────────────"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
printf '\n  Glass Demo Launcher\n'
hr

# Python 3
if ! command -v python3 &>/dev/null; then
  err "python3 not found. Install Python 3.11+."
  exit 1
fi
PYTHON_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
ok "Python $PYTHON_VER"

# Demo script
if [[ ! -f "$DEMO_SCRIPT" ]]; then
  err "Demo script not found: $DEMO_SCRIPT"
  exit 1
fi
ok "Demo script: scripts/glass_demo.py"

# npm availability (needed only if launching Electron)
if [[ "$SKIP_ELECTRON" != "1" ]] && ! command -v npm &>/dev/null; then
  warn "npm not found — skipping Electron launch (pass --no-electron to suppress this warning)"
  SKIP_ELECTRON=1
fi

# ── Bridge directory ──────────────────────────────────────────────────────────
mkdir -p "$BRIDGE_DIR"
chmod 700 "$BRIDGE_DIR"
ok "Bridge dir: $BRIDGE_DIR"

# ── Session init — write ground state before Electron opens ──────────────────
INIT_SCRIPT="$SCRIPT_DIR/glass-session-init.sh"
if [[ -x "$INIT_SCRIPT" ]] && command -v jq &>/dev/null; then
  INIT_RESULT=$(bash "$INIT_SCRIPT" "$GLASS_ROOT")
  INIT_SID=$(printf '%s' "$INIT_RESULT" | jq -r '.session_id // "unknown"')
  ok "Session init: $INIT_SID"
else
  warn "glass-session-init.sh or jq unavailable — bridge not pre-initialized"
fi

# ── Electron launch ───────────────────────────────────────────────────────────
ELECTRON_LAUNCHED=0
if [[ "$SKIP_ELECTRON" != "1" ]]; then
  # Check for a running Glass instance via PID file
  if [[ -f "$ELECTRON_PID_FILE" ]]; then
    EXISTING_PID=$(cat "$ELECTRON_PID_FILE")
    if kill -0 "$EXISTING_PID" 2>/dev/null; then
      ok "Glass already running (PID $EXISTING_PID)"
    else
      warn "Stale PID file found — removing"
      rm -f "$ELECTRON_PID_FILE"
    fi
  fi

  if [[ ! -f "$ELECTRON_PID_FILE" ]]; then
    ok "Launching Glass (npm run dev)…"
    cd "$GLASS_ROOT"
    npm run dev &>/dev/null &
    GLASS_PID=$!
    printf '%s' "$GLASS_PID" > "$ELECTRON_PID_FILE"
    ELECTRON_LAUNCHED=1
    ok "Glass launched (PID $GLASS_PID)"
    ok "Waiting 4s for Electron to initialize…"
    sleep 4
    cd - >/dev/null
  fi
else
  warn "Electron launch skipped (--no-electron)"
fi

# ── Run demo sequence ─────────────────────────────────────────────────────────
printf '\n'
hr
printf '  Starting demo sequence (speed=%sx)\n' "$SPEED"
hr
printf '\n'

python3 "$DEMO_SCRIPT" \
  --bridge-path "$BRIDGE_FILE" \
  --speed "$SPEED" \
  $DRY_RUN_FLAG

DEMO_STATUS=$?

# ── Cleanup ───────────────────────────────────────────────────────────────────
hr
if [[ $DEMO_STATUS -eq 0 ]]; then
  ok "Demo finished cleanly."
elif [[ $DEMO_STATUS -eq 130 ]]; then
  warn "Demo interrupted by user."
else
  err "Demo exited with status $DEMO_STATUS."
fi

# If we launched Electron for the demo, leave it running for inspection.
# The user can stop it manually with: kill $(cat ~/.caraxes/.glass-electron.pid)
if [[ $ELECTRON_LAUNCHED -eq 1 ]]; then
  printf '\n'
  warn "Glass (Electron) is still running. To stop it:"
  printf '       kill $(cat %s)\n\n' "$ELECTRON_PID_FILE"
fi

exit $DEMO_STATUS

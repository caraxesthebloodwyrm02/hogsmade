#!/usr/bin/env bash
# CascadeProjects/scripts/hogsmade-driver.sh
# Hogsmade autonomous driver — invoked by hogsmade-driver.timer (systemd user).
#
# Schedule:
#   Twice-daily  → ecosystem_scan (seeds snapshot via MCP)
#   Once-daily   → harness_run over all 4 scenarios
#
# The timer passes RUN_MODE=scan|harness|full via the service Environment.
# Default (full) runs both.
#
# MCP tools are called via `claude --mcp-tool` (Claude Code CLI one-shot mode).
# If that's not available the script falls back to a logged skip so the timer
# keeps firing without errors.

set -uo pipefail

CASCADE_ROOT="${CASCADE_WORKSPACE_ROOT:-$HOME/gruff/workspace/CascadeProjects}"
LOG_DIR="${ORI_DATA_DIR:-$HOME/.ori}/driver-logs"
LOG_FILE="$LOG_DIR/$(date -u +%Y-%m-%d).log"
RUN_MODE="${RUN_MODE:-full}"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

run_ecosystem_scan() {
  log "START ecosystem_scan (saveSnapshot=true)"
  if command -v claude &>/dev/null; then
    # Claude Code CLI one-shot tool call
    claude --print --output-format json \
      "Call mcp__seeds-server__ecosystem_scan with saveSnapshot true" \
      >> "$LOG_FILE" 2>&1 \
      && log "DONE ecosystem_scan" \
      || log "WARN ecosystem_scan returned non-zero"
  else
    log "SKIP ecosystem_scan — claude CLI not found"
  fi
}

run_harness_scenarios() {
  log "START harness_run (all scenarios)"
  for scenario in bastiodon talonflame exeggutor-a; do
    log "  scenario: $scenario"
    if command -v claude &>/dev/null; then
      claude --print --output-format json \
        "Call mcp__harness-server__harness_run with scenarioId $scenario" \
        >> "$LOG_FILE" 2>&1 \
        && log "  DONE $scenario" \
        || log "  WARN $scenario returned non-zero"
    else
      log "  SKIP $scenario — claude CLI not found"
    fi
  done
  log "DONE harness_run"
}

log "hogsmade-driver start (mode=$RUN_MODE)"

case "$RUN_MODE" in
  scan)
    run_ecosystem_scan
    ;;
  harness)
    run_harness_scenarios
    ;;
  full|*)
    run_ecosystem_scan
    run_harness_scenarios
    ;;
esac

log "hogsmade-driver complete"

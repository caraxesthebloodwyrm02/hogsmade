#!/usr/bin/env bash
# glass-session-init.sh — Active session lifecycle initialization.
#
# Detects .glass-profile.yaml in the workspace, writes initial bridge state.
# Called by hooks (UserPromptSubmit, session-start) or manually.
#
# Usage:
#   glass-session-init.sh [workspace_path]
#
# If workspace_path is omitted, uses CWD.
# Requires: jq

set -euo pipefail

WORKSPACE="${1:-$(pwd)}"
BRIDGE_FILE="${GLASS_BRIDGE_PATH:-$HOME/.caraxes/field-bridge.json}"
BRIDGE_DIR="$(dirname "$BRIDGE_FILE")"
PROFILE_FILE="${WORKSPACE}/.glass-profile.yaml"

# Ensure bridge directory exists
mkdir -p "$BRIDGE_DIR"

# Generate session ID
LABEL="$(basename "$WORKSPACE")-$(date -u +%Y%m%dT%H%M)"
SID="${LABEL}-$(head -c 4 /dev/urandom | xxd -p)"

# Build initial state
INITIAL_STATE=$(cat <<EOF
{
  "session_id": "$SID",
  "agent_state": "idle",
  "threshold_state": "ground",
  "progress": 0,
  "blocks": [],
  "conversation": [],
  "voices": [],
  "signals": {
    "git_diff_lines": 0,
    "iteration_count": 0,
    "session_age_minutes": 0
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

# If bridge file exists, preserve blocks (workspace continuity)
if [ -f "$BRIDGE_FILE" ]; then
  EXISTING_BLOCKS=$(jq -c '.blocks // []' "$BRIDGE_FILE" 2>/dev/null || echo '[]')
  INITIAL_STATE=$(echo "$INITIAL_STATE" | jq --argjson blocks "$EXISTING_BLOCKS" '.blocks = $blocks')
fi

# Atomic write
TMP="${BRIDGE_FILE}.tmp.$$"
echo "$INITIAL_STATE" | jq '.' > "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$BRIDGE_FILE"

# Report
echo "{\"ok\":true,\"session_id\":\"$SID\",\"bridge\":\"$BRIDGE_FILE\",\"profile_detected\":$([ -f "$PROFILE_FILE" ] && echo true || echo false)}"

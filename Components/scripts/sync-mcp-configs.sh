#!/usr/bin/env bash
# sync-mcp-configs.sh
# Regenerate live MCP tool configs from the canonical mcp_config.example.json.
#
# Usage:
#   sync-mcp-configs.sh [OPTIONS]
#
# Options:
#   --dry-run                Print diffs without writing any files.
#   --cascade-root=PATH      Override the CascadeProjects root directory.
#                            Default: two levels above this script's location.
#   --windsurf-config=PATH   Override Windsurf config path (for CI/testing).
#   --claude-config=PATH     Override Claude Code config path (for CI/testing).
#   --skip-windsurf          Skip Windsurf config.
#   --skip-claude            Skip Claude Code config.
#
# Exit codes:
#   0  All configured targets succeeded (or were skipped).
#   1  One or more targets failed validation or write.
#
# See Documentation/docs/mcp-config-sync.md for the full runbook.

set -uo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASCADE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WINDSURF_CONFIG="$HOME/.codeium/windsurf/mcp_config.json"
CLAUDE_CONFIG="$HOME/.claude.json"
DRY_RUN=false
SKIP_WINDSURF=false
SKIP_CLAUDE=false
STAMP=$(date +%Y%m%d-%H%M%S)

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run)              DRY_RUN=true ;;
    --skip-windsurf)        SKIP_WINDSURF=true ;;
    --skip-claude)          SKIP_CLAUDE=true ;;
    --cascade-root=*)       CASCADE_ROOT="${arg#*=}" ;;
    --windsurf-config=*)    WINDSURF_CONFIG="${arg#*=}" ;;
    --claude-config=*)      CLAUDE_CONFIG="${arg#*=}" ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

CANONICAL="$CASCADE_ROOT/mcp_config.example.json"

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
for cmd in jq sed python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: required command not found: $cmd" >&2; exit 1; }
done

if [[ ! -f "$CANONICAL" ]]; then
  echo "ERROR: canonical not found: $CANONICAL" >&2
  exit 1
fi

CANONICAL_COUNT=$(jq '.mcpServers | keys | length' "$CANONICAL")
echo "Canonical: $CANONICAL ($CANONICAL_COUNT servers)"
$DRY_RUN && echo "Mode: DRY RUN — no files will be written"

# ---------------------------------------------------------------------------
# generate_mcpservers  →  stdout: JSON object  { "server-name": { … }, … }
# Substitutes $HOME/CascadeProjects and $HOME with absolute paths.
# ---------------------------------------------------------------------------
generate_mcpservers() {
  sed \
    -e "s|\\\$HOME/CascadeProjects|$CASCADE_ROOT|g" \
    -e "s|\\\$HOME|$HOME|g" \
    "$CANONICAL" \
    | jq '.mcpServers'
}

generate_mcpservers_no_cwd() {
  generate_mcpservers | jq 'with_entries(
    .value |= (
      if (.command | type == "string") and (.command | startswith("/")) and has("cwd") then
        . as $entry
        | .args = ((.args // []) | map(
          if (type == "string") and (startswith("-") | not) and (startswith("/") | not) then
            ($entry.cwd + "/" + .)
          else
            .
          end
        ))
        | del(.cwd)
      else
        .
      end
    )
  )'
}

# ---------------------------------------------------------------------------
# validate_config FILE LABEL
# Checks: 0 legacy /home/caraxes refs in mcpServers, key count/set match canonical,
#         all referenced binary/script paths exist on disk.
# Returns 0 on pass, 1 on any failure (does not exit).
# ---------------------------------------------------------------------------
validate_config() {
  local file="$1" label="$2"
  local allow_extras="${3:-false}"
  local ok=true

  # 1. No legacy /home/caraxes paths inside mcpServers
  local legacy_hits
  legacy_hits=$(jq '[.mcpServers | to_entries[]
    | select((.value | tostring) | contains("\"/home/caraxes/"))] | length' "$file")
  if [[ "$legacy_hits" -gt 0 ]]; then
    echo "  FAIL [$label] $legacy_hits mcpServers entries contain legacy '/home/caraxes/' path" >&2
    ok=false
  fi

  # 2. Server count matches canonical
  local actual_count
  actual_count=$(jq '.mcpServers | keys | length' "$file")
  if $allow_extras; then
    if [[ "$actual_count" -lt "$CANONICAL_COUNT" ]]; then
      echo "  FAIL [$label] server count: expected at least $CANONICAL_COUNT, got $actual_count" >&2
      ok=false
    fi
  elif [[ "$actual_count" != "$CANONICAL_COUNT" ]]; then
    echo "  FAIL [$label] server count: expected $CANONICAL_COUNT, got $actual_count" >&2
    ok=false
  fi

  # 3. Canonical key set is present
  local key_diff
  if $allow_extras; then
    key_diff=$(comm -23 \
      <(jq -r '.mcpServers | keys[]' "$CANONICAL" | sort) \
      <(jq -r '.mcpServers | keys[]' "$file" | sort) 2>&1) || true
  else
    key_diff=$(diff \
      <(jq -r '.mcpServers | keys[]' "$CANONICAL" | sort) \
      <(jq -r '.mcpServers | keys[]' "$file" | sort) 2>&1) || true
  fi
  if [[ -n "$key_diff" ]]; then
    echo "  FAIL [$label] server key mismatch:" >&2
    echo "$key_diff" | head -10 >&2
    ok=false
  fi

  # 4. All binary / script paths exist on disk
  local missing
  missing=$(python3 - "$file" <<'PYEOF'
import json, os, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
for name, entry in cfg.get("mcpServers", {}).items():
    cmd = entry.get("command", "")
    args = entry.get("args", [])
    path = args[-1] if cmd == "npx" and args else cmd
    if not os.path.exists(path):
        print(f"{name}: {path}")
PYEOF
)
  if [[ -n "$missing" ]]; then
    echo "  FAIL [$label] missing paths on disk:" >&2
    echo "$missing" | sed 's/^/    /' >&2
    ok=false
  fi

  $ok && return 0 || return 1
}

# ---------------------------------------------------------------------------
# sync_windsurf
# ---------------------------------------------------------------------------
sync_windsurf() {
  echo ""
  echo "=== Windsurf ==="

  if $SKIP_WINDSURF; then
    echo "  SKIP (--skip-windsurf)"
    return 0
  fi

  if [[ ! -f "$WINDSURF_CONFIG" ]]; then
    echo "  SKIP: config not found at $WINDSURF_CONFIG"
    return 0
  fi

  local tmp
  tmp=$(mktemp /tmp/mcp-sync-windsurf-XXXXXX.json)

  local mcp_block
  mcp_block=$(generate_mcpservers_no_cwd)
  printf '{"mcpServers":%s}\n' "$mcp_block" | jq . > "$tmp"

  if $DRY_RUN; then
    echo "  [dry-run] target: $WINDSURF_CONFIG"
    echo "  Servers: $(jq '.mcpServers | keys | length' "$tmp")"
    diff "$WINDSURF_CONFIG" "$tmp" | head -40 || true
    rm -f "$tmp"
    return 0
  fi

  if ! validate_config "$tmp" "windsurf-new"; then
    rm -f "$tmp"
    echo "  ABORT: validation failed, original file untouched" >&2
    return 1
  fi

  cp "$WINDSURF_CONFIG" "${WINDSURF_CONFIG}.pre-regen-${STAMP}.bak"
  echo "  Backup: ${WINDSURF_CONFIG}.pre-regen-${STAMP}.bak"
  mv "$tmp" "$WINDSURF_CONFIG"
  echo "  Written: $WINDSURF_CONFIG"

  if validate_config "$WINDSURF_CONFIG" "windsurf"; then
    echo "  Validation: PASS"
    return 0
  else
    echo "  WARN: post-write validation failed" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# sync_claude
# Splices mcpServers into ~/.claude.json without touching other user fields.
# ---------------------------------------------------------------------------
sync_claude() {
  echo ""
  echo "=== Claude Code ==="

  if $SKIP_CLAUDE; then
    echo "  SKIP (--skip-claude)"
    return 0
  fi

  if [[ ! -f "$CLAUDE_CONFIG" ]]; then
    echo "  SKIP: config not found at $CLAUDE_CONFIG"
    return 0
  fi

  local mcp_block
  mcp_block=$(generate_mcpservers)

  local tmp
  tmp=$(mktemp /tmp/mcp-sync-claude-XXXXXX.json)
  jq --argjson mcp "$mcp_block" \
    '. as $root
     | ($mcp | keys) as $canonicalKeys
     | .mcpServers = (
         $mcp + (($root.mcpServers // {}) | with_entries(select(.key as $k | ($canonicalKeys | index($k)) | not)))
       )
     | .mcpServersDisabled = {}' \
    "$CLAUDE_CONFIG" > "$tmp"

  if $DRY_RUN; then
    echo "  [dry-run] target: $CLAUDE_CONFIG"
    echo "  Servers: $(jq '.mcpServers | keys | length' "$tmp")"
    echo "  Disabled after: $(jq '.mcpServersDisabled | keys | length' "$tmp")"
    diff \
      <(jq '.mcpServers' "$CLAUDE_CONFIG") \
      <(jq '.mcpServers' "$tmp") | head -40 || true
    rm -f "$tmp"
    return 0
  fi

  if ! validate_config "$tmp" "claude-new" true; then
    rm -f "$tmp"
    echo "  ABORT: validation failed, original file untouched" >&2
    return 1
  fi

  cp "$CLAUDE_CONFIG" "${CLAUDE_CONFIG}.pre-regen-${STAMP}.bak"
  echo "  Backup: ${CLAUDE_CONFIG}.pre-regen-${STAMP}.bak"
  mv "$tmp" "$CLAUDE_CONFIG"
  echo "  Written: $CLAUDE_CONFIG"

  if validate_config "$CLAUDE_CONFIG" "claude" true; then
    echo "  Validation: PASS"
    return 0
  else
    echo "  WARN: post-write validation failed" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
ERRORS=0

sync_windsurf || ERRORS=$((ERRORS + 1))
sync_claude   || ERRORS=$((ERRORS + 1))

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "RESULT: FAILED ($ERRORS target(s) with errors)" >&2
  exit 1
fi

echo "RESULT: OK"

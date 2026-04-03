#!/usr/bin/env bash
# Read-only git hygiene snapshot: CascadeProjects root, GRID submodule, optional extra repos.
# Usage (from anywhere):
#   bash Components/scripts/ecosystem-git-status.sh
#   bash Components/scripts/ecosystem-git-status.sh --warn-only
# Extra roots (colon-separated absolute paths):
#   CASCADE_ECOSYSTEM_GIT_ROOTS="/home/you/canopy/afloat:/home/you/roots/GRID"

set -euo pipefail

WARN_ONLY=0
if [[ "${1:-}" == "--warn-only" ]]; then
  WARN_ONLY=1
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKSPACE_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

is_clean() {
  local root=$1
  local name=$2
  # Submodules often use a .git *file* (gitdir pointer), not a directory.
  if [[ ! -e "$root/.git" ]]; then
    echo "[$name] skip (not a git repo): $root"
    return 0
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$name] $root"
  git -C "$root" status -sb
  local porcelain
  porcelain=$(git -C "$root" status --porcelain 2>/dev/null || true)
  if [[ -n "$porcelain" ]]; then
    echo "[$name] NOT CLEAN (see porcelain above)"
    return 1
  fi
  echo "[$name] clean"
  return 0
}

failures=0

if ! is_clean "$WORKSPACE_ROOT" "hogsmade (CascadeProjects)"; then
  ((failures++)) || true
fi

GRID_ROOT="$WORKSPACE_ROOT/Projects/GRID-main"
if [[ -e "$GRID_ROOT/.git" ]]; then
  if ! is_clean "$GRID_ROOT" "GRID (Projects/GRID-main submodule)"; then
    ((failures++)) || true
  fi
else
  echo "[GRID] skip (no checkout): $GRID_ROOT"
fi

# Default optional: canonical afloat clone layout from Mangrove docs
DEFAULT_EXTRAS=""
if [[ -e "${HOME}/canopy/afloat/.git" ]]; then
  DEFAULT_EXTRAS="${HOME}/canopy/afloat"
fi

IFS=':' read -r -a EXTRA_ROOTS <<< "${CASCADE_ECOSYSTEM_GIT_ROOTS:-}"
if [[ ${#EXTRA_ROOTS[@]} -eq 0 || -z "${EXTRA_ROOTS[0]:-}" ]]; then
  if [[ -n "$DEFAULT_EXTRAS" ]]; then
    EXTRA_ROOTS=("$DEFAULT_EXTRAS")
  fi
fi

for raw in "${EXTRA_ROOTS[@]}"; do
  [[ -z "$raw" ]] && continue
  root=$(cd "$raw" && pwd)
  if ! is_clean "$root" "extra ($(basename "$root"))"; then
    ((failures++)) || true
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$failures" -eq 0 ]]; then
  echo "Summary: all reported repos clean ($failures failures)."
  exit 0
fi

echo "Summary: $failures repo(s) not clean. Parent may still show clean if GRID has ignore=dirty in .gitmodules."
if [[ "$WARN_ONLY" -eq 1 ]]; then
  exit 0
fi
exit 1

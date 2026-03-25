#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "== verify_mcp_inventory =="
python3 "${SCRIPT_DIR}/verify_mcp_inventory.py" --cascade-root "${REPO_ROOT}"

run_npm_package() {
  local dir="$1"
  shift
  echo "== ${dir} =="
  (
    cd "$dir"
    npm ci
    for cmd in "$@"; do
      echo "\$ ${cmd}"
      eval "${cmd}"
    done
    # Run lint if the package has a lint script
    if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.lint ? 0 : 1)" 2>/dev/null; then
      echo "\$ npm run lint"
      npm run lint
    fi
  )
}

run_npm_package "shared-types" "npm run build"
run_npm_package "shared-resilience" "npm run build"
run_npm_package "shared-pipeline" "npm run build"
run_npm_package "eligibility-server" "npm run build" "npm test"

for dir in \
  "afloat-server" \
  "echoes-server" \
  "grid-server" \
  "lots-server" \
  "maintain-server" \
  "pulse-server" \
  "seeds-server"
do
  run_npm_package "$dir" "npm run build" "npm test"
done

run_npm_package "glimpse-artifact" "npm run check"

echo "== glimpse-engine =="
(
  cd "glimpse-engine"
  npm ci
)
node --test tests/glimpse-engine.test.mjs

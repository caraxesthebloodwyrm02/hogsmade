#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "== verify_mcp_inventory =="
python3 "${SCRIPT_DIR}/verify_mcp_inventory.py" --cascade-root "${REPO_ROOT}"

export NODE_OPTIONS='--max-old-space-size=2048'

echo "== npm ci (root workspace) =="
(cd "${REPO_ROOT}" && npm ci)

run_npm_package() {
  local dir="$1"
  shift
  echo "== ${dir} =="
  (
    cd "$dir"
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

run_npm_package "${REPO_ROOT}/Components/shared-types" "npm run build"
run_npm_package "${REPO_ROOT}/Components/shared-resilience" "npm run build"
run_npm_package "${REPO_ROOT}/Components/shared-pipeline" "npm run build"
# MCP server tsc builds OOM on standard GitHub Actions runners (7GB RAM) due to
# MCP SDK type resolution (~3GB per tsc invocation). Vitest handles its own
# transpilation, so tests work without a prior tsc build. Run tests only.
for dir in \
  "eligibility-server" \
  "afloat-server" \
  "echoes-server" \
  "glimpse-server" \
  "grid-server" \
  "lots-server" \
  "maintain-server" \
  "mangrove-server" \
  "overview-server" \
  "pulse-server" \
  "seeds-server"
do
  echo "== ${dir} (tests only) =="
  (cd "${REPO_ROOT}/Tools/MCPServers/$dir" && npm test)
done

run_npm_package "${REPO_ROOT}/Applications/glimpse-artifact" "npm run check"

echo "== glimpse-engine =="
node --test "${REPO_ROOT}/Components/tests/glimpse-engine.test.mjs"

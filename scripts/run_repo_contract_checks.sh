#!/usr/bin/env bash
set -euo pipefail

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
node --test tests/glimpse-engine.test.mjs

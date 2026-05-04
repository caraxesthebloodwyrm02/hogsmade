#!/usr/bin/env bash
# scripts/verify-asset-pipeline.sh
# Automates the validation of the 3D semantic asset pipeline.
# Ensures contract parity, tests the asset/ledger boundary, and inspects the durable inventory.

set -euo pipefail

# Find repository root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHARED_TYPES_DIR="$ROOT_DIR/Components/shared-types"
GLASS_SERVER_DIR="$ROOT_DIR/Tools/MCPServers/glass-server"
GLASS_APP_DIR="$ROOT_DIR/Applications/glass"

require_dir() {
  local dir="$1"
  local label="$2"
  if [ ! -d "$dir" ]; then
    echo "Error: $label directory not found: $dir" >&2
    echo "Hint: run this script from a valid Glass checkout." >&2
    exit 1
  fi
}

require_dir "$SHARED_TYPES_DIR" "@cascade/shared-types"
require_dir "$GLASS_SERVER_DIR" "glass-server"
require_dir "$GLASS_APP_DIR" "glass app"

echo "=== 1. Building Core Dependencies ==="
echo "Building @cascade/shared-types..."
cd "$SHARED_TYPES_DIR"
npm run build

echo "Building glass-server..."
cd "$GLASS_SERVER_DIR"
npm run build

echo "=== 2. Running Targeted Asset & Ledger Test Suites ==="
# Shared Types
echo ">>> [shared-types] Testing Magnetism & Ledger Contracts..."
cd "$SHARED_TYPES_DIR"
npx vitest run tests/signal-model.test.ts tests/memory-ledger.test.ts

# Glass Server
echo ">>> [glass-server] Testing Asset Minting & Persistence Gates..."
cd "$GLASS_SERVER_DIR"
npx vitest run src/server.test.ts

# Glass App
echo ">>> [glass app] Testing Rarity Gates & Renderer Integration..."
cd "$GLASS_APP_DIR"
npx vitest run bridge/schema.test.ts src/renderer/blocks/AssetBlock.test.ts src/main/bridge-watcher.test.ts

echo "=== 3. Inspecting Durable Inventory Ledger ==="
INVENTORY_FILE="${GLASS_INVENTORY_PATH:-$HOME/.caraxes/glass-inventory.json}"
if [ -f "$INVENTORY_FILE" ]; then
  ASSET_COUNT=$(jq '.assets | length' "$INVENTORY_FILE" 2>/dev/null || echo "0")
  echo "Inventory ledger found at $INVENTORY_FILE"
  echo "Total persistent assets: $ASSET_COUNT"
  if [ "$ASSET_COUNT" -gt 0 ]; then
    echo "Latest 3 assets:"
    jq -r '.assets[-3:] | .[] | "  - \(.rarity | ascii_upcase) \(.category | ascii_upcase): \(.label) [\(.ledger_id)]"' "$INVENTORY_FILE"
  fi
else
  echo "No inventory ledger found at $INVENTORY_FILE (expected if no assets minted yet)."
fi

echo "=== Pipeline Verification Complete ==="

#!/bin/bash
# Security Hardening Verification Script
# Run this to verify all hardening changes are in place
# Date: 2026-03-30T16:15:00Z

set -e

echo "=== Security Hardening Verification ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNED=0

# Function to check file contains text
check_file_contains() {
    local file="$1"
    local text="$2"
    local description="$3"

    if [ -f "$file" ]; then
        if grep -q "$text" "$file"; then
            echo -e "${GREEN}✓${NC} $description"
            ((PASSED++))
        else
            echo -e "${RED}✗${NC} $description - File: $file"
            ((FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} $description - File not found: $file"
        ((WARNED++))
    fi
}

# Function to check file exists
check_file_exists() {
    local file="$1"
    local description="$2"

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description - File not found: $file"
        ((FAILED++))
    fi
}

# Function to check directory exists
check_dir_exists() {
    local dir="$1"
    local description="$2"

    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description - Directory not found: $dir"
        ((FAILED++))
    fi
}

echo "--- Tool-Specific Rules ---"
check_file_contains ".windsurfrules" "Network Isolation (UNPROVISIONED MODE)" "Windsurf rules updated"
check_file_contains ".cursorrules" "Network Isolation (UNPROVISIONED MODE)" "Cursor rules updated"
check_file_contains ".cursor/rules/dev-rules.mdc" "Network Isolation (UNPROVISIONED MODE)" "Cursor dev-rules updated"
check_file_contains "opencode.json" "Network Isolation (UNPROVISIONED MODE)" "OpenCode config updated"
check_file_contains ".pi/AGENTS.md" "Network Isolation (UNPROVISIONED MODE)" "Pi AGENTS.md updated"
check_file_contains ".codex.md" "Network Isolation (UNPROVISIONED MODE)" "Codex rules updated"
check_file_contains ".zed/AGENTS.md" "Network Isolation (UNPROVISIONED MODE)" "Zed AGENTS.md updated"
check_file_contains ".claude/CLAUDE.md" "Network Isolation (UNPROVISIONED MODE)" "Claude Code CLAUDE.md updated"

echo ""
echo "--- Environment Files ---"
check_file_contains ".env.example" "NETWORK_ISOLATION_MODE=unprovisioned" "Root .env.example updated"
check_file_contains "GRID-main/.env.example" "NETWORK_ISOLATION_MODE=unprovisioned" "GRID .env.example updated"

echo ""
echo "--- Configuration Manifests ---"
check_file_exists "NETWORK_ISOLATION_CONFIG.md" "Network isolation config created"
check_file_exists "SECURITY_HARDENING_MANIFEST.md" "Security hardening manifest created"
check_file_exists "SECURITY_HARDENING_SUMMARY.md" "Security hardening summary created"

echo ""
echo "--- Audit Trail ---"
check_file_exists "$HOME/.echoes/audit-integrity.md" "Audit integrity config created"
check_dir_exists "$HOME/.echoes/backup" "Audit backup directory created"

echo ""
echo "--- Network Isolation Verification ---"
echo "Checking network listeners (should only show localhost)..."
if ss -tlnp 2>/dev/null | grep -v '127.0.0.1\|::1' | grep -q LISTEN; then
    echo -e "${RED}✗${NC} External network listeners detected!"
    echo "Run: ss -tlnp | grep -v '127.0.0.1\|::1'"
    ((FAILED++))
else
    echo -e "${GREEN}✓${NC} No external network listeners detected"
    ((PASSED++))
fi

echo ""
echo "--- Summary ---"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNED"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All security hardening checks passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some security hardening checks failed. Please review.${NC}"
    exit 1
fi

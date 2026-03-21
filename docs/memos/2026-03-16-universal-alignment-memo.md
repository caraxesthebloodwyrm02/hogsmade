# CONTEXT MEMO: Universal IDE Alignment & Optimization
**Date:** 2026-03-16
**Status:** Completed
**Scope:** Machine-level and project-level configuration across VS Code, Cursor, Windsurf, Windsurf-Next, Antigravity, and Claude Code.

## 1. Core Objective
Eliminate configuration drift across all 5 IDEs and CLI tools. Ensure identical capabilities, constraints, and operational standards regardless of the entry point used for development.

## 2. Infrastructure Alignment (The "Base Layer")
- **Terminal:** Defaulted universally to **Ubuntu (WSL)** (UTF-8 native), bypassing Windsurf's previous hardcoded PowerShell UTF-16 encoding mismatch.
- **Git Discipline:** `git.autofetch` disabled across all editors to prevent silent background state mutation.
- **Editor Settings Parity:** 13 key settings synced (font size 14, format on save, minimap disabled, right-side sidebar, bracket pair colorization).
- **Telemetry & Updates:** Completely disabled (telemetry off, auto-updates off) to enforce manual control and privacy.

## 3. Tooling & Capabilities (The "Active Layer")
- **MCP Servers:** Windsurf machine config expanded from 5 generic to **14 fully configured servers** (including `grid-rag`, `echoes`, `pulse`, etc.). All project-level `.mcp.json` files synced to exact parity.
- **Skills Distribution:** 7 editor-agnostic custom skills (`glimpse`, `Iterate`, `screen_budget_estimator`, `multi-layer-summarize`, `mcp-builder`, `legal`, `subtractive-analyst`) distributed to all relevant home directories. Corrected `substractive-analysis` typo.
- **Workflows & Rules:** `cascade-operational-standards`, `screen-budget`, and `global_rules.md` synced.
- **Keybindings & Snippets:** Glimpse terminal sequences (`ctrl+shift+g` variants) and core JS/TS utility snippets synced across all IDEs.
- **Tasks:** `tasks.json` from `GRID-main` mirrored to all workspace dot-dirs for unified test/build execution.

## 4. Extension Optimization & Cleanup
- **Policy Enforced:** Native/Ecosystem extensions only. External bloat removed.
- **Removals (12 total):** Redundant formatters, duplicate Python extensions, outdated TS versions, and non-native CLI wrappers (e.g., opencode extension from VS Code, claude-code from Cursor).
- **Cursor Fix:** Cleared 60+ unwanted external recommendations from `extensions.json`.
- **Windsurf-Next:** Reinstalled specific Docker/Containers tools (`ms-azuretools.vscode-containers`, `ms-azuretools.vscode-docker`) manually from `.zip` extractions after marketplace command-line failures.

## 5. Internal Extension Health (Antigravity & Copilot)
- **Antigravity Internal Extensions:** Removed redundant `onCommand` and `onView` activation events (handled natively by engine ^1.75.0) and eliminated performance-degrading `*` (star) wildcard activations.
- **GitHub Copilot Chat:** Removed restricted `enabledApiProposals` block from `package.json` to clear IDE warnings.
- **DevHome:** Re-registered broken Windows `DevHome.exe` app package via PowerShell, restoring its status to `Ok`.

## 6. Current State
The environment is entirely decoupled from IDE-specific quirks. All editors pull from the same operational rules, have access to the exact same MCP capabilities, format code identically, and enforce the same security/telemetry constraints. 

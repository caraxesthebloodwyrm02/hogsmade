# Per-tool Inventory & Classification

Every rule/workflow/skill file across the five primary tools (Windsurf, VS Code / Copilot, Cursor, Zed, Claude Code) classified as `keep`, `delete`, or `rewrite`. Codex, OpenCode, and Antigravity are installed but do not carry rule surfaces that overlap with `AGENTS.md` (tool-local config only).

## Tool: Windsurf

| File                       | Size (lines) | Scope label    | Classification | Overlap with | Notes                                                                                                       |
| -------------------------- | ------------ | -------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `.windsurfrules`           | ~150         | behavior-rules | rewrite        | `AGENTS.md`  | Heavy duplication of standards and TUV-001; rewritten as pointer + OS guardrails / network isolation delta. |
| `.windsurf/workflows/*.md` | Varies       | tool-workflow  | keep           | —            | Tool-specific automation macros.                                                                            |

## Tool: VS Code / Copilot

| File                                             | Size (lines) | Scope label    | Classification | Overlap with | Notes                                                                                                      |
| ------------------------------------------------ | ------------ | -------------- | -------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `.vscode/mcp.json`                               | —            | mcp-config     | keep           | —            | Tracked live config.                                                                                       |
| `.vscode/settings.json`                          | 7            | tool-config    | keep           | —            | Minimal settings; references `AGENTS.md` via `files.associations`. Tracked via gitignore exception (#121). |
| `.github/copilot-instructions.md`                | ~150         | behavior-rules | rewrite        | `AGENTS.md`  | Rewritten as pointer + Copilot-specific review guardrails (delta): Zod, shared-types, audit-contract.      |
| `.github/instructions/dev-rules.instructions.md` | —            | behavior-rules | delete         | `AGENTS.md`  | Redundant instruction file.                                                                                |

## Tool: Cursor

| File                                     | Size (lines) | Scope label    | Classification | Overlap with | Notes                                           |
| ---------------------------------------- | ------------ | -------------- | -------------- | ------------ | ----------------------------------------------- |
| `.cursorrules`                           | ~30          | behavior-rules | rewrite        | `AGENTS.md`  | Pointer to `AGENTS.md` and scoped `.mdc` files. |
| `.cursor/rules/coding-standards.mdc`     | ~40          | behavior-rules | delete         | `AGENTS.md`  | Fully redundant with `AGENTS.md`.               |
| `.cursor/rules/development-contract.mdc` | ~40          | behavior-rules | delete         | `AGENTS.md`  | Fully redundant with `AGENTS.md` (TUV-001).     |
| `.cursor/rules/git-sequence.mdc`         | ~20          | behavior-rules | keep           | —            | Cursor-specific session-start/end git flow.     |
| `.cursor/rules/response-discipline.mdc`  | ~150         | behavior-rules | keep           | —            | High-value output discipline rules.             |
| `.cursor/rules/eligibility-routine.mdc`  | ~20          | behavior-rules | keep           | —            | Project-specific (`eligibility-server`).        |
| `.cursor/rules/signal-io-hardening.mdc`  | ~60          | behavior-rules | keep           | —            | Branch-specific technical context.              |
| `.cursor/mcp.json`                       | —            | mcp-config     | keep           | —            | Live config.                                    |
| `.cursor/skills/`                        | —            | tool-skill     | keep           | —            | Tool-specific capabilities.                     |

## Tool: Zed

| File             | Size (lines) | Scope label    | Classification | Overlap with | Notes                        |
| ---------------- | ------------ | -------------- | -------------- | ------------ | ---------------------------- |
| `.zed/AGENTS.md` | —            | behavior-rules | rewrite        | `AGENTS.md`  | Pointer to root `AGENTS.md`. |

## Tool: Claude Code

| File                    | Size (lines) | Scope label    | Classification | Overlap with | Notes                                                                              |
| ----------------------- | ------------ | -------------- | -------------- | ------------ | ---------------------------------------------------------------------------------- |
| `CLAUDE.md`             | ~200         | behavior-rules | rewrite        | `AGENTS.md`  | Rewritten as pointer; Ubuntu 25.10 host note (PR #109) explicitly preserved.       |
| `~/.claude.json`        | —            | mcp-config     | keep           | —            | User-level live config (edited in Phase 5; not tracked in repo).                   |
| `~/.claude/agents/*.md` | —            | persona        | keep           | —            | **Owner-only personas** (hermes, organizer, prince-runtime-intel). Never modified. |

## Additional tools (installed; no rule-surface overlap)

| Tool        | Surface                | Classification    | Notes                            |
| ----------- | ---------------------- | ----------------- | -------------------------------- |
| Codex       | `~/.codex/config.toml` | keep (tool-local) | No duplication with `AGENTS.md`. |
| OpenCode    | `~/.config/opencode/`  | keep (tool-local) | No duplication with `AGENTS.md`. |
| Antigravity | `~/.antigravity/`      | keep (tool-local) | No duplication with `AGENTS.md`. |

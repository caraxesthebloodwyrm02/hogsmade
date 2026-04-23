# Tool Consolidation Artifacts — 2026-04-23

Archived deliverables from Prompt 6 (Per-Tool Behavior-Surface Consolidation).

This cycle consolidated every AI coding tool's rule/workflow/skill surface against the canonical `AGENTS.md` so no topic is duplicated across tools. Deliverables here are the discovery, inventory, design, and verification artifacts produced during Phases 1–5.

## Contents

| File            | Purpose                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `topics.md`     | 9 canonical behavior domains extracted from `AGENTS.md` (Phase 1).                    |
| `inventory.md`  | Per-tool file-level classification: `keep`, `delete`, or `rewrite` (Phase 2).         |
| `matrix.md`     | Topic × tool matrix: `canonical` / `pointer` / `delta` / `—` (Phase 3).               |
| `mcp-parity.md` | Live MCP config parity audit across Windsurf, Cursor, Claude user, VS Code (Phase 5). |

## Shipped PRs

| PR                                                                 | Tool        | Outcome                                                                                        |
| ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| [#113](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/113) | Zed         | `.zed/AGENTS.md` → pointer                                                                     |
| [#114](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/114) | Copilot     | `.github/copilot-instructions.md` → pointer + Zod/shared-types/audit guardrails (delta)        |
| [#115](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/115) | Cursor      | `.cursorrules` → pointer; deleted 2 redundant `.mdc` files; kept 4 scope-specific `.mdc` files |
| [#116](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/116) | Windsurf    | `.windsurfrules` → pointer + OS guardrails / network isolation (delta)                         |
| [#117](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/117) | VS Code     | Deleted redundant `.github/instructions/dev-rules.instructions.md`                             |
| [#118](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/118) | Claude Code | `CLAUDE.md` → pointer; preserved Ubuntu 25.10 host note from #109                              |
| [#119](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/119) | —           | Added `verify_tool_consolidation.py` + `verify-tool-consolidation.yml` matrix-enforcement CI   |
| [#121](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/121) | —           | Tracked `.vscode/settings.json` so matrix-check passes on CI                                   |
| [#122](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/122) | —           | Reverted unauthorized AGENTS.md reformatting that slipped into #120                            |
| [#123](https://github.com/caraxesthebloodwyrm02/hogsmade/pull/123) | —           | Hardened `verify_tool_consolidation.py` to skip untracked `.vscode/settings.json`              |

## Phase 7 snapshot parity

Local ↔ `origin/main` identical at sha256 `76752600a856…` after all PRs merged.

## Safety rules honored

- `AGENTS.md` was never modified without explicit owner approval on a per-line basis. The reformat that landed in #120 was reverted in #122.
- `~/.claude/agents/*.md` (owner personas) were never touched.
- Secret contents were never read. Only paths, sizes, and perms were inspected.
- `Projects/GRID-main/` submodule internals were not modified by this consolidation; the GRID-main merge + fixture rename is a separate track.
- No force-pushes, no history rewrites, no `git add .`, no pre-commit bypasses.

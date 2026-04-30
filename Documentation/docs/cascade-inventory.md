# Cascade Inventory

## Purpose

This is the clean, canonical inventory entry point for the local CascadeProjects workspace. It consolidates the current workspace map, tool-rule inventory, and gruff access guidance without duplicating archived audit snapshots.

## Authority

| Layer                | Path                                                    | Role                                                                              |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Canonical workspace  | `/mnt/arch_data/home/caraxes/CascadeProjects`           | Source of truth for active CascadeProjects code, docs, tools, scripts, and hooks. |
| Home access pointer  | `/home/irfankabir/cascade-inventory.md`                 | Convenience pointer for user-home workflows.                                      |
| Gruff access pointer | `/home/irfankabir/gruff/workspace/cascade-inventory.md` | Convenience pointer for gruff without mount-path recall.                          |

## Workspace map

| Area          | Canonical path                       | Notes                                                                                                         |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Applications  | `Applications/`                      | App and engine work, including `glimpse-artifact`, `glimpse-engine`, and `pi-mangrove`.                       |
| Components    | `Components/`                        | Shared packages and shared scripts, including `shared-types`, `shared-resilience`, and `shared-pipeline`.     |
| Projects      | `Projects/`                          | Operational projects such as `GRID-main`, `DIO`, and `GATE`. `GRID-main` is a nested/submodule-style project. |
| Tools         | `Tools/MCPServers/`                  | First-party MCP servers.                                                                                      |
| Commands      | `commands/`                          | Local command notes/macros.                                                                                   |
| Scripts       | `scripts/` and `Components/scripts/` | Workspace automation and verification scripts.                                                                |
| Hooks         | `hooks/`                             | Local hook entry points.                                                                                      |
| Documentation | `Documentation/`                     | Shared docs, audits, archive, and governance references.                                                      |
| Hogwarts      | `Hogwarts/`                          | Archived pending concrete activation plan; not an active migration hub.                                       |

## Tool-rule inventory

The canonical detailed tool-consolidation inventory is archived at:

- `Documentation/archive/tool-consolidation-2026-04-23/inventory.md`

Current enforcement/reference docs:

- `Documentation/docs/tool-consolidation-matrix.md`
- `Components/scripts/verify_tool_consolidation.py`

The old home-side folder `/home/irfankabir/cascade-tool-consolidation/` is a working snapshot and should not be treated as authoritative when it conflicts with the canonical archive or live docs.

## System audit snapshot

The folder `/home/irfankabir/cascade-system-audit/` is a dated evidence snapshot from 2026-04-23. Preserve it as historical audit evidence, but do not use it as the live source of truth for current layout or current MCP parity.

## Gruff access guidance

Gruff should use stable pointers rather than copy CascadeProjects content. Preferred access paths:

- `cascade-inventory.md` in the gruff workspace for inventory orientation.
- `CascadeProjects` symlink in the gruff workspace only when direct repo traversal is needed.

Avoid duplicating the canonical workspace into `/home/irfankabir/CascadeProjects`; that location currently behaves as a partial/shadow workspace rather than the full source of truth.

## Migration principle

Keep one canonical inventory in `caraxes/CascadeProjects/Documentation/docs/`, then expose it through thin pointers for user-home and gruff workflows. Do not use `Hogwarts` for this migration while it remains archived.

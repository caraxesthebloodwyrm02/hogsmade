# Copilot Instructions — Cascade Workspace

> **Canonical source of truth:** `AGENTS.md` at the repo root. This file is the Copilot adapter.
> If anything here conflicts with `AGENTS.md`, `AGENTS.md` wins.

## Operator

Irfan Kabir (Prince). Git identity: `caraxesthebloodwyrm02` (caraxesthebloodwyrm02@gmail.com). Attribution when required: `Built by Prince (Irfan Kabir)`.

## Behavior and Governance

- See `AGENTS.md` for repository guidelines and the **Unbreakable Vow (TUV-001)**.
- TUV-001 conditions: Fidelity · Integrity · Accountability. Ask instead of guessing. No silent scope expansion.

## Workspace and Commands

- See `AGENTS.md § Repository at a glance` for the directory map.
- See `AGENTS.md § Build, test, and development commands` for canonical commands.
- Build order: `Components/shared-types` → `Components/shared-resilience` → MCP servers. Do not skip.
- Python: `uv run` only. Never `pip`. Node: `npm` only (except `mcp-tool-experiment` uses `pnpm`).

## Environment Facts

- OS: Ubuntu 25.10, hostname `prince`. Use `apt` — never `pacman` or `brew`.
- Symlinks `canopy/`, `roots/`, `seed/`, `grove/` → `/mnt/arch_data/home/caraxes/`. Check mount before using.
- MCP servers at `/mnt/arch_data/home/caraxes/CascadeProjects/Tools/MCPServers/` — silent failure if unmounted.
- GRID API: `http://localhost:8080`. Start: `~/scripts/run-grid-api.sh`. Not auto-started.
- No `sudo` in suggestions. Collect privileged steps as a copyable block.

## Review Guardrails

- TypeScript: avoid `any`; prefer `unknown` + runtime narrowing (e.g. Zod).
- Shared-types: ensure dependent servers compile after changes to `@cascade/shared-*`.
- `signal-model` symbols: import from `@cascade/shared-types/signal-model`, not the package root.
- Audit: verify emitted fields match `Documentation/docs/DATA_CONTRACTS.md`.
- No `policy.readOnly` — the key is `repositoryMutationAllowed`.
- Secrets: never add credentials to tracked files. `detect-secrets` is a backstop, not a substitute.

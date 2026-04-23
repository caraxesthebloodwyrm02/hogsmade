# Copilot Instructions — Cascade Workspace

> **Canonical source of truth:** `AGENTS.md` at the repo root. This file is the Copilot adapter — it points to the shared repository guidelines for behavior, build commands, coding standards, and governance (TUV-001).

## Behavior and Governance

- See `AGENTS.md` for the repository guidelines and the **Unbreakable Vow (TUV-001)**.
- Follow `AGENTS.md` if any project-specific instruction drifts from it.

## Workspace and Commands

- See `AGENTS.md § Repository at a glance` for the directory map and project roles.
- See `AGENTS.md § Build, test, and development commands` for canonical Node (npm) and Python (uv) commands.

## Review Guardrails

- TypeScript: avoid `any`; prefer `unknown` + runtime narrowing (e.g. Zod).
- Shared-types: ensure dependent servers compile after changes to `@cascade/shared-*`.
- Audit: verify emitted fields match the shared audit contract in `Documentation/docs/DATA_CONTRACTS.md`.
- Secrets: never add real credentials to tracked files; reference env vars only.

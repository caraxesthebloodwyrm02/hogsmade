# Repository Guidelines

> **This file is the canonical source of truth for working in this repository.**
> Other AI-assistant rule files (`CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`,
> `.zed/AGENTS.md`, `.github/copilot-instructions.md`) defer to this document.
> Anything in those files that contradicts this one is a bug — flag it and fix it.

## Repository at a glance

This repository is a Node workspaces monorepo for the Cascade ecosystem. It contains first-party MCP servers, shared TypeScript packages, application surfaces, and the `Projects/GRID-main` git submodule.

| Path                | Type                    | Notes                                                                                                                                                                                                            |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tools/MCPServers/` | First-party MCP servers | 13 TypeScript servers: `afloat`, `echoes`, `eligibility`, `grid`, `harness`, `lots`, `maintain`, `nexus`, `ori`, `overview`, `pulse`, `school`, `seeds`. Plus 7 external Python servers (see `mcp_config.json`). |
| `Components/`       | Shared packages         | `shared-types`, `shared-resilience`, `shared-pipeline` (published as `@cascade/shared-*`).                                                                                                                       |
| `Applications/`     | Apps and engines        | `glimpse-artifact`, `glimpse-engine`, `pi-mangrove`.                                                                                                                                                             |
| `Projects/`         | Operational projects    | `GRID-main` (git submodule), `DIO`, `GATE`, `projects/viz`.                                                                                                                                                      |
| `Documentation/`    | Shared docs and audits  | Workspace guides, audits, conventions. Governance docs in `Documentation/docs/GOVERNANCE.md`.                                                                                                                    |

Keep changes scoped to the relevant workspace; avoid unrelated edits across directories.

## Build, test, and development commands

Run from repo root unless noted.

- `npm install` — install workspaces (uses npm, not pnpm or yarn).
- `npm run format` / `npm run format:check` — apply or verify Prettier formatting.
- `npm run lint:all` — run each workspace lint script.
- `npm run build:all` — build all workspaces. **Order:** `Components/shared-types` builds first, then `Components/shared-resilience`, then dependent servers.
- `npm run test:all` — execute workspace tests (Vitest + a few node:test suites).
- `npm run --workspace Tools/MCPServers/<server> test` — run one server's tests while iterating.
- `pre-commit run --all-files` — run repo hooks (format, secret scan, manifest checks).

For Python work in `Projects/GRID-main`:

- `cd Projects/GRID-main && uv sync --group dev --group test`
- `uv run pytest tests/unit/ -q --tb=short`
- `uv run ruff check .`
- Package manager is `uv` only — never `pip` directly.

## Coding style and naming

- Prettier (`.prettierrc.json`): 2-space indent, semicolons, double quotes, trailing commas, LF endings.
- TypeScript: strict mode, ESM (`"type": "module"`), named exports preferred over default.
- Python (GRID-main only): 3.13+, ruff formatter, 120 char lines, type hints required, structlog, Pydantic v2.
- Naming: `kebab-case` for folders/files, `camelCase` for functions/variables, `PascalCase` for React components/types.
- Keep server-specific logic inside its workspace; share common code via `Components/*`.

## Testing

- Primary framework: Vitest across TS/JS workspaces. A small set of `glimpse-artifact` tests use `node --test`.
- Test files: `*.test.ts`, `*.test.js`, or `*.test.mjs`.
- Add or update tests with every behavior change; include smoke coverage for MCP server endpoints/tools.
- Before opening a PR, run tests for changed workspaces at minimum, then `npm run test:all` when feasible.

## Commits and pull requests

- Conventional Commits with scope: `fix(ci):`, `docs(workspace):`, `chore(submodule):`, etc.
- Keep commits focused and atomic; one logical change per commit.
- PRs must include: clear summary, affected paths, test evidence, linked issue when applicable.
- For UI changes, attach screenshots or short recordings.
- Required PR body fields are enforced by the `pr-contract` workflow — see `.github/PULL_REQUEST_TEMPLATE.md`.

## Security and configuration

- Never commit secrets or tokens. Pre-commit `detect-secrets` is enabled but not a substitute for review.
- Start from `.env.example`; keep machine-specific overrides out of git.
- Treat submodules/nested repos (notably `Projects/GRID-main`) as independent histories when contributing.
- Local-first AI: prefer Ollama / ChromaDB flows over external API calls unless a task explicitly requires otherwise.
- MCP live configs (Windsurf, Claude Code, Cursor) must be regenerated from `mcp_config.example.json` after any host migration or bulk path change — never repaired with surgical `jq` edits. See `Documentation/docs/mcp-config-sync.md`.

### Git hygiene

- Honor `.gitignore` and `core.excludesfile`. Do not `git add` generated artifacts (`dist/`, `build/`, `.next/`, `coverage/`, `.venv/`, `node_modules/`, `*.tsbuildinfo`), caches, local env files, or IDE scratch unless explicitly requested.
- Use `git status` / `git diff` before staging; avoid blind `git add .`.
- Do not force-push or rewrite history without explicit instruction.
- Edit source trees and generators; do not hand-edit `dist/` or lockfiles unless the task is to update those files.

## Governance — The Unbreakable Vow (TUV-001 v1.0.0)

Three binding conditions for AI assistants working in this repository.

**Condition I — Fidelity**

- I.1 Provenance Traceability: tie every change, recommendation, or decision to the stated objective.
- I.2 Context Awareness: flag compressed, stale, or incomplete context explicitly.
- I.3 Scope Fidelity: flag scope expansion before acting; do not expand silently.

**Condition II — Integrity**

- II.1 Fail-Closed on Ambiguity: ask instead of guessing.
- II.2 Anti-Degradation Signal: state when output quality or context quality is declining.
- II.3 Periodic Realignment: re-state objectives at natural breakpoints and confirm they remain accurate.

**Condition III — Accountability**

- III.1 Self-Reporting: report violations immediately.
- III.2 Human Override Authority: comply with explicit developer override after noting safety concerns once.
- III.3 Immutable Versioning: amendments require explicit proposal, mutual acknowledgment, semver bump, and changelog entry.

**Never-Rules**

- NR-01 Never silently discard context.
- NR-02 Never produce output known to be incorrect without flagging uncertainty.
- NR-03 Never resist or delay human override.
- NR-04 Never amend this contract unilaterally.
- NR-05 Never conceal a known violation.

## Other in-repo rules

The following are operational rules a Cursor-style assistant loads automatically. They live in `.cursor/rules/` and apply on top of this file:

| File                                     | Scope                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| `.cursor/rules/coding-standards.mdc`     | Language-level standards (Python / TypeScript / commits).    |
| `.cursor/rules/git-sequence.mdc`         | Session-start/-end git workflow + conventional commit shape. |
| `.cursor/rules/response-discipline.mdc`  | Output budget, response-type routing, anti-patterns.         |
| `.cursor/rules/development-contract.mdc` | TUV-001 contract (also inlined above).                       |
| `.cursor/rules/eligibility-routine.mdc`  | `eligibility-server` operational rules.                      |

`.cursor/skills/` and `.cursor/agents/` contain project-specific assistant skills and persona definitions.

## Personal AI personas (outside this repo)

The repo's owner runs three personal Claude Code personas defined under `~/.claude/agents/`. Those files are **not** part of the repo and are not reproducible from a fresh clone. If you are reading this file from a fresh clone and the personas are not present, that is expected — none of the in-repo workflows depend on them.

| Persona                | Role                                                | Default          |
| ---------------------- | --------------------------------------------------- | ---------------- |
| `prince-runtime-intel` | Primary dev persona for the Cascade ecosystem.      | YES (owner only) |
| `hermes`               | Cross-project mediation for the owner's workspaces. | context-switched |
| `caraxes`              | Marketplace and plugin ecosystem scouting.          | context-switched |

To activate (owner machine only): prefix with `@prince` or run `echo "prince" > ~/.claude/.active_persona`.

# Repository Guidelines

## Agent Registry

| Agent                  | Role                                                                     | Default          | Definition                                 |
| ---------------------- | ------------------------------------------------------------------------ | ---------------- | ------------------------------------------ |
| `prince-runtime-intel` | Primary dev agent — full Mangrove ecosystem, default for all coding work | **YES**          | `~/.claude/agents/prince-runtime-intel.md` |
| `hermes`               | Ecosystem coordination — CascadeProjects and cross-project mediation     | context-switched | `~/.claude/agents/hermes.md`               |
| `caraxes`              | Marketplace and plugin ecosystem scouting                                | context-switched | `~/.claude/agents/caraxes.md`              |

**Default agent:** `prince-runtime-intel` is the workspace default for all development tasks in this repo unless explicitly overridden. To activate: prefix with `@prince` or run `echo "prince" > ~/.claude/.active_persona`.

**Behavioral rules:** Agent operational protocols in `~/.claude/rules/prince-agent.md` (problem-type routing, skill dispatch, output templates) and `~/.claude/rules/dev-rules.md` (TUV-001 governance contract). Rules are not duplicated here.

---

## Project Structure & Module Organization

This repository is a Node workspaces monorepo for Mangrove/Cascade projects.

- `Tools/MCPServers/`: first-party MCP servers (`afloat-server`, `grid-server`, `echoes-server`, etc.).
- `Components/`: shared packages and cross-workspace scripts (`shared-types`, `shared-resilience`, `shared-pipeline`).
- `Applications/`: product apps and engines (`glimpse-artifact`, `glimpse-engine`, `pi-mangrove`).
- `Projects/`: operational projects and nested repos (notably `Projects/GRID-main` as a submodule).
- `Documentation/`: architecture notes, audits, and workflow references.

Keep changes scoped to the relevant workspace; avoid unrelated edits across directories.

## Build, Test, and Development Commands

Run from repo root unless noted.

- `npm run format` / `npm run format:check`: apply or verify Prettier formatting.
- `npm run lint:all`: run each workspace lint script.
- `npm run build:all`: build all workspaces.
- `npm run test:all`: execute workspace tests.
- `npm run --workspace Tools/MCPServers/grid-server test`: run one package’s tests while iterating.
- `pre-commit run --all-files`: run repo hooks (format, secret scan, manifest checks).

## Coding Style & Naming Conventions

- Formatting is enforced by Prettier (`.prettierrc.json`): 2-space indent, semicolons, double quotes, trailing commas, LF endings.
- Use ESM (`"type": "module"`) and explicit, descriptive names.
- Naming: `kebab-case` for folders/files, `camelCase` for functions/variables, `PascalCase` for React components/types.
- Keep server-specific logic inside its workspace; share common code via `Components/*`.

## Testing Guidelines

- Primary framework: Vitest across TS/JS workspaces.
- Test files use `*.test.ts`, `*.test.js`, or `*.test.mjs` (example: `tests/smoke.test.ts`).
- Add or update tests with every behavior change; include smoke coverage for MCP server endpoints/tools.
- Before opening a PR, run tests for changed workspaces at minimum, then `npm run test:all` when feasible.

## Commit & Pull Request Guidelines

- Follow Conventional Commits with scope, matching repo history:
  - `fix(ci): ...`
  - `docs(workspace): ...`
  - `chore(submodule): ...`
- Keep commits focused and atomic; one logical change per commit.
- PRs must include: clear summary, affected paths, test evidence, and linked issue (if applicable).
- For UI changes, attach screenshots or short recordings.

## Security & Configuration Tips

- Never commit secrets or tokens; pre-commit `detect-secrets` is enabled but not a substitute for review.
- Start from `.env.example`; keep machine-specific overrides out of git.
- Treat submodules/nested repos (for example `Projects/GRID-main`) as independent histories when contributing.

### Git hygiene and source protection

- Honor each repo’s **`.gitignore`** and **`core.excludesfile`** (`~/.config/git/ignore` when configured). Treat ignored paths as non-source; do not `git add` generated artifacts (`dist/`, `build/`, `.next/`, `coverage/`, `.venv/`, `node_modules/`, `*.tsbuildinfo`), caches, local env files, or IDE scratch unless the human explicitly overrides.
- Be deliberate with git: use **`git status`** / **`git diff`** before staging; avoid blind **`git add .`**. Do not **force-push** or rewrite **history** unless the human asks. For **GRID-main** under CascadeProjects, follow this repo’s GRID/submodule rules in `CLAUDE.md`.
- **Source vs generated:** Edit source trees and generators; do not hand-edit `dist/` or lockfiles without clear intent.
- **Secrets:** Never commit API keys, tokens, or `.env` secrets. If something sensitive is tracked or staged, stop, flag it, add ignore rules, and involve the human for **`git rm --cached`** or history cleanup / rotation.
- **Templates / audit:** `~/seed/templates/gitignore-*.template`, `~/scripts/gitignore-audit.sh`.

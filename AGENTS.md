# Repository Guidelines

## Project Structure & Module Organization
CascadeProjects is a multi-project workspace, not a single app. First-party TypeScript MCP servers live in `afloat-server/`, `echoes-server/`, `grid-server/`, `lots-server/`, `maintain-server/`, `pulse-server/`, and `seeds-server/`. Shared contracts live in `shared-types/`. UI work is in `glimpse-artifact/`, while the browser-only visualization engine is in `glimpse-engine/`. Shared docs and repo conventions live in `docs/`, and root-level regression coverage lives in `tests/`. `GRID-main/` and `mcp-tool-experiment/` are nested repositories; manage them in their own git roots.

## Build, Test, and Development Commands
There is no root `npm` workspace, so run commands inside the project you are changing.

- `cd shared-types && npm run build` builds shared TypeScript contracts used by the servers.
- `cd afloat-server && npm run dev` starts a server with `tsx --watch`; the same pattern applies to the other `*-server` packages.
- `cd afloat-server && npm test` runs that server's Vitest suite.
- `cd glimpse-artifact && npm run check` runs type-checking, tests, and a production build.
- `node scripts/sync-default-master.mjs` refreshes the generated `glimpse-engine` config before opening `glimpse-engine.html`.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF line endings, final newline, and trimmed trailing whitespace except in Markdown. Use 2-space indentation for JavaScript, TypeScript, JSON, YAML, and shell scripts; use 4 spaces for Python. Keep source under `src/`, tests under `tests/`, and treat `dist/` as generated output. Match existing descriptive names such as `smoke.test.ts`, `useGateData.test.ts`, and project-scoped package names like `pulse-server`.

## Testing Guidelines
Add tests in the same package you change. Servers use Vitest with files such as `tests/smoke.test.ts`; `glimpse-artifact` uses `tsx --test` over `tests/*.test.ts`; root `tests/glimpse-engine.test.mjs` covers the visualization engine. Run the narrowest relevant test command locally before opening a PR. No global coverage threshold is enforced, but bug fixes and new behavior should include regression coverage.

## Commit & Pull Request Guidelines
Recent history favors short imperative commits with a scope or project prefix, for example `docs: update workspace docs`, `feat(seeds-server): add repo aliases`, or `glimpse: fix instance recognition`. Keep one logical change per commit and avoid mixing unrelated projects. PRs should summarize the change, link issues when relevant, call out submodule or nested-repo updates, and include screenshots for `glimpse-artifact` UI changes. Never commit secrets or tokens; keep them in secret storage.

# Copilot Code Review Instructions — CascadeProjects

## TypeScript MCP Servers

- Strict TypeScript: no `any` types. Flag every `any` usage.
- Verify `shared-types` imports resolve correctly (not relative paths to source).
- Check zod schemas match the declared tool input types.
- Verify audit emission: tools that mutate state must call `emitAudit()`.
- Flag secrets, tokens, or API keys in config files or source code.
- Ensure `npm run build` compatibility: no TypeScript errors in new code.

## GRID-main (Python submodule)

- Type hints required on all function signatures.
- Block `eval()`, `exec()`, `pickle` — use AST-based evaluation only.
- Flag changes to `safety/`, `security/`, or `boundaries/` without corresponding tests.
- Check layer boundaries: core must not import from application layer.
- Verify `structlog` usage — no bare `print()` in production code.
- Enforce 120-character line length.

## Shared Rules

- Flag scope expansion: changes outside the PR's stated purpose.
- Verify rollback plan for database migrations or schema changes.
- Check dependency additions: must be justified in PR description.
- Flag any `.env` file changes or secret/credential patterns.
- Conventional commit format in PR title: `feat(scope):`, `fix(scope):`, etc.

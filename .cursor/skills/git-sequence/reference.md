# Git sequence reference

## Community / conventional guidelines (synthesized)

- **Conventional Commits**: `type(scope): description`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`. Scope optional (e.g. project or area).
- **Atomic commits**: One logical change per commit; easier to review and revert.
- **Session boundaries**: Pre-session — fetch/pull so you start from latest. Post-session — commit and push so work is saved and shared.
- **Branch hygiene**: Work on feature branches; merge to main via PR when possible. Delete merged local branches to keep a pure state.
- **No destructive commands** without explicit user confirmation: `git reset --hard`, `git clean -fdx`, force-push.

## Repo-specific

- Root repo: CascadeProjects. Default branch: `main`. Remote: `origin` (e.g. like-a-leaf).
- Submodules: GRID-main, mcp-tool-experiment; `.gitmodules` uses `ignore = dirty`. See docs/SUBMODULES.md for remediation.

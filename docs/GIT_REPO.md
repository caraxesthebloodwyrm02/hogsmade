# Git repo and conventions

This repo is the **single dedicated local git repository** for the CascadeProjects workspace. The root is `CascadeProjects`; all projects under it are tracked here unless they are nested repos (e.g. `GRID-main`, `mcp-tool-experiment`) with their own `.git`.

## Repository setup status

- **Root repo**: `C:\Users\USER\CascadeProjects`
- **Default branch**: `main`
- **Remotes**: none configured by default
- **Nested repos intentionally left separate**: `GRID-main/`, `mcp-tool-experiment/`

## Branch and commit

- **Default branch**: `main`.
- **Commits**: Prefer scoped messages, e.g. `pulse-server: add health check`, `docs: add GIT_REPO`, `afloat-server: fix task registration`.
- **Scope**: One logical change per commit when practical; avoid mixing unrelated projects in one commit.
- **Current local baseline commit**: `chore: configure repo, add README and git/docs conventions`.

## Remotes

No remotes are configured by default. To add one:

```bash
git remote add origin <url>
git push -u origin main
```

If you use multiple remotes (e.g. backup, mirror), name them explicitly and push when needed.

## Nested repos / submodules

`GRID-main/` and `mcp-tool-experiment/` are tracked as **submodules** (see root `.gitmodules`). They have their own remotes and branches; the root repo records only the commit ref for each. To avoid a permanently "dirty" status from local changes inside those repos, `.gitmodules` sets `ignore = dirty`. For remediation options (clean, commit-and-update, or ignore), see [docs/SUBMODULES.md](SUBMODULES.md).

## Line endings and attributes

- `.gitattributes` at the repo root enforces consistent line endings (LF in repo; CRLF for `*.cmd`/`*.bat` on checkout where applicable).
- Binary files (e.g. images, fonts) are marked so git does not alter them.

## Staging and push workflow (best practices)

1. **Check state** — Run `git status` and `git diff` to see what changed.
2. **Stage selectively** — Use `git add <file>` or `git add -p` for partial staging. Stage only what belongs in one logical commit; keep commits atomic (one intention per commit).
3. **Commit** — Use a clear, imperative message (e.g. `feat: add X`, `chore: update Y`). Avoid mixing unrelated changes in a single commit.
4. **Push** — With upstream set: `git push`. First time: `git push -u origin main`. Ensures the remote has your commits and keeps branch tracking in sync.

Root repo tip: Nested repos (e.g. `GRID-main`, `mcp-tool-experiment`) show as “modified” when their checked-out commit or working tree differs. To record updated refs only, stage those paths and commit; to ignore their state, leave them unstaged.

## Git audit (what’s in git vs not)

See [docs/git-audit-guide.md](git-audit-guide.md) for a short comparison table and when to run the git sequence (session start, session end, weekly).

## Ignored paths

See root `.gitignore`. It excludes dependencies (`node_modules/`, `.venv/`, etc.), build output, editor/IDE folders, secrets (`.env*`), and operational data (e.g. `*.ndjson` audit logs). Also ignored: Cursor hook config and local hook dirs (`.cursor/hooks.json`, `.cursor/hooks/`), debug session logs (`debug-*.log`), and session state (`.session-state.json`). Per-project ignores may exist inside subdirectories.

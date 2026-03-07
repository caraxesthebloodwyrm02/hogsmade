# Git repo and conventions

This repo is the **single dedicated local git repository** for the CascadeProjects workspace. The root is `CascadeProjects`; all projects under it are tracked here unless they are nested repos (e.g. `GRID-main`, `mcp-tool-experiment`) with their own `.git`.

## Branch and commit

- **Default branch**: `main`.
- **Commits**: Prefer scoped messages, e.g. `pulse-server: add health check`, `docs: add GIT_REPO`, `afloat-server: fix task registration`.
- **Scope**: One logical change per commit when practical; avoid mixing unrelated projects in one commit.

## Remotes

No remotes are configured by default. To add one:

```bash
git remote add origin <url>
git push -u origin main
```

If you use multiple remotes (e.g. backup, mirror), name them explicitly and push when needed.

## Nested repos

Some directories (e.g. `GRID-main/`, `mcp-tool-experiment/`) contain their own `.git` and are **not** git submodules—they are independent repos. The root repo tracks their path as a directory; updates inside those trees are managed in their own repos. Do not run `git add` from the root on them if you intend to keep them as separate repos; use `.gitignore` or leave them as untracked if you want to avoid accidentally committing their content from the root.

## Line endings and attributes

- `.gitattributes` at the repo root enforces consistent line endings (LF in repo; CRLF for `*.cmd`/`*.bat` on checkout where applicable).
- Binary files (e.g. images, fonts) are marked so git does not alter them.

## Ignored paths

See root `.gitignore`. It excludes dependencies (`node_modules/`, `.venv/`, etc.), build output, editor/IDE folders, secrets (`.env*`), and operational data (e.g. `*.ndjson` audit logs). Per-project ignores may exist inside subdirectories.

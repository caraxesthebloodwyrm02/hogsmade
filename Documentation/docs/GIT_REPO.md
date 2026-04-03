# Git repo and conventions

CascadeProjects is a single dedicated local git repository rooted at `/home/caraxes/CascadeProjects`. Most projects in the workspace are tracked from this root. The only active nested repo in the current tree is `Projects/GRID-main/`, which has its own `.git` and its own history.

## Repository setup

- Root repo: `/home/caraxes/CascadeProjects`
- Default branch: `main`
- Remotes: none configured by default
- Active nested repo: `Projects/GRID-main/`
- Historical references to `mcp-tool-experiment` are archival only and do not correspond to an active checkout in the current tree

## Branch and commit

- Prefer scoped, imperative commit messages, for example `docs: update workspace layout` or `fix(grid-server): restore gate path`
- Keep one logical change per commit when practical
- Avoid mixing unrelated projects in a single commit

## Remotes

No remotes are configured by default. To add one:

```bash
git remote add origin <url>
git push -u origin main
```

## Nested repo handling

`Projects/GRID-main/` is the only active nested repository. The root repo records only the commit ref for that checkout. `.gitmodules` should contain only that entry, and it currently uses `ignore = dirty` so local work inside `Projects/GRID-main/` does not constantly dirty the root status.

If you need to update the nested repo:

1. Commit inside `Projects/GRID-main/`
2. Stage the submodule ref at the root
3. Commit the ref update at the root

## Line endings and attributes

- `.gitattributes` enforces consistent line endings
- Binary files are marked so git does not alter them

## Staging and push workflow

1. Check state with `git status` and `git diff`
2. Stage selectively with `git add <file>` or `git add -p`
3. Commit with a clear imperative message
4. Push when you are ready and a remote is configured

## Ignored paths

See root `.gitignore`. It excludes dependencies, build output, editor folders, secrets, and operational data such as audit logs. Per-project ignores may exist inside subdirectories.

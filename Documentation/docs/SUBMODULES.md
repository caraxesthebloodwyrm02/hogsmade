# Dirty submodules: remediation and best practices

The CascadeProjects root repo currently has one active submodule: `Projects/GRID-main/`.

## Why the submodule can show as dirty

- Tracked files inside `Projects/GRID-main/` were changed but not committed
- New files inside `Projects/GRID-main/` are untracked
- The parent repo records only the nested repo commit hash, not its working-tree state

Historical references to `mcp-tool-experiment` are archival only and do not describe an active nested repo in the current tree.

## Current state

| Path                  | Parent expects                                | Typical cause of dirty status                                  |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `Projects/GRID-main/` | A specific commit recorded in the parent repo | Local branch changes or untracked files inside the nested repo |

## Option 1: Ignore dirty state

Use this when you want the root repo to stay clean while you keep working inside the nested repo.

1. Ensure `.gitmodules` keeps `ignore = dirty` for `Projects/GRID-main/`
2. Run `git submodule sync` if needed
3. Check root `git status`

## Option 2: Clean the submodule

Use this when you want the nested repo to match the commit recorded by the parent and you do not need local changes.

```bash
git submodule update --init --force Projects/GRID-main
```

Or inside the submodule:

```bash
cd Projects/GRID-main
git fetch origin
git checkout --detach <commit>
git reset --hard HEAD
git clean -fdx
```

## Option 3: Commit inside the submodule and update the parent

1. Commit the change inside `Projects/GRID-main/`
2. Stage the submodule ref at the root
3. Commit the ref update in the parent repo

## Summary

| Goal                                                  | Action                                                  |
| ----------------------------------------------------- | ------------------------------------------------------- |
| Root `git status` clean, keep local work in submodule | Ignore dirty state in `.gitmodules`                     |
| Submodule exactly matches parent ref                  | Update or clean the nested repo                         |
| Keep submodule work and record it in the parent       | Commit inside the submodule, then update the parent ref |

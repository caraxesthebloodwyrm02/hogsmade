# Dirty submodules: remediation and best practices

This doc is tailored to the CascadeProjects root repo, where **GRID-main** and **mcp-tool-experiment** are tracked as submodules (gitlinks). They often show as **modified** or **dirty** in `git status` because of local changes inside those repos.

## Why submodules show as dirty

- **Modified content** — Tracked files in the submodule have been changed but not committed (or the submodule HEAD is on a different commit than the one the parent records).
- **Untracked content** — New files in the submodule that are not committed.

The parent repo only stores a **commit hash** for each submodule. Any working-tree changes or untracked files inside the submodule make the parent report that path as modified.

## Current state (as of this doc)

| Path               | Parent expects (commit) | Typical cause of "dirty" |
|--------------------|-------------------------|----------------------------|
| `GRID-main`        | `69c909d...`            | Local branch + modified/untracked files in GRID-main. |
| `mcp-tool-experiment` | `e7dcc94...`          | Local branch + modified/untracked files in mcp-tool-experiment. |

Both nested repos are **at the commit the parent expects**; the dirty flag comes from **uncommitted or untracked changes** inside each.

---

## Option 1: Ignore dirty state (recommended for a clean root status)

Use this when you want the **root repo’s `git status` to stay clean** while you keep working inside the nested repos without committing there yet.

1. **Add or edit `.gitmodules`** at the repo root so each submodule has `ignore = dirty` (or `ignore = untracked` if you only care about untracked files):

   ```ini
   [submodule "GRID-main"]
       path = GRID-main
       url = https://github.com/GRID-INTELLIGENCE/GRID.git
       ignore = dirty
   [submodule "mcp-tool-experiment"]
       path = mcp-tool-experiment
       url = <your-mcp-repo-url>
       ignore = dirty
   ```

2. **Sync submodule config** (if submodules were already in the index):

   ```bash
   git submodule sync
   ```

3. **Check status** — `git status` at the root should no longer list those paths as modified when the only difference is working-tree or untracked content inside the submodule.

**Best practice:** Commit the `.gitmodules` change so everyone on the repo gets the same behavior.

---

## Option 2: Clean the submodules (discard local changes)

Use this when you want the submodule directories to **exactly match** the commit the parent expects and you do **not** need to keep local changes.

**Warning:** This removes uncommitted and untracked work inside the submodule.

From the **repo root**:

```bash
git submodule update --init --force GRID-main
git submodule update --init --force mcp-tool-experiment
```

Or inside each submodule (e.g. `GRID-main`):

```bash
cd GRID-main
git fetch origin
git checkout --detach 69c909dbb1625df005d1629883a83c7e46c752db   # or the ref parent expects
git reset --hard HEAD
git clean -fdx
cd ..
```

Repeat for `mcp-tool-experiment` with the appropriate commit hash. After that, the root repo should show them as clean as long as you don’t modify files inside them again.

---

## Option 3: Commit inside submodules and update the parent

Use this when you **want to keep** the current work and record new submodule commits in the parent.

1. **In each submodule** — Commit (and optionally push) your changes:

   ```bash
   cd GRID-main
   git add -A
   git commit -m "Your message"
   git push origin <branch>   # if you use a remote
   cd ..
   ```

   Do the same for `mcp-tool-experiment` if desired.

2. **At the repo root** — Point the parent at the new submodule commits and commit:

   ```bash
   git add GRID-main mcp-tool-experiment
   git commit -m "chore: update submodule refs (GRID-main, mcp-tool-experiment)"
   git push origin main
   ```

**Best practice:** Prefer one logical change per commit inside the submodule; then a single “update submodule refs” commit in the parent keeps history clear.

---

## Organizing the “submodule-dirty” branch

- **If your goal is a clean `main` (or any branch) at the root:**  
  Use **Option 1** (`.gitmodules` with `ignore = dirty`) so the root branch is not blocked by uncommitted submodule changes. Work and commit inside submodules on their own schedule.

- **If your goal is to have the root always reflect a known, committed state of submodules:**  
  Use **Option 2** when you want to reset to the recorded refs, or **Option 3** when you want to commit in the submodules and then update the parent.

- **Ongoing:**  
  Run `git submodule status` at the root to see which submodules have different commits or dirty working trees. Use `git status` in each submodule to see what is modified or untracked before choosing Option 2 or 3.

---

## Summary

| Goal                         | Action |
|-----------------------------|--------|
| Root `git status` clean, keep local work in submodules | Option 1: add `ignore = dirty` in `.gitmodules`. |
| Submodule dirs match parent ref, discard local work    | Option 2: `git submodule update --init --force` or reset/clean inside each. |
| Keep submodule work and record it in the parent        | Option 3: commit (and push) in each submodule, then `git add` submodule paths and commit at root. |

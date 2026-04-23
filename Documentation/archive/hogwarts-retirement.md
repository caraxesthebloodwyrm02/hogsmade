# Hogwarts — Retirement Notice

**Retired:** 2026-04-23
**Removed from repo:** `Hogwarts/board/` (184 MB), `Hogwarts/nuke/` (179 MB)
**Retained:** `Hogwarts/hyperspace/` (empty placeholder, 4 KB)

## What was here

| Directory     | Contents                                          | Why retired                                                                                      |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `board/`      | React + Vite tool UI for Hogwarts board workflows | No CI, no deployment, superseded by `glimpse-artifact` and the hogsmade-notebook plugin surfaces |
| `nuke/`       | Board reset / nuke tooling                        | No CI, no deployment, tooling intent absorbed by the scheduled driver + harness cleanup flows    |
| `hyperspace/` | Empty placeholder                                 | Kept to preserve the directory entry; contains no files                                          |

## Recovery

Git history is preserved. To restore a removed directory:

```bash
git log --diff-filter=D --name-only --pretty=format: -- Hogwarts/board/ | head -5
git checkout <commit-sha> -- Hogwarts/board/
```

Replace `board` with `nuke` for the other directory. The removal commit message will identify the exact sha.

## Decision rationale

Hogwarts was an early planning UI from before the hogsmade-notebook plugin architecture. The `board/` UI had no active deployment path and no CI gate. Rather than carry 363 MB of stale React code indefinitely, it was retired during the v0.1.0 plugin rollout (Row 11 of the Hogsmade Agentic Notebook rollout plan).

Active surfaces that replaced it:

- `Applications/glimpse-artifact/` — Vite UI with CI and design token system
- `.claude-plugin/assets/notebook-viewer.html` — read-only notebook browser
- `.claude-plugin/assets/hogsmade-notebook-cover.html` — plugin marketplace cover

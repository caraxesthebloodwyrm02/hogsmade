---
name: git-sequence
description: Runs the root-repo git workflow (status, stage, commit, push) with situational scope. Use at session start to verify and sync, at session end to finalize and push, or when the user asks to check git, commit and push, clean up branches, run a git audit, repo health, what to commit, submodule status, or untracked review.
---

# Git sequence

Minimal routine for the CascadeProjects root repo. Follow repo docs: [docs/GIT_REPO.md](../../docs/GIT_REPO.md), [docs/SUBMODULES.md](../../docs/SUBMODULES.md).

## Situational scope (when to run)

Snap to one of these; run only the actions for that situation.

| Trigger             | When                                                             | Actions                                                                                                    | Do not                                           |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Session start**   | User begins work or says "check git at start"                    | `git status -sb`; `git fetch origin`; optional `git pull --ff-only`. Report branch, upstream, clean/dirty. | Do not stage/commit/push.                        |
| **Session end**     | User ends work or says "finalize" / "commit and push"            | Status → stage (selective) → commit (conventional) → `git push origin <branch>`.                           | Do not force-push or reset without confirmation. |
| **After merge**     | User says "pure state" / "clean up branch"                       | `git branch -d <merged-branch>`. Confirm one active branch, clean tree.                                    | Do not delete unmerged branches.                 |
| **Verify only**     | User says "check git" / "verify tracking"                        | `git status -sb`, `git remote -v`, `git branch -vv`. Report only.                                          | No writes.                                       |
| **Submodule dirty** | User explicitly asks about submodules                            | Point to docs/SUBMODULES.md; run only Option 1/2/3 if user chooses.                                        | Do not auto-commit inside submodules.            |
| **Git audit**       | User asks for "git audit", "repo health", "what should I commit" | Run checklist below; suggest add/ignore/commit per docs/GIT_REPO.md.                                       | No destructive commands without confirmation.    |

## Git audit checklist

When the user asks for a git audit, repo health, or what to commit:

1. Run `git status -sb` and `git submodule status`.
2. List notable untracked directories or files (e.g. `output/`, `tmp/`, new project dirs).
3. Suggest: add to .gitignore (if local-only), stage and commit (if intentional change), or leave unstaged; point to [docs/GIT_REPO.md](../../docs/GIT_REPO.md) and [docs/git-audit-guide.md](../../docs/git-audit-guide.md).

## Routine (simplified)

1. **Status** — `git status -sb` (branch, upstream, short list).
2. **Stage** — `git add <file>` or `git add -p` for partial; avoid `git add -A` unless one logical commit.
3. **Commit** — `git commit -m "type(scope): description"` (e.g. `docs: add X`, `chore: update Y`).
4. **Push** — `git push origin <branch>`; first time set upstream with `-u`.

## Commit message format

Conventional: `type(scope): description`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scope optional (e.g. `pulse-server`, `docs`).

## Do not

- Run `git reset --hard` or `git clean -fdx` without explicit confirmation.
- Commit inside GRID-main or mcp-tool-experiment unless the user asks to update submodule refs.
- Push to a branch the user did not name or approve.

## Reference

- [reference.md](reference.md) — Conventional commits and repo-specific notes.
- [docs/GIT_REPO.md](../../docs/GIT_REPO.md) — Full repo conventions.
- [docs/SUBMODULES.md](../../docs/SUBMODULES.md) — Submodule remediation.
- [docs/git-audit-guide.md](../../docs/git-audit-guide.md) — Git vs non-git, when to run sequence.

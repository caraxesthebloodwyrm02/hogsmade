# Contributing to CascadeProjects

Thanks for your interest in contributing. This workspace is a multi-project repo; each subdirectory may have its own toolchain and conventions.

## Before you start

- Read README.md for workspace overview and project list.
- For AI/agent and coding guidance, see CLAUDE.md and AGENTS.md.
- For git workflow (branching, commits, remotes), see docs/GIT_REPO.md.

## Workflow

1. **Branch** — Create a branch from `main` for your change (e.g. `feat/my-feature`, `fix/thing`).
2. **Change** — Work in the relevant project; run that project’s tests and lint before committing.
3. **Commit** — Use clear, scoped messages (e.g. `pulse-server: add X`, `docs: update Y`). Prefer one logical change per commit.
4. **Push** — Push your branch and open a pull request against `main`.

## Per-project setup

Each project has its own build and test commands. From the repo root, `cd` into the project (e.g. `afloat-server`, `pulse-server`) and follow that project’s README and any `package.json` / `pyproject.toml` scripts.

## Pull requests

- Keep PRs focused; link to issues if applicable.
- Request AI review when available; if the AI review system is down for more than 24 hours, document the outage and a human reviewer in the PR.
- Ensure CI/tests pass for the projects you changed (run their test commands locally).
- Ensure required security scans (deps, secrets, SAST) pass or include a documented, time-bound waiver.
- Follow the repo’s staging and push conventions (docs/GIT_REPO.md#staging-and-push-workflow-best-practices).

## Nested repos

`GRID-main/` and `mcp-tool-experiment/` are independent git repositories. Contribute to them in their own trees and remotes; the root repo may track them as submodules or leave them as nested repos.

## Bots and tokens

- Bot tokens are least-privilege, stored only in secret storage (never in repo files), and rotated every 90 days.
- On suspected compromise: revoke the token, rotate, re-authenticate dependent jobs, and backfill audit logs with the incident and remediation steps.

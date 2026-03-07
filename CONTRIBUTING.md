# Contributing to CascadeProjects

Thanks for your interest in contributing. This workspace is a multi-project repo; each subdirectory may have its own toolchain and conventions.

## Before you start

- Read [README.md](README.md) for workspace overview and project list.
- For AI/agent and coding guidance, see [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md).
- For git workflow (branching, commits, remotes), see [docs/GIT_REPO.md](docs/GIT_REPO.md).

## Workflow

1. **Branch** — Create a branch from `main` for your change (e.g. `feat/my-feature`, `fix/thing`).
2. **Change** — Work in the relevant project; run that project’s tests and lint before committing.
3. **Commit** — Use clear, scoped messages (e.g. `pulse-server: add X`, `docs: update Y`). Prefer one logical change per commit.
4. **Push** — Push your branch and open a pull request against `main`.

## Per-project setup

Each project has its own build and test commands. From the repo root, `cd` into the project (e.g. `afloat-server`, `pulse-server`) and follow that project’s README and any `package.json` / `pyproject.toml` scripts.

## Pull requests

- Keep PRs focused; link to issues if applicable.
- Ensure CI/tests pass for the projects you changed (run their test commands locally).
- Follow the repo’s [staging and push conventions](docs/GIT_REPO.md#staging-and-push-workflow-best-practices).

## Nested repos

`GRID-main/` and `mcp-tool-experiment/` are independent git repositories. Contribute to them in their own trees and remotes; the root repo may track them as submodules or leave them as nested repos.

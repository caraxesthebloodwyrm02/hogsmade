# Workspace Sync & Git Integrity Boundaries

This document serves as the absolute boundary definition for maintaining a clean, preserved environment when pushing and pulling across the broader `cascadeprojects` workspace and the `glimpse-engine` remote origins.

It defines strict staging, committing, and validation hygiene.

---

## 1. Commit Scopes & Logic Segregation

To ensure robust remote syncs that aren't bloated by experimental noise, we enforce strict segregation of commit logic:

- **`feat(core):`** Reserved strictly for changes directly modifying `@glimpse/core` architecture, `glimpse.master.yaml`, or runtime rule validators.
- **`feat(tools):`** Used for auxiliary CLI implementations, interactive agent commands, and visual rendering scripts (like the interactive analysis suites found in `projects/web/ai-web-demo/`).
- **`chore(env):`** For local workspace topology modifications, submodule updates, or infrastructure resets.

**Boundary Rule:** You MUST NOT blend `core` logic changes into `tools` commits.

## 2. Environment Preservation

Temporary files and sensitive credentials can break upstream remote syncs or expose the user. Before executing a `git push`:

- **Configuration Integrity:** The root `.env.example` remains the sole source of truth for repository structure. Personal `.env` files must NEVER be tracked.
- **Agent Artifacts:** All agent-generated walkthroughs, markdown context logs, or playground states must be explicitly ignored via `.gitignore` or sequestered under `--exclude` flags. Local memory states (`c:\Users\USER\.gemini\`) do NOT belong in project context.
- **Lock Files:** Validate that dependency lock files (`yarn.lock`, etc.) have not been unexpectedly refreshed during Python environment testing before pushing to remote.

## 3. The Pre-Sync Check (Review Mandate)

Before executing a heavy upstream sync (especially merge states), the user or agent must utilize the native workspace analysis tools to verify environment health.

**Mandatory Pre-Flight CLI Checks:**
Execute `python projects/web/ai-web-demo/cascade_review_cli.py` or trigger `/cascade-review`:

1. **Verify Git Tree:** Use Option 1 (_Git Tree Status_) to guarantee no accidental untracked system files have sneaked into the queue.
2. **Consult Deepwiki:** Use Option 4 (_Code Review & Deepwiki Recommendations_) to ensure newly authored modules are not violating Python Async blocking constraints or JS/TS React prop-drilling warnings defined by the parent hierarchy.

By establishing these concrete boundaries, the `cascadeprojects` workspace remains cleanly insulated from local experimentation bloat.

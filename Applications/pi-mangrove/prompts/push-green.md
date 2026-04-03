---
name: push-green
description: "Centralized push, monitor, log, and iterate-until-green workflow for CascadeProjects, GRID, and Echoes repos. Use when pushing changes and needing CI pipeline verification, or when CI fails and you need a structured fix loop. Keywords: push, CI, pipeline, green, monitor, iterate, fix, deploy, merge."
---

# Push → Monitor → Fix → Green

## Scope

This prompt drives a push-then-iterate loop across the Mangrove ecosystem repos. Each repo has distinct CI gates — this prompt maps them so you check the right things.

## Step 1: Pre-Push Validation

Run local checks **before** pushing to catch failures early.

### CascadeProjects (hogsmade)

```bash
cd ~/CascadeProjects

# TypeScript CI (shared-types, MCP servers, glimpse-artifact)
npx tsc -p shared-types/tsconfig.json --noEmit
npx tsc -p glimpse-artifact/tsconfig.json --noEmit

# Secrets scan (local pre-check)
grep -rnE "sk-ant-|sk-proj-|ghp_|ghu_|AKIA" --include="*.ts" --include="*.json" . && echo "BLOCKED: credential found" || echo "CLEAR"

# Repo contract checks
bash scripts/run_repo_contract_checks.sh
```

### GRID

```bash
cd ~/roots/GRID
make lint          # ruff check + mypy
make test          # unit + integration + security + api tests
make guard-no-debug  # no debug flags in production
```

### Echoes

```bash
cd ~/canopy/echoes
make lint          # ruff check
make test          # pytest
```

## Step 2: Push

```bash
cd <repo-root>
git push origin <branch>
```

## Step 3: Monitor CI Pipeline

### Watch run status

```bash
# Get the latest workflow run triggered by the push
gh run list --limit 3 --json status,conclusion,name,headBranch

# Watch a specific run
gh run watch <run-id>

# View logs for a failed run
gh run view <run-id> --log-failed
```

### Required status checks per repo

**CascadeProjects (hogsmade branch protection):**
| Check | Workflow | Trigger |
|-------|----------|---------|
| `root-ts-ci` | `root-ts-ci.yml` | Push to any branch touching TS/server paths |
| `Credential Hygiene Scan` | `secrets-gate.yml` | Every push and PR |
| `Boundary Invariant Review` | `boundary-gate.yml` | PRs touching safety/security/boundaries |
| `Test & Lint (Python 3.13)` | `grid-main-ci.yml` | Push touching GRID-main paths |

**GRID (main branch):**
| Check | Workflow | Trigger |
|-------|----------|---------|
| Secrets gate | `ci.yml` | Push to main |
| Lint (ruff + mypy) | `ci.yml` | Push to main |
| Security scan (bandit) | `ci.yml` | Push to main |
| Tests (pytest) | `ci.yml` | Push to main |
| Build verification | `ci.yml` | Push to main |

**Echoes (main branch):**
| Check | Workflow | Trigger |
|-------|----------|---------|
| Lint (ruff) | `ci.yml` | Push to main |
| Test (pytest) | `ci.yml` | Push to main |

## Step 4: Log Failure

If any check fails, capture the failure context:

```bash
# Get failed run details
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name: .name, steps: [.steps[] | select(.conclusion == "failure") | .name]}'

# Get failed step logs
gh run view <run-id> --log-failed | tail -50
```

Record failure in this format:

```
PIPELINE FAILURE
  Repo: <repo>
  Branch: <branch>
  Run: <run-id>
  Failed check: <check-name>
  Failed step: <step-name>
  Root cause: <one-line summary>
  Fix category: lint | test | type | secret | build | dependency
```

## Step 5: Fix and Re-Push

### By failure category

**Lint failure:**

```bash
# GRID / Echoes
uv run ruff check --fix .
uv run ruff format .

# CascadeProjects
npx eslint --fix <file>
```

**Type failure:**

```bash
# CascadeProjects
npx tsc -p <project>/tsconfig.json --noEmit 2>&1 | head -20

# GRID
uv run mypy src/ --ignore-missing-imports
```

**Test failure:**

```bash
# Run the specific failing test
uv run pytest tests/<file>::<test> -xvs    # Python
npx vitest run tests/<file> -t "<name>"    # TypeScript
```

**Secret detected:**

```bash
# Find and remove the credential
grep -rn "sk-ant-\|sk-proj-\|ghp_\|AKIA" --include="*.ts" --include="*.py" --include="*.json" .
# Replace with env var reference, commit, force-push if needed
```

**Dependency failure:**

```bash
# Python
uv lock --upgrade-package <pkg>
uv sync --group dev --group test

# TypeScript
npm install
npx tsc --noEmit
```

### Re-push after fix

```bash
git add <fixed-files>
git commit -m "fix(ci): <description of fix>"
git push origin <branch>
```

Then return to **Step 3** and monitor again.

## Step 6: Confirm Green

```bash
# Verify all checks passed
gh run list --limit 1 --json status,conclusion,name --jq '.[] | "\(.name): \(.conclusion)"'

# For branch-protected repos, verify merge readiness
gh pr checks <pr-number>   # if working via PR
```

### Green criteria

| Repo            | All Green When                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- |
| CascadeProjects | `root-ts-ci` + `Credential Hygiene Scan` + `Boundary Invariant Review` + `Test & Lint` all pass |
| GRID            | `GRID CI` passes (secrets + lint + security + test + build)                                     |
| Echoes          | `Echoes CI` passes (lint + test)                                                                |

## Iteration Contract

- **Max iterations:** 3 fix cycles before escalating
- **Escalation:** If 3 fix attempts fail, stop and report the blocking issue with full logs
- **Never:** Force-push to main/hogsmade to bypass failing checks
- **Never:** Disable or skip a required status check to unblock a merge
- **Always:** Log each failure and fix attempt for audit trail

## Quick Single-Repo Push

```bash
# One-liner: push, wait, report
cd <repo> && git push origin <branch> && sleep 10 && gh run list --limit 1 --json conclusion,name --jq '.[] | "\(.name): \(.conclusion)"'
```

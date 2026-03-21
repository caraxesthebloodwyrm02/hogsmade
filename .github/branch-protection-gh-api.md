# Branch Protection (GitHub) via `gh api` — Template

Use this as a repeatable checklist for each active repository:
`CascadeProjects`, `roots/GRID`, `canopy/afloat`, `canopy/echoes`, `roots/apiguard`, `grove/Vision`.

## 1. Get the default branch
Replace `<OWNER>/<REPO>`:
```sh
gh repo view "<OWNER>/<REPO>" --json defaultBranchRef --jq .defaultBranchRef.name
```

## 2. Determine the required check *context names*
Open a test PR (or push a commit) and copy the *exact* required-check names from GitHub’s branch protection UI.

If you prefer API inspection, you can fetch the commit status contexts:
```sh
gh api repos/<OWNER>/<REPO>/commits/<SHA>/status \
  --jq '.statuses[].context'
```

For **GitHub Actions check runs**, the legacy commit-status endpoint is often empty; prefer the PR rollup (exact check names GitHub shows on the PR):

```sh
gh pr view <PR_NUMBER> --repo "<OWNER>/<REPO>" \
  --json statusCheckRollup \
  --jq '[.statusCheckRollup[].name] | unique | sort | .[]'
```

## 2b. Auto-label subset → `required_status_checks.contexts` (mapped)

Each table lists **workflow names** from that repo’s `.github/workflows/auto-label-agent-fix.yml`, then the **check `name` / job id** strings to use in branch protection. Values combine **PR `statusCheckRollup` discovery** with **workflow YAML** where a job did not appear on the discovery PR (e.g. slow or path-filtered jobs).

**Do not** add third-party bots (e.g. `Cursor Bugbot`) unless you explicitly want them blocking merge.

**Dependabot auto-merge** jobs often **skip** for non-Dependabot PRs; many teams **omit** them from required contexts and rely on CI + secrets gates only.

| GitHub repo | Default branch | Auto-label watches | Suggested `contexts` (subset) |
|-------------|----------------|-------------------|-------------------------------|
| `caraxesthebloodwyrm02/hogsmade` | `hogsmade` | `root-ts-ci`, `Secrets & Credential Gate`, `Boundary & Safety Gate`, `GRID-main CI`, `codeql` | `root-ts-ci`, `Credential Hygiene Scan`, `Boundary Invariant Review`, `Test & Lint (Python 3.13)`. **Note:** `codeql` is **not** on `origin/hogsmade` yet (no `.github/workflows/codeql.yml` in tree); add contexts only after the workflow exists. Discovery PR did not surface boundary/grid-main checks until those paths run—names above are from YAML `jobs.*.name`. |
| `GRID-INTELLIGENCE/GRID` | `main` | `GRID CI`, `CodeQL`, `Dependabot Auto-Merge` | From **GRID CI**: `Secrets Scan`, `Lint`, `Security Scan`, `Smoke Test` (add `Test`, `Integration Tests`, `Build Package`, `Schema Validation`, `CI Status Summary` if you require the full pipeline). From **CodeQL**: `Analyze Python` (repo currently has one CodeQL job; discovery also showed `Analyze (javascript-typescript)`—verify on a fresh PR before requiring). **Optional:** `Auto-Merge Dependabot`. |
| `caraxesthebloodwyrm02/afloat` | `main` | `CI/CD`, `Dependabot Auto-Merge` | **CI/CD** job display name: `Lint, typecheck, test, and build` (from `ci-cd.yml`). Discovery PR listed `Vercel Preview Comments` and `auto-merge` but not the quality job yet—confirm on your next PR. **Optional:** `auto-merge`. |
| `caraxesthebloodwyrm02/echoes` | `main` | `Echoes CI`, `Secrets Gate`, `Dependabot Auto-Merge` | **Echoes CI:** `Lint`, `Test` (`Build` is `main`/`master` only—omit for PR protection). **Secrets Gate:** job id `secrets-scan` → context `secrets-scan`. **Optional:** `auto-merge`. Omit `submit-pypi` unless that workflow is in your auto-label list. |
| `caraxesthebloodwyrm02/apiguard` | `main` | *(no `auto-label-agent-fix.yml`)* | **Tier “CI + secrets if present”:** `quality` (job id; `ci.yml`), `secrets-scan` if **Secrets Gate** workflow exists and runs on PRs. |
| `irfankabir02/Vision` | `main` | *(no `auto-label-agent-fix.yml`)* | Same as apiguard pattern: `quality`, `secrets-scan` (from discovery + `Vision CI` / secrets workflow). |

### Copy-paste JSON arrays (minimal, autolabel-aligned)

**hogsmade** (`hogsmade` branch)—after boundary + GRID-main paths have run at least once, verify names in the UI:

```json
["root-ts-ci", "Credential Hygiene Scan", "Boundary Invariant Review", "Test & Lint (Python 3.13)"]
```

**GRID** (`main`)—minimal subset matching auto-label workflows (no auto-merge):

```json
["Secrets Scan", "Lint", "Security Scan", "Smoke Test", "Analyze Python"]
```

**afloat** (`main`):

```json
["Lint, typecheck, test, and build"]
```

**echoes** (`main`):

```json
["Lint", "Test", "secrets-scan"]
```

**apiguard** (`main`):

```json
["quality", "secrets-scan"]
```

**Vision** (`main`):

```json
["quality", "secrets-scan"]
```

### API caveat (repos where protection is disabled)

`gh api .../branches/<branch>/protection` may return **404** with `Branch protection has been disabled on this repository` for some org/user settings. In that case configure required checks in the **GitHub UI** (or enable the feature for the repo) using the same context strings.

## 3. Apply protection (working `gh api` pattern)

GitHub’s schema rejects `-f required_status_checks=...` because nested fields arrive as **strings**, not JSON objects. Send a **full JSON body** on stdin and include **`restrictions: null`** (required by the API).

Replace `<OWNER>/<REPO>`, `<BRANCH>`, and the `contexts` array:

```sh
python3 <<'PY' | gh api "repos/<OWNER>/<REPO>/branches/<BRANCH>/protection" --method PUT --input -
import json
body = {
    "required_status_checks": {
        "strict": True,
        "contexts": [
            # e.g. "quality", "secrets-scan"
        ],
    },
    "enforce_admins": False,
    "required_pull_request_reviews": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews": True,
        "require_code_owner_reviews": False,
    },
    "restrictions": None,
    "allow_force_pushes": False,
    "allow_deletions": False,
    "required_conversation_resolution": False,
    "required_linear_history": True,
}
print(json.dumps(body))
PY
```

## Notes / Guardrails
- Always start with “least change”: if you are unsure about a field name, first fetch the current protection JSON, then update only the `contexts` list.
- For Dependabot auto-merge, make sure your branch protection *requires passing required checks* and blocks merging when checks fail.
- If `auto-delete head branches` is a hard requirement, set it in the UI first (until you have the exact API fields you want to rely on).


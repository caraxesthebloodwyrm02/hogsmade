# Branch Protection Setup

Manual steps for configuring branch protection on each repo's default branch.
Run these `gh api` commands from a terminal authenticated as the repo owner.

> **Note**: Requires `Allow auto-merge` enabled in repo settings (Settings → General → Pull Requests) for Dependabot auto-merge to work.

---

## CascadeProjects (hogsmade)

**Repo**: `caraxesthebloodwyrm02/hogsmade`
**Branch**: `hogsmade`
**Required checks** (from `repo-contract.json`): `pr-contract`, `root-ts-ci`, `secrets-scan`, `codeql`

```bash
gh api repos/caraxesthebloodwyrm02/hogsmade/branches/hogsmade/protection \
  --method PUT \
  --field 'required_status_checks[strict]=true' \
  --field 'required_status_checks[checks][][context]=pr-contract' \
  --field 'required_status_checks[checks][][context]=root-ts-ci' \
  --field 'required_status_checks[checks][][context]=secrets-scan' \
  --field 'required_status_checks[checks][][context]=codeql' \
  --field 'enforce_admins=false' \
  --field 'required_pull_request_reviews=null' \
  --field 'restrictions=null' \
  --field 'allow_force_pushes=false' \
  --field 'allow_deletions=false'
```

Enable auto-delete head branches:

```bash
gh api repos/caraxesthebloodwyrm02/hogsmade \
  --method PATCH \
  --field 'delete_branch_on_merge=true' \
  --field 'allow_auto_merge=true'
```

---

## roots/GRID

**Repo**: `GRID-INTELLIGENCE/GRID`
**Branch**: `main`
**Required checks**: `secrets-scan`, `lint`, `smoke-test`, `test`, `build-package`

```bash
gh api repos/GRID-INTELLIGENCE/GRID/branches/main/protection \
  --method PUT \
  --field 'required_status_checks[strict]=true' \
  --field 'required_status_checks[checks][][context]=secrets-scan' \
  --field 'required_status_checks[checks][][context]=lint' \
  --field 'required_status_checks[checks][][context]=smoke-test' \
  --field 'required_status_checks[checks][][context]=test' \
  --field 'required_status_checks[checks][][context]=build-package' \
  --field 'enforce_admins=false' \
  --field 'required_pull_request_reviews=null' \
  --field 'restrictions=null' \
  --field 'allow_force_pushes=false' \
  --field 'allow_deletions=false'
```

```bash
gh api repos/GRID-INTELLIGENCE/GRID \
  --method PATCH \
  --field 'delete_branch_on_merge=true' \
  --field 'allow_auto_merge=true'
```

---

## canopy/afloat

**Repo**: `caraxesthebloodwyrm02/afloat`
**Branch**: `main`
**Required checks**: `quality`, `secret-hygiene`, `dependency-audit`, `codeql`

```bash
gh api repos/caraxesthebloodwyrm02/afloat/branches/main/protection \
  --method PUT \
  --field 'required_status_checks[strict]=true' \
  --field 'required_status_checks[checks][][context]=quality' \
  --field 'required_status_checks[checks][][context]=secret-hygiene' \
  --field 'required_status_checks[checks][][context]=dependency-audit' \
  --field 'required_status_checks[checks][][context]=codeql' \
  --field 'enforce_admins=false' \
  --field 'required_pull_request_reviews=null' \
  --field 'restrictions=null' \
  --field 'allow_force_pushes=false' \
  --field 'allow_deletions=false'
```

```bash
gh api repos/caraxesthebloodwyrm02/afloat \
  --method PATCH \
  --field 'delete_branch_on_merge=true' \
  --field 'allow_auto_merge=true'
```

---

## canopy/echoes

**Repo**: `caraxesthebloodwyrm02/echoes`
**Branch**: `main`
**Required checks**: `lint`, `test`, `build`

```bash
gh api repos/caraxesthebloodwyrm02/echoes/branches/main/protection \
  --method PUT \
  --field 'required_status_checks[strict]=true' \
  --field 'required_status_checks[checks][][context]=lint' \
  --field 'required_status_checks[checks][][context]=test' \
  --field 'required_status_checks[checks][][context]=build' \
  --field 'enforce_admins=false' \
  --field 'required_pull_request_reviews=null' \
  --field 'restrictions=null' \
  --field 'allow_force_pushes=false' \
  --field 'allow_deletions=false'
```

```bash
gh api repos/caraxesthebloodwyrm02/echoes \
  --method PATCH \
  --field 'delete_branch_on_merge=true' \
  --field 'allow_auto_merge=true'
```

---

## grove/Vision

**Repo**: `irfankabir02/Vision`
**Branch**: `main`
**Required checks**: `quality`

```bash
gh api repos/irfankabir02/Vision/branches/main/protection \
  --method PUT \
  --field 'required_status_checks[strict]=true' \
  --field 'required_status_checks[checks][][context]=quality' \
  --field 'enforce_admins=false' \
  --field 'required_pull_request_reviews=null' \
  --field 'restrictions=null' \
  --field 'allow_force_pushes=false' \
  --field 'allow_deletions=false'
```

```bash
gh api repos/irfankabir02/Vision \
  --method PATCH \
  --field 'delete_branch_on_merge=true' \
  --field 'allow_auto_merge=true'
```

---

## roots/apiguard

**Repo**: `caraxesthebloodwyrm02/apiguard`
**Branch**: `main`

> apiguard has minimal CI (`ci.yml` + `secrets-gate.yml`). Add required checks once job names are confirmed via a test PR.

```bash
gh api repos/caraxesthebloodwyrm02/apiguard \
  --method PATCH \
  --field 'delete_branch_on_merge=true'
```

---

## Verification

After applying protection, verify with:

```bash
gh api repos/OWNER/REPO/branches/BRANCH/protection --jq '{
  required_checks: .required_status_checks.checks,
  strict: .required_status_checks.strict,
  enforce_admins: .enforce_admins.enabled,
  force_pushes: .allow_force_pushes.enabled
}'
```

## Notes

- `enforce_admins: false` allows emergency bypass by repo admins.
- `strict: true` requires branches to be up-to-date before merging.
- Check context names must match the **job key** (not the display `name:`). Discover exact names from a test PR's check runs: `gh pr checks <PR_NUMBER>`.
- Dependabot auto-merge (`gh pr merge --auto --squash`) only fires after all required checks pass.

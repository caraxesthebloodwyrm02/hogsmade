# hogsmade Release Runbook

Step-by-step guide for releasing hogsmade packages.

## Pre-Release Checklist

- [ ] All PRs merged to `main`
- [ ] All CI checks passing on `main`
- [ ] CHANGELOG.md updated with `[Unreleased]` changes
- [ ] Version bump script tested locally

## Release Steps

### 1. Version Bump

```bash
# Patch release (default)
node scripts/version-bump.mjs patch

# Or minor/major
node scripts/version-bump.mjs minor
node scripts/version-bump.mjs major
```

This updates:
- `package.json` version
- `CHANGELOG.md` with new version section

### 2. Commit and Tag

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): prepare vX.X.X"
git tag vX.X.X
git push && git push --tags
```

### 3. Automated Release

The `release.yml` workflow triggers on tag push:
1. Builds all shared packages
2. Builds all MCP servers
3. Validates CHANGELOG
4. Creates GitHub Release

### 4. Verify Release

```bash
gh release view vX.X.X --repo caraxesthebloodwyrm02/hogsmade
```

## Post-Release

- [ ] Verify release notes accurate
- [ ] Check version matrix updated
- [ ] Monitor for issues

## Emergency Rollback

```bash
# Revert to previous tag
git revert HEAD
git push

# Or force rollback
git reset --hard vPREVIOUS
git push --force-with-lease
```

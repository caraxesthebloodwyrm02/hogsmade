## Motivation

<!-- What problem does this PR solve? -->

## Scope

<!-- Which projects or surfaces changed? -->

## Blast Radius

<!-- What downstream systems does this affect? -->

## Acceptance Criteria

- <!-- Criterion 1 -->
- <!-- Criterion 2 -->

## Risk Tier

<!-- tier-0, tier-1, or tier-2 -->

## Affected Repos

- <!-- CascadeProjects / GRID-main / mcp-tool-experiment / other -->

## Test Evidence

- <!-- e.g. cd grid-server && npm test, or link to CI run -->

## Security Impact

<!-- Describe secret handling, auth, workflow, boundary, or package-script impact. Use "none" if not applicable. -->

## Docs Impact

<!-- Describe doc updates or say "none". -->

## Rollback Plan

<!-- How would you revert or disable this change safely? -->

## Automated Gates

The following checks run automatically — no action needed unless they fail:

| Gate                          | Triggers on                                                    | On failure                                                    |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **pr-contract**               | Every PR edit and sync                                         | Blocks merge until required fields are present                |
| **root-ts-ci**                | Root TypeScript packages, `glimpse-artifact`, `glimpse-engine` | Blocks merge until build/test/check pass                      |
| **Secrets & Credential Gate** | All pushes and PRs                                             | Blocks merge; rotate any real credential immediately          |
| **Boundary Invariant Gate**   | Changes to `GRID-main` safety/security/boundaries              | Posts detailed review; blocks on CRITICAL/HIGH findings       |
| **GRID-main CI**              | Changes to `GRID-main/**`                                      | Blocks merge; fix test failures or lint errors before merging |
| **codeql**                    | Scheduled and code-sensitive JS/TS changes                     | Blocks merge on unresolved CodeQL findings when required      |

## Checklist

- [ ] Automated gates are passing (or waiver linked with justification)
- [ ] Relevant tests were run locally or in CI
- [ ] Docs were updated when behavior or APIs changed
- [ ] Commit messages are scoped and clear
- [ ] Tier 2 changes have explicit reviewer attention
- [ ] Token, secret, workflow, and deploy changes were reviewed for least privilege

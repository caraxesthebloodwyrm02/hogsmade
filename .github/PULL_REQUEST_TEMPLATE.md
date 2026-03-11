## Summary

<!-- Brief description of the change -->

## Scope

- [ ] Docs only
- [ ] Single project (which: ___________)
- [ ] Cross-project / root

## Automated Gates

The following checks run automatically — no action needed unless they fail:

| Gate | Triggers on | On failure |
|---|---|---|
| **Secrets & Credential Gate** | All pushes and PRs | Blocks merge; rotate any real credential immediately |
| **Boundary Invariant Gate** | Changes to `safety/`, `security/`, `boundaries/`, safety rules | Posts detailed review; blocks on CRITICAL/HIGH findings |
| **GRID-main CI** | Changes to `GRID-main/**` | Blocks merge; fix test failures or lint errors before merging |

If a gate blocks your PR, read the bot's review comment — it includes the specific invariant that was triggered, the rationale, and a recommended path forward.

## Checklist

- [ ] Automated gates are passing (or waiver linked with justification)
- [ ] Ran relevant tests for changed project(s)
- [ ] Updated docs if behavior or API changed
- [ ] Commit messages are scoped and clear (see [GIT_REPO.md](../../docs/GIT_REPO.md))
- [ ] If safety/security/boundaries were touched: read [`GRID-main/.claude/rules/safety.md`](../GRID-main/.claude/rules/safety.md) first
- [ ] If bot tokens were touched: rotation/least-privilege documented and secrets updated

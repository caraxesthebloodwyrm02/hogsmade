# Release readiness (main-first consolidation)

Single checklist for tagging a release from `main`. Update the **Recorded** rows when you cut a candidate.

## Submodule

| Item                                              | Recorded                                   |
| ------------------------------------------------- | ------------------------------------------ |
| `Projects/GRID-main` commit (pinned in this repo) | `0a62c4b1ea95d8f571556465976ab5ab9fc58b97` |
| Matches ultrareview merge target                  | Yes (GRID PR #116 line)                    |

Upstream GRID `main` may advance independently; bump the submodule when you intend to ship newer GRID work.

## CI

| Check                                                       | Status                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| Required checks green on `main`                             | Confirm in GitHub Actions before tagging               |
| `CHANGELOG.md` has `## [x.y.z]` for the tag you will create | Required by `.github/workflows/release.yml` validation |

## Smoke / perf baselines (local, 2026-04-20)

Recorded on this tree with `Projects/GRID-main` at the SHA above.

| Suite      | Command                                                | Wall time (approx.) |
| ---------- | ------------------------------------------------------ | ------------------- |
| ori-server | `cd Tools/MCPServers/ori-server && npm test`           | ~2 s                |
| GRID unit  | `cd Projects/GRID-main && uv run pytest tests/unit -q` | ~75 s               |

Full GRID `pytest` (including integration) reported failures in a subset of integration/cognitive tests in this environment; treat unit-only as the green baseline until those are triaged.

## Next steps for a version tag

1. Add/adjust the version section in `CHANGELOG.md`.
2. Bump `Projects/GRID-main` if the release must include newer GRID commits; re-run smoke rows.
3. Create annotated tag `v*.*.*` and push tags per your release process.

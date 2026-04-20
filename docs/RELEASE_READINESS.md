# Release readiness (main-first consolidation)

Single checklist for tagging a release from `main`. Update the **Recorded** rows when you cut a candidate.

## Submodule

| Item                                              | Recorded                                   |
| ------------------------------------------------- | ------------------------------------------ |
| `Projects/GRID-main` commit (pinned in this repo) | `1c486b844264ca18ba88879e59f5dc141d852d65` |
| Matches ultrareview merge target                  | Yes (includes GRID PR #118 test-alignment) |

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

Full GRID `pytest` requires optional services where tests are not skipped (e.g. Ollama embedding model for some RAG tests — they `skip` if the model is not pulled). Run `uv run pytest` on a machine with CI-like services for a complete green run.

## Next steps for a version tag

1. Add/adjust the version section in `CHANGELOG.md`.
2. Bump `Projects/GRID-main` if the release must include newer GRID commits; re-run smoke rows.
3. Create annotated tag `v*.*.*` and push tags per your release process.

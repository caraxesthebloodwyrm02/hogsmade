# Security Ownership Map Report

Date: 2026-03-08

## Scope

- Repositories analyzed:
  - `/mnt/c/Users/USER/CascadeProjects`
  - `/mnt/c/Users/USER/CascadeProjects/GRID-main`
  - `/mnt/c/Users/USER/CascadeProjects/mcp-tool-experiment`
- Time window: last 12 months
- Method: `security-ownership-map` scripts using authored commits, default Dependabot exclusion, co-change graph enabled

## Executive Summary

The workspace root repo and `mcp-tool-experiment` are effectively single-maintainer in the analyzed window, so their bus factor is structurally low but not currently distributed enough to produce ownership competition or hidden-owner findings. `GRID-main` is the only repo with meaningful multi-identity history, and its sensitive ownership remains concentrated after cleaning out archive and backup paths. The rerun with `--path-exclude 'archive/**' --path-exclude '**/build_backup/**'` removed the archived crypto hotspot and produced a cleaner active-code view: `auth` and `secrets` are still concentrated under one identity, while `crypto` concentration shifts to a different identity in the active path set. The main governance risk is not orphaned sensitive code; it is concentrated sensitive ownership plus identity fragmentation that will understate true bus-factor risk unless normalized.

## Findings

### 1. `GRID-main` has concentrated ownership in sensitive areas

- Baseline hidden-owner findings from [ownership-map-out/GRID-main/summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main/summary.json):
  - `caraxesthebloodwyrm02@gmail.com` controls 65% of `auth` code
  - `caraxesthebloodwyrm02@gmail.com` controls 67% of `secrets` code
  - `caraxesthebloodwyrm02@gmail.com` controls 60% of `crypto` code

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main/summary.json#L47)

- Cleaned active-code findings from [ownership-map-out/GRID-main-no-archive/summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive/summary.json):
  - `caraxesthebloodwyrm02@gmail.com` controls 65% of `auth` code
  - `caraxesthebloodwyrm02@gmail.com` controls 67% of `secrets` code
  - `irfankabir02@gmail.com` controls 67% of `crypto` code

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive/summary.json#L51)

### 2. `GRID-main` has multiple low-bus-factor auth hotspots

- Bus factor 1 sensitive files identified by the model include:
  - `src/grid/auth/schemas.py`
  - `safety/auth/manager.py`
  - `src/grid/auth/rbac.py`
  - `tests/auth/test_token_manager.py`

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main/summary.json#L70)

### 3. `GRID-main` ownership is likely more concentrated than it looks because of identity split

- The people graph shows two primary human-looking identities with nearly all sensitive touches:
  - `caraxesthebloodwyrm02@gmail.com`: 148 commits, 27.00 sensitive touches
  - `irfankabir02@gmail.com`: 48 commits, 15.00 sensitive touches

Relevant lines: [people.csv](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main/people.csv#L2)

This matters because if these identities belong to the same operator, the practical bus factor for sensitive code is lower than the current graph reports.

### 4. The archived crypto hotspot was removed by path-exclude filters

- The `crypto` hotspot flagged by the model is under an archived backup worktree path:
  - `archive/build_backup/.worktrees/.../src/tools/crypto/grid_bet.py`

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main/summary.json#L98)

After rerunning with `--path-exclude 'archive/**' --path-exclude '**/build_backup/**'`, this hotspot no longer appears in [ownership-map-out/GRID-main-no-archive/summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive/summary.json#L74). That confirms the archive path was analysis noise for the active-code ownership view.

### 5. Workspace root repo is single-maintainer in the analyzed window

- Root repo stats: 12 commits, 1 person, no hidden owners, no sensitive bus-factor hotspots.

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/workspace-root/summary.json#L46)

### 6. `mcp-tool-experiment` is also single-maintainer in the analyzed window

- Stats: 1 commit, 1 person, no hidden owners, no sensitive hotspots.

Relevant lines: [summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/mcp-tool-experiment/summary.json#L46)

## Recommended Follow-up

1. Add a `.mailmap` or otherwise normalize author identities before using these numbers for policy or escalation.
2. Assign a second maintainer or mandatory reviewer to `GRID-main` auth and secret-handling paths, especially `src/grid/auth/*` and `safety/auth/*`.
3. Use the cleaned `GRID-main-no-archive` outputs as the primary active-code ownership view, and keep the baseline `GRID-main` outputs only for comparison.
4. Compare the generated ownership outputs against any CODEOWNERS or reviewer policy you use, to catch mismatch between formal ownership and actual commit history.

### Exclude flags for a cleaner GRID-main run

The skill's runner supports `--path-exclude` (repeatable). Paths matching these globs are excluded from ownership/touch analysis so archive/backup worktrees do not appear as hotspots. I reran `GRID-main` with:

```bash
/mnt/c/Users/USER/CascadeProjects/.tmp-ownership-venv/bin/python \
  /mnt/c/Users/USER/.codex/skills/security-ownership-map/scripts/run_ownership_map.py \
  --repo /mnt/c/Users/USER/CascadeProjects/GRID-main \
  --out /mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive \
  --since '12 months ago' \
  --emit-commits \
  --path-exclude 'archive/**' \
  --path-exclude '**/build_backup/**'
```

The resulting summary records those exclusions in [ownership-map-out/GRID-main-no-archive/summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive/summary.json#L44).

### Identity normalization with `.mailmap`

`GRID-main` has a [.mailmap](/mnt/c/Users/USER/CascadeProjects/GRID-main/.mailmap) that maps `irfankabir02@gmail.com` → `Irfan Kabir <caraxesthebloodwyrm02@gmail.com>`. I reran the ownership map with `--use-mailmap`:

```bash
/mnt/c/Users/USER/CascadeProjects/.tmp-ownership-venv/bin/python \
  /mnt/c/Users/USER/.codex/skills/security-ownership-map/scripts/run_ownership_map.py \
  --repo /mnt/c/Users/USER/CascadeProjects/GRID-main \
  --out /mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-mailmap \
  --since '12 months ago' \
  --emit-commits \
  --path-exclude 'archive/**' \
  --path-exclude '**/build_backup/**' \
  --use-mailmap
```

The run records `use_mailmap: true` in [ownership-map-out/GRID-main-mailmap/summary.json](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-mailmap/summary.json#L48), but the generated outputs still show separate identities in [people.csv](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-mailmap/people.csv#L2).

Repo-level verification shows:

- `git check-mailmap 'Irfan Kabir <irfankabir02@gmail.com>'` resolves to `Irfan Kabir <caraxesthebloodwyrm02@gmail.com>`
- but `git show --use-mailmap` on a known commit still prints `Irfan Kabir <irfankabir02@gmail.com>`

So the ownership script used the flag correctly, but Git in this environment did not canonicalize those commit identities in the log output consumed by the script. Treat the mailmap run as an attempted normalization pass, not a successful identity collapse.

**Update:** The ownership-map script was patched to apply **post-log mailmap resolution**: when `--use-mailmap` is set, each commit's author/committer is resolved via `git check-mailmap` (with caching) and the canonical identity is used for people/edges. Rerunning with `--use-mailmap` should now collapse identities regardless of whether `git log --use-mailmap` canonicalizes in your environment. Use the same command as above with a fresh output dir (e.g. `--out .../ownership-map-out/GRID-main-mailmap-v2`) to verify.

### CODEOWNERS vs ownership map (drift check)

| CODEOWNERS path                         | Ownership map (cleaned)                                                                            | Notes                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| `/src/grid/auth/`                       | Bus-factor 1: `src/grid/auth/schemas.py`, `src/grid/auth/rbac.py`; top owner caraxesthebloodwyrm02 | Aligned                          |
| `/safety/auth/`                         | Bus-factor 1: `safety/auth/manager.py`; top owner caraxesthebloodwyrm02                            | Aligned                          |
| `/src/application/mothership/security/` | Not in bus_factor_hotspots; auth/secrets concentration in summary                                  | No hotspot file; still sensitive |
| `/tests/auth/`                          | Bus-factor 1: `tests/auth/test_token_manager.py`; top owner irfankabir02 (cleaned run)             | Aligned                          |

Formal ownership (CODEOWNERS) and actual ownership (ownership map) cover the same sensitive paths. CODEOWNERS currently lists a single owner per path; the report recommends adding a second reviewer for these paths when available.

## Output Artifacts

- Root repo: [ownership-map-out/workspace-root](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/workspace-root)
- `GRID-main` baseline: [ownership-map-out/GRID-main](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main)
- `GRID-main` cleaned active view: [ownership-map-out/GRID-main-no-archive](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-no-archive)
- `GRID-main` with mailmap attempt: [ownership-map-out/GRID-main-mailmap](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/GRID-main-mailmap)
- `mcp-tool-experiment`: [ownership-map-out/mcp-tool-experiment](/mnt/c/Users/USER/CascadeProjects/ownership-map-out/mcp-tool-experiment)

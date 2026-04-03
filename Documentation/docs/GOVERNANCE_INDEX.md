# Governance Index — CascadeProjects (hogsmade monorepo)

**Last updated**: 2026-03-24
**Canonical rules source**: `/home/caraxes/.dev-rules.md` (TUV-001 v1.0.0)

This index is the single entry point for all governance, contract, and policy documents in the workspace. Authority levels are: **canonical** (source of truth), **derived** (generated from canonical), **project-scoped** (applies within one sub-project only).

---

## Trust Contract

| Document                                               | Authority     | Purpose                                                                                                           |
| ------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/home/caraxes/.dev-rules.md`                          | **Canonical** | TUV-001 Unbreakable Vow — 3 conditions, 9 clauses, 5 never-rules. Primary shared rules baseline for all AI tools. |
| `/home/caraxes/seed/templates/development-contract.md` | **Canonical** | Full contract source with enforcement patterns, violation protocols, amendment protocol, and changelog.           |
| `/home/caraxes/.claude/rules/development-contract.md`  | Derived       | Claude Code adapter — TUV-001 summary loaded per session.                                                         |
| `/home/caraxes/.claude/rules/dev-rules.md`             | Derived       | Claude Code adapter — coding standards + TUV-001 activation.                                                      |

---

## Workspace-Level Policies

| Document                                                           | Authority     | Purpose                                                                                                             |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/home/caraxes/CLAUDE.md`                                          | **Canonical** | Root workspace map — directory layout, GitHub accounts, project relationships, build order, MCP config references.  |
| `/home/caraxes/CascadeProjects/CLAUDE.md`                          | Derived       | CascadeProjects-scoped AI guidance — project table, per-project commands, freelance context, operational standards. |
| `/home/caraxes/CascadeProjects/AGENTS.md`                          | **Canonical** | AI behavioral contract — MUST DO / MUST NOT rules, detection signals, recovery actions for AI agents.               |
| `/home/caraxes/CascadeProjects/.agents/AI-ALIGNMENT-GUARDRAILS.md` | Derived       | 5-layer AI guardrails framework — extends AGENTS.md with detection signals and escalation logic.                    |

---

## Security Policies

| Document                                                      | Authority      | Purpose                                                                                                                                   |
| ------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/home/caraxes/CascadeProjects/SECURITY.md`                   | **Canonical**  | Monorepo vulnerability reporting policy. ⚠️ Minimal — needs SLA, scope, and incident response fields (see Tier 3 audit item #12).         |
| `/home/caraxes/CascadeProjects/GRID-main/SECURITY.md`         | Project-scoped | GRID-specific security policy — mature (supported versions, scope, SLA, threat model). Security contact: caraxesthebloodwyrm02@gmail.com. |
| `/home/caraxes/CascadeProjects/.trufflehog.yml`               | Derived        | TruffleHog configuration for secrets scanning.                                                                                            |
| `/home/caraxes/CascadeProjects/.trufflehog-exclude-paths.txt` | Derived        | Secrets scan exclusion paths.                                                                                                             |

---

## Ownership & Access

| Document                                           | Authority     | Purpose                                                                                |
| -------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `/home/caraxes/CascadeProjects/.github/CODEOWNERS` | **Canonical** | Code ownership matrix — maps paths to GitHub accounts. Primary: caraxesthebloodwyrm02. |
| `/home/caraxes/CascadeProjects/CONTRIBUTING.md`    | **Canonical** | Contribution workflow — branch, commit, PR, review conventions.                        |

---

## CI/CD Workflows (`.github/workflows/`)

| Workflow                    | Trigger                                                                               | Purpose                                                                                                                        | Status   |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `secrets-gate.yml`          | push / PR                                                                             | TruffleHog + custom credential detection                                                                                       | ✓ Active |
| `pr-contract.yml`           | PR open                                                                               | Enforces 9 required PR sections                                                                                                | ✓ Active |
| `boundary-gate.yml`         | PR touching `GRID-main/**/safety/**`, `**/security/**`, `**/boundaries/**`, safety.md | Runs safety/boundary tests, posts structural invariant review, blocks on findings                                              | ✓ Active |
| `ownership-gate.yml`        | PR to main / hogsmade                                                                 | Checks sensitive-path ownership, sole-owner policy, test coverage — deny or escalate via `OwnershipGovernance` in shared-types | ✓ Active |
| `root-ts-ci.yml`            | push/PR, all branches                                                                 | Runs `run_repo_contract_checks.sh` (repo contract checks only — distinct from build CI)                                        | ✓ Active |
| `root-typescript-ci.yml`    | push/PR, all branches                                                                 | Full build + test for shared-types, all MCP servers, glimpse-artifact, glimpse-engine. Node 22.                                | ✓ Active |
| `ts-ci.yml`                 | push/PR to main only                                                                  | Full build + test for shared-types, all MCP servers, glimpse-artifact. Node 22.                                                | ✓ Active |
| `grid-main-ci.yml`          | push/PR                                                                               | GRID-main test suite (lint → type-check → security → test → build)                                                             | ✓ Active |
| `cross-project-smoke.yml`   | weekly                                                                                | shared-types → MCP server build chain verification                                                                             | ✓ Active |
| `dependabot-auto-merge.yml` | PR open                                                                               | Auto-squash-merge patch/minor Dependabot PRs after CI                                                                          | ✓ Active |
| `auto-label-agent-fix.yml`  | workflow_run                                                                          | Labels failed Dependabot PRs with `agent:fix`                                                                                  | ✓ Active |
| `agent-fix.yml`             | `agent:fix` label                                                                     | Self-hosted runner runs Codex to fix failing CI                                                                                | ✓ Active |
| `stale-branches.yml`        | monthly                                                                               | Reports branches >90 days old                                                                                                  | ✓ Active |
| `verify-mcp-inventory.yml`  | push/PR                                                                               | Validates MCP manifest vs config via `verify_mcp_inventory.py`                                                                 | ✓ Active |

**TS CI workflow roles (not duplicates):**

- `root-ts-ci.yml` — contract/structural checks only (`run_repo_contract_checks.sh`)
- `root-typescript-ci.yml` — pre-merge guard (all branches), full build+test
- `ts-ci.yml` — post-merge safety net (main-only), full build+test

---

## Pre-Commit Hooks

| Hook                      | Purpose                           |
| ------------------------- | --------------------------------- |
| trailing-whitespace       | Trim trailing whitespace          |
| end-of-file-fixer         | Insert final newline              |
| check-merge-conflict      | Detect unresolved merge markers   |
| detect-secrets (baseline) | Block secrets from commits        |
| verify-mcp-inventory      | Validate MCP manifest consistency |

Config: `/home/caraxes/CascadeProjects/.pre-commit-config.yaml`

---

## MCP Server Config

| File                                           | Authority     | Purpose                                                                        |
| ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `CascadeProjects/mcp_config.json`              | **Canonical** | Single source of truth for all MCP servers across all editors                  |
| `CascadeProjects/mcp_inventory.manifest.json`  | Canonical     | Bootstrap contracts, excluded servers, inventory for `verify_mcp_inventory.py` |
| `CascadeProjects/claude_code_config.json`      | Derived       | Claude Code format (cwd supported, 15 servers)                                 |
| `CascadeProjects/zed_config.jsonc`             | Derived       | Zed format (absolutized paths, 15 servers)                                     |
| `~/.codeium/windsurf/windsurf/mcp_config.json` | Derived       | Windsurf (absolutized, no cwd) — verify for drift                              |
| `~/.codeium/windsurf-next/mcp_config.json`     | Derived       | Windsurf-Next — verify for drift                                               |
| `CascadeProjects/.cursor/mcp.json`             | Derived       | Cursor (cwd supported) — verify for drift                                      |
| `~/.config/opencode/config.json`               | Derived       | OpenCode (absolutized) — verify for drift                                      |

Verification: `python3 CascadeProjects/scripts/verify_mcp_inventory.py`

---

## Agent Identity & CI Bot

`ci-discovery-bot <ci-discovery-bot@users.noreply.github.com>` is the intentional identity for automated AI agent sessions (Claude Code and similar). Repos with this identity in local `.git/config` have had agent sessions active. It is **not a misconfiguration** — it distinguishes automated commits from human commits. Branch protection prevents bot commits from landing directly on main/hogsmade.

Affected repos: `roots/GRID/`, `roots/apiguard/`, `grove/Vision/`, `CascadeProjects/`

---

## GRID Dual-Presence Rule

Two GRID checkouts exist pointing to the same remote (`GRID-INTELLIGENCE/GRID.git`):

- **`roots/GRID/`** — primary, full clone, SSH remote. All GRID development happens here.
- **`CascadeProjects/GRID-main/`** — read-only submodule. Never commit from within this directory.

The submodule uses HTTPS remote; `roots/GRID/` uses SSH (`git@github-caraxes:`). Update the submodule pointer in CascadeProjects separately when pinning a new GRID version.

---

## Open Governance Gaps (from 2026-03-24 audit)

| Gap                                                                                       | Priority | Plan Item               |
| ----------------------------------------------------------------------------------------- | -------- | ----------------------- |
| Root `SECURITY.md` missing SLA, scope, incident response                                  | High     | Plan item #12           |
| AGENTS.md naming inconsistency across projects                                            | Medium   | Plan item #13           |
| No conventional commit enforcement in CI                                                  | Medium   | Plan item #14           |
| `ts-ci.yml` mcp-servers job missing `shared-resilience` build step (grid-server may fail) | Medium   | Discovered during audit |
| Windsurf / Cursor / OpenCode MCP configs unverified for drift                             | Medium   | Plan item #11           |
| No SCA (Snyk / pip-audit / npm audit) in CI                                               | Low      | Plan item #16           |
| `glimpse-server` governance sign-off path undefined                                       | Low      | Plan item #17           |
| TUV-001 amendment enforcement (pre-commit hook on contract files)                         | Low      | Plan item #18           |

# Codex Active Coding Cheat Sheet

Compact prompt and command reference for the local Codex CLI setup in this workspace.

## Quick Start

1. Restart Codex so it reloads `~/.codex/config.toml`.
2. Ask for outcomes directly. Name the MCP server or skill when it matters.
3. Let Codex inspect code, make the change, and verify it in one pass.

Good kickoff prompt:

```text
Use overview-server for a checkpoint summary, then pulse-server for priorities, then inspect the repo I am changing and implement the top fix end to end.
```

## Best Prompt Pattern

```text
Use <relevant MCP server(s)> to establish current state, inspect the codebase directly, implement the fix, verify it with tests or analysis tools, and report only the concrete outcome and residual risks.
```

## Daily Coding

```text
Use overview-server to give me a checkpoint for CascadeProjects, then use pulse-server to tell me the highest-priority work, then inspect the relevant repo and implement the fix end to end.
```

```text
Use pulse-server for a morning briefing, then use seeds-server and maintain-server to identify the noisiest repo or environment issue, and fix the top actionable problem.
```

```text
Use code-analysis and test-runner on the package I am editing, explain the highest-risk issues first, then make the necessary code changes and rerun the narrowest relevant checks.
```

## Code Review

```text
Use trust-contract-review and review this change like a real code review: findings first, ordered by severity, with file references and concrete regression risks.
```

```text
Use code-analysis on the touched files, then do a manual review focused on bugs, broken contracts, missing tests, and operational risk. Do not give me a summary until after the findings.
```

```text
Compare the recent code in this repo against its tests and runtime assumptions, then tell me what is most likely to break in production.
```

## MCP and Workspace Operations

```text
Use mcp-server-setup to validate the MCP environment, build order, and dependency health for CascadeProjects, then repair anything that is out of spec.
```

```text
Use overview-server, echoes-server, and eligibility-server together to tell me whether the workspace is structurally healthy, operationally trustworthy, and ready for serious work.
```

```text
Use maintain-server and seeds-server to find environment drift, stale artifacts, or unhealthy repos, then clean up the highest-value issues without touching unrelated work.
```

## GRID Admission and Governance

```text
Use grid-server and eligibility-server to verify governance readiness for this change, then tell me what would block promotion or deployment.
```

```text
Use the admission runtime workflow from scripts/grid-admission-runtime.mjs, ensure GRID-main is available, run the guarded command, and summarize the before/after admission state.
```

```text
Use grid-server admission tools plus overview-server to assess whether GRID is reachable, whether the gate is healthy, and whether this workspace is safe to proceed with deployment-related work.
```

## Deep Context and RAG

```text
Use grid-rag-enhanced to answer this question from the GRID codebase and docs, cite the key source files, then convert that into a concrete implementation plan.
```

```text
Use grid-intelligence and grid-rag-enhanced to map the relevant entities, traces, and documentation context for this problem before making code changes.
```

## Skills Available

- `mcp-server-setup`: build order, MCP initialization, dependency repair, environment validation
- `trust-contract-review`: TUV-001 and trust-layer review
- `os-guardrails`: Linux hardening, firewall, audit, exposure review
- `cybersafety`: non-technical cyber incident guidance

Use them explicitly in prompts:

```text
Use mcp-server-setup and get this workspace back to a valid MCP state.
```

```text
Use trust-contract-review and review this PR for contract violations.
```

```text
Use os-guardrails and audit my nftables posture.
```

## Runtime Commands

Run from the workspace root:

```bash
node scripts/grid-admission-preflight.mjs
node scripts/grid-admission-gate.mjs -- <command> [args...]
node scripts/grid-admission-runtime.mjs --ensure-grid-main -- <command> [args...]
```

Most useful command:

```bash
node scripts/grid-admission-runtime.mjs --ensure-grid-main -- node -e "console.log('ADMISSION_READY')"
```

## Notes

- Codex will spawn the configured MCP servers automatically.
- `grid-server` admission features still depend on `GRID-main` at `http://localhost:8080`.
- GRID RAG tools depend on the local GRID Python environment and, for RAG, local Ollama on `http://localhost:11434`.
- For serious tasks, ask for state, change, verification, and residual risk in one prompt.

# Security Surface — ori-server v1.0.0

> What to probe, what to flag, and where each boundary lives.
> Written for both security-focused agents and human reviewers.

---

## Threat Model

ori-server executes external commands (test runners) and persists data to disk.
These are the two primary attack surfaces.

---

## Boundary 1: Test Execution Sandbox

**What it does**: Spawns child processes to run test suites.
**Where it lives**: `src/executor.ts`

### Controls

| Control | Implementation | Location |
|---------|---------------|----------|
| **Path restriction** | `ExecutionPolicyEngine` — validates target cwd is within allowed roots | `executor.ts:26-29` |
| **Allowed roots** | `config.cascadeRoot` + parent directory | `executor.ts:26-29` |
| **Command restriction** | Only registered runner commands (`uv`, `npx`, `node`) | `registry-data.ts` per project |
| **Timeout enforcement** | Per-project timeout, default 120s, max from runner config | `executor.ts:31` |
| **Buffer limit** | 5 MB max stdout/stderr capture | `executor.ts:32` |
| **Environment isolation** | `envOverrides` per project, not inherited shell env | `registry-data.ts` per project |

### What to probe

- Can a malicious `projectId` escape the sandbox?
  - Trace: `run_tests` → `loadRegistry()` → project lookup → `executionPolicy.validate(cwd)`
  - The policy checks the resolved absolute path starts with an allowed root.

- Can `envOverrides` inject dangerous values?
  - Trace: `registry-data.ts` defines static overrides per project.
  - Dynamic override is not exposed — env comes from seed data only.

- Can the parent-directory root (`path.resolve(cascadeRoot, "..")`) be too broad?
  - This allows execution anywhere under `$HOME`. The intent is to cover
    sibling workspaces (canopy/, roots/, grove/). Flag if this is too permissive
    for your deployment context.

### Known acceptable risk

The parent-directory scope is intentionally broad for the developer's multi-workspace
layout. In a narrower deployment, this should be tightened to explicit roots.

---

## Boundary 2: Data Persistence

**What it does**: Writes logs, probes, recommendations, reports, notebook, registry to disk.
**Where it lives**: `src/storage.ts`, `src/config.ts`

### Controls

| Control | Implementation | Location |
|---------|---------------|----------|
| **Data directory** | `~/.ori/` or `$ORI_DATA_DIR` | `config.ts:5-6` |
| **File format** | NDJSON (append-only) for logs/notebook, JSON for registry | `storage.ts`, `notebook.ts` |
| **No user PII** | Logs contain test output only, no user identity data | All storage modules |
| **No secrets in data** | Test output may contain env leaks — captured as-is | See "What to flag" below |

### What to probe

- Does `storage.ts` validate write paths or could path traversal reach outside `~/.ori/`?
  - Trace: All paths are constructed from `config.*Dir` + filename. No user-supplied path components.

- Could test stdout contain leaked secrets that get persisted?
  - Yes — if a test suite prints env vars or secrets, those land in `~/.ori/runs/` and `~/.ori/logs/`.
  - This is a **known residual risk**. The data directory should be treated as sensitive.

### What to flag

```
FLAG: security
SEVERITY: warning
FILE: src/executor.ts (runTestSuite output capture)
DESCRIPTION: Test stdout/stderr is persisted verbatim — may contain leaked env vars or secrets
RECOMMENDATION: Consider a post-capture scrub pass or document that ~/.ori/ is sensitive
```

---

## Boundary 3: Rate Limiting & Merit Guard

**What it does**: Prevents tool abuse and validates against GRID admission gate.
**Where it lives**: `src/server.ts:55-60`

### Controls

| Control | Implementation | Location |
|---------|---------------|----------|
| **Session rate limiter** | Per-tool call rate limiting | `server.ts:56` |
| **Merit guard** | GRID API validation for guarded tools | `server.ts:59` |
| **Circuit breaker** | If GRID is unreachable, guarded tools fail closed | Merit guard internals |
| **Graceful degradation** | Unguarded tools work normally when GRID is offline | By design |

### What to probe

- Which tools are guarded vs unguarded? Is the split correct?
  - See SURFACE.md "Guarded vs unguarded tools" section.
  - Guarded: `run_tests`, `run_all_tests`, `generate_report`, `clear_logs`, `discover_tests`

- When GRID is offline, what happens?
  - Guarded tools: blocked by circuit breaker, return error
  - Unguarded tools: work normally
  - `health_check`: reports circuit state as OPEN

### Known acceptable risk

When GRID is offline, unguarded tools (collect_logs, filter, probe, recommend,
notebook, ecosystem_context) remain fully functional. This is by design — read
and analysis operations should not require the gate.

---

## Boundary 4: Cross-Server Reads

**What it does**: Reads data from sibling MCP servers (echoes audit log, seeds snapshots).
**Where it lives**: `src/interop.ts`

### Controls

| Control | Implementation | Location |
|---------|---------------|----------|
| **Read-only** | Only reads files, never writes to external data stores | `interop.ts` |
| **Graceful absence** | Returns empty/null if files don't exist | `interop.ts` all functions |
| **Path configuration** | `$ECHOES_AUDIT_PATH`, seeds snapshot dir from config | `config.ts` |

### What to probe

- Can interop paths be manipulated to read arbitrary files?
  - Paths come from env vars or config defaults. No user-supplied path input.
  - But: if `ECHOES_AUDIT_PATH` is set to a sensitive file, it will be read and parsed.

---

## Summary Checklist

For the reviewer — check each box:

- [ ] Execution sandbox: paths validated, commands restricted, timeouts enforced
- [ ] Data persistence: no path traversal, no PII, sensitive data documented
- [ ] Rate limiting: present on all tools, merit guard on destructive/expensive ones
- [ ] Cross-server reads: read-only, graceful, no arbitrary file access
- [ ] No hardcoded secrets in source (verified: `grep -rn` returns 0 results)
- [ ] No hardcoded user paths in source (verified: `grep -rn "/home/"` returns 0 results)
- [ ] `.env.example` documents all configuration
- [ ] Destructive operations require confirmation phrases

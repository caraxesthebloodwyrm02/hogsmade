# MCP Security Report — Mangrove Workspace

**Date**: 2026-03-21
**Scope**: All MCP servers except glimpse-server
**Auditor**: Claude Opus 4.6 (automated, human-reviewed)
**TUV-001**: Active — Fidelity, Integrity, Accountability

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Active servers | 13 (7 TypeScript, 6 Python) |
| Excluded servers | 2 (grid-agentic, grid-memory) |
| Omitted (governance pending) | 1 (glimpse-server) |
| Total tools | ~80 |
| Transport | All stdio — zero exposed MCP ports |
| Network surface | 2 loopback endpoints (localhost:8080, localhost:11434) |
| JSON configs audited | 31 files against factory defaults |
| Findings | 13 (1 HIGH, 4 MEDIUM, 7 LOW, 1 INFO) |

---

## 2. Server Inventory & Tool Map

### 2.1 TypeScript Stack (CascadeProjects)

All servers: `npx tsx`, stdio transport, `@modelcontextprotocol/sdk ^1.27.1`, Zod validation.

#### echoes-server (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + data store status | Local filesystem | None |
| `record_audit` | Record audit entry from any pipeline | `~/.echoes/audit.ndjson` (append) | P-INT-001, P-INT-002 validation |
| `query_audit` | Query audit log with filters | `~/.echoes/audit.ndjson` (read) | None |
| `audit_stats` | Aggregate statistics | `~/.echoes/audit.ndjson` (read) | None |
| `save_telemetry` | Save workspace telemetry snapshot | `TELEMETRY_DIR` (write) | None |
| `list_telemetry` | List recent telemetry snapshots | `TELEMETRY_DIR` (read) | None |

**Controls**: AuditIntegrityGuard (P-INT-001/002/003), NDJSON injection sanitizer (`sanitizeForNdjson()`).

#### grid-server (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + GATE dir + deployment targets | Local filesystem | None |
| `list_targets` | GATE deployment targets with permissions | Local config | None |
| `validate_envelope` | Validate GATE envelope (fields, HMAC, nonce) | `localhost:8080/api/v1/gate/validate` + `GATE/` dir | HMAC-SHA256 fingerprint |
| `gate_audit` | Query GATE verification events | `GATE/AUDIT_PATH` (read) | None |
| `nonce_status` | List burned nonces | `GATE/NONCE_REGISTRY_PATH` (read) | None |
| `check_permission` | Check action permission on target | Local config | None |

**Controls**: GateSecurityPolicy (HMAC-SHA256 + `crypto.timingSafeEqual`, nonce replay prevention, fail-closed on remote unavailable), CircuitBreaker (3 failures/30s), Retry (2 attempts, 200ms-2s backoff). URL allowlist: localhost, 127.0.0.1, ::1 only.

#### afloat-server (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + workflow store status | Local filesystem | None |
| `workflow_create` | Create workflow definition | `WORKFLOWS_DIR` (write) | None |
| `workflow_list` | List workflow definitions | `WORKFLOWS_DIR` (read) | None |
| `workflow_get` | Get workflow details | `WORKFLOWS_DIR` (read) | None |
| `workflow_execute` | Execute workflow (dry-run default) | `HISTORY_DIR` (write) | None |
| `workflow_history` | List recent executions | `HISTORY_DIR` (read) | None |

**Controls**: Zod schemas, dry-run by default.

#### lots-server (7 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + experiment catalog status | Local filesystem | None |
| `experiment_create` | Register experiment | `EXPERIMENTS_DIR` (write) | P-MCP-001 path validation |
| `experiment_list` | List experiments | catalog.json (read) | None |
| `experiment_run` | Execute experiment script | Child process in `EXPERIMENTS_DIR` | `LOTS_ENABLE_EXPERIMENT_RUN` kill switch |
| `experiment_get` | Get experiment details | catalog.json (read) | None |
| `experiment_compare` | Compare two experiments | catalog.json (read) | None |
| `experiment_suggest` | Generate proposals from patterns | Reads echoes audit, seeds snapshots, afloat history | None |

**Controls**: ExecutionPolicyEngine (P-MCP-001), symlink rejection, path containment, kill switch (env var default off), 300s timeout, 1MB maxBuffer, sanitized env passthrough.

#### seeds-server (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + data store status | Local filesystem | None |
| `ecosystem_scan` | Scan all repos under Seeds root | `~/seed/` + git commands | None |
| `repo_detail` | Detailed health for single repo | Specific repo path + git | None |
| `bookmark_add` | Bookmark repo/file | `BOOKMARKS_PATH` (write) | None |
| `bookmark_list` | List bookmarks | `BOOKMARKS_PATH` (read) | None |
| `ecosystem_trend` | Compare recent snapshots | `SNAPSHOTS_DIR` (read) | None |

**Controls**: SEEDS_ROOT boundary, 30s scan rate limit.

#### pulse-server (11 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + connected data sources | Local filesystem | None |
| `morning_briefing` | Aggregate overnight changes + priorities | Reads echoes, seeds, afloat, own data | None |
| `check_alerts` | Query recent failures/warnings | Reads `~/.echoes/audit.ndjson` | None |
| `what_should_i_work_on` | AI-driven priority suggestion | Reads seeds, afloat, own focus sessions | None |
| `briefing_preferences_set` | Set adaptive briefing preferences | `PREFERENCES_PATH` (write) | None |
| `journal_add` | Add journal entry | `journal.ndjson` (append) | None |
| `journal_list` | List journal entries | `journal.ndjson` (read) | None |
| `focus_start` | Start focus session | `FOCUS_SESSION_PATH` (write) | None |
| `focus_interrupt` | Interrupt focus session | Focus session (update) | None |
| `focus_end` | End focus session | Focus session (update) | None |
| `daily_digest` | Summary of today + tomorrow suggestions | Aggregates all internal sources | None |

**Controls**: Read-only aggregation from other servers. Largest tool surface.

#### maintain-server (8 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `health_check` | Server + data store status | Local filesystem | None |
| `scan_temp` | Scan temp/cache dirs for cleanup | System temp targets | None |
| `scan_workspaces` | Scan for hygiene issues | Workspace roots (configurable) | None |
| `scan_git_repos` | Git health (loose objects, stale branches) | Git repos + `git gc --aggressive --prune` | None |
| `scan_system` | RAM, disk, top processes | `os` module + `ps axo` command | None |
| `full_diagnostic` | All scans + health score | All scan targets | P-MCP-002, P-MCP-005 |
| `cleanup_execute` | Execute cleanup (2-step safety) | Safe targets validated by policy | Preview token + CONFIRM-CLEANUP |
| `report_history` | Query past diagnostic reports | `REPORTS_DIR` (read) | None |

**Controls**: ExecutionPolicyEngine (path validation), multi-step approval (crypto.randomBytes(16) preview token, 5min TTL, SHA256 action hash, CONFIRM-CLEANUP phrase), 30s rate limiting, symlink guard, cycle detection via inode, atomic writes.

---

### 2.2 Python Stack (roots/GRID)

All servers: `/home/caraxes/roots/GRID/.venv/bin/python`, stdio transport.

#### grid-rag (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `rag_index` | Index documents from directory | Filesystem I/O + Ollama `localhost:11434` + ChromaDB | None |
| `rag_query` | Search knowledge base with AI answers | Ollama `localhost:11434` + ChromaDB | None |
| `rag_add_document` | Add single document | ChromaDB vector store | None |
| `rag_on_demand` | Query-time RAG (temp index + answer) | Filesystem scan + Ollama | None |
| `rag_search` | Semantic search without AI generation | ChromaDB vector store | None |
| `rag_stats` | Knowledge base statistics | ChromaDB | None |

**Controls**: SecurePathManager for sys.path validation, MCP SDK schema. HTTP client: httpx (no resilience wrapper).

#### grid-rag-enhanced (6 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `query` | Conversational RAG with multi-hop | Ollama `localhost:11434` + ChromaDB | None |
| `create_session` | Create conversation session | RAG engine state | None |
| `get_session` | Get session info | RAG engine state | None |
| `delete_session` | Delete session | RAG engine state | None |
| `get_stats` | RAG system statistics | RAG engine state | None |
| `index_documents` | Index documents | Filesystem + Ollama + ChromaDB | None |

**Controls**: Lazy initialization (delays Ollama connection), MCP SDK schema, Ollama connectivity check.

#### grid-enhanced-tools (7 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `performance_profiler` | Profile code (CPU, memory, line) | `subprocess`: cProfile/memory_profiler/line_profiler | None |
| `security_auditor` | Audit for vulnerabilities | `subprocess`: bandit, detect-secrets, pip-audit | None |
| `test_coverage_analyzer` | Analyze test coverage | `subprocess`: pytest --cov | None |
| `documentation_generator` | Generate docs from code | `subprocess`: sphinx, pydoc | None |
| `dependency_health_monitor` | Monitor dependency health | `subprocess`: pip list, pip-audit, pip-licenses | None |
| `code_quality_gate` | Enforce quality standards | `subprocess`: ruff, radon, black, mypy | None |
| `workflow_orchestrator` | Automate dev workflows | Template execution (no external calls) | None |

**Controls**: `_sanitize_target_for_command()` regex allowlist (`^[a-zA-Z0-9_.\-/\\:\s]+$`), max length 512, `_is_safe_module_name()` check, 30-120s timeouts, CRIT-6 `python -c` injection guard. All subprocess via `asyncio.create_subprocess_exec`.

#### portfolio-safety-lens (4 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `portfolio_summary_safe` | Sanitized portfolio metrics | Coinbase archive (local) | None |
| `portfolio_risk_signal` | Risk score and signals | Coinbase archive (local) | None |
| `audit_log_tail` | Recent security events (hashed IDs) | Audit logger | None |
| `governance_lint` | Policy compliance check | Coinbase archive (local) | None |

**Controls**: AI safety layer, data policy enforcement, audit logger, graceful degradation on missing deps. All outputs hashed/truncated.

#### code-analysis (3 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `analyze_code` | Quality analysis | `subprocess.run`: ruff, mypy, black | None |
| `check_security` | Security scan (patterns) | File content read (regex) | None |
| `get_complexity` | Complexity metrics | File I/O (line counting) | None |

**Controls**: Custom JSON-RPC (not MCP SDK), 30s timeout. **No path containment, no schema validation library.**

#### test-runner (4 tools)

| Tool | Description | Target | Auth |
|------|-------------|--------|------|
| `run_tests` | Run pytest | `subprocess.run`: pytest | None |
| `run_coverage` | Tests with coverage | `subprocess.run`: pytest --cov | None |
| `discover_tests` | Find test files | `Path.rglob("test_*.py")` | None |
| `get_test_summary` | Test summary (no execution) | `subprocess.run`: pytest --collect-only | None |

**Controls**: Custom JSON-RPC, 60s timeout. **No path containment, no schema validation library.**

---

## 3. Endpoint Map

### 3.1 Network Endpoints

| Endpoint | Protocol | Caller(s) | Purpose | Resilience |
|----------|----------|-----------|---------|------------|
| `http://localhost:8080/api/v1/gate/validate` | HTTP POST | grid-server | GATE envelope validation | CircuitBreaker (3 failures/30s), Retry (2 attempts, exponential backoff), fail-closed fallback |
| `http://localhost:11434` | HTTP | grid-rag, grid-rag-enhanced | Ollama embeddings + LLM inference | **None** — no circuit breaker, no timeout wrapper |

### 3.2 Filesystem Boundaries

| Path | Access | Server(s) |
|------|--------|-----------|
| `~/.echoes/audit.ndjson` | R/W | echoes, lots, maintain, grid |
| `~/CascadeProjects/GATE/` | R/W | grid |
| `~/CascadeProjects/experiments/` | R/W/Exec | lots |
| `~/seed/` | R/W | seeds, maintain |
| `~/roots/GRID/.rag_db/` | R/W | grid-rag, grid-rag-enhanced |
| `/tmp`, `~/.npm/_cacache`, `~/.cache/pip` | R/W (cleanup) | maintain |

### 3.3 Subprocess Targets

| Binary | Server(s) | Protection |
|--------|-----------|------------|
| git, ps, df, npm, pip | maintain-server | ExecutionPolicyEngine + multi-step approval |
| python, node, bash | lots-server | ExecutionPolicyEngine + kill switch |
| ruff, mypy, bandit, pip-audit, sphinx, pydoc, radon, black | grid-enhanced-tools | Regex sanitizer + timeouts |
| ruff, mypy, black | code-analysis | **Timeout only** |
| pytest | test-runner | **Timeout only** |

---

## 4. Attack Surface Analysis

### 4.1 Process Execution

Four servers spawn child processes. Risk decreases with controls:

1. **maintain-server** (LOW risk): Full policy engine + multi-step approval + rate limiting
2. **lots-server** (LOW-MEDIUM risk): Policy engine + kill switch, but no dry-run once enabled
3. **grid-enhanced-tools** (MEDIUM risk): Regex sanitizer, but subprocess targets vary widely
4. **code-analysis + test-runner** (HIGH risk): Timeout only — no path containment or input sanitization

### 4.2 Input Validation Tiers

| Tier | Method | Servers |
|------|--------|---------|
| **Strong** | Zod schemas | All 7 TypeScript servers |
| **Medium** | MCP SDK schema | grid-rag, grid-rag-enhanced, grid-enhanced-tools, portfolio-safety-lens |
| **Weak** | Manual `dict.get()` | code-analysis, test-runner |

### 4.3 Cryptographic Controls

| Control | Implementation | Quality |
|---------|---------------|---------|
| GATE fingerprint | HMAC-SHA256 + `crypto.timingSafeEqual` | Strong (timing-safe) |
| Nonce replay | Registry-based burn-after-use | Strong |
| Preview tokens | `crypto.randomBytes(16)` (128-bit) | Sufficient |
| Test secret detection | 6-string blocklist, non-test environments only | Basic |

---

## 5. Runtime Posture (Verified 2026-03-21)

### 5.1 Process State

- **Python servers**: 12 instances running (2 per server, ~500MB combined)
  - enhanced_tools (64-78 MB), test_runner (18-19 MB), code_analysis (18-19 MB)
  - portfolio_safety (78-148 MB), grid_rag (146-155 MB), enhanced_rag (146-154 MB)
- **TypeScript servers**: 7 processes per editor session (via `npx tsx`)
- **Ports**: Zero MCP ports exposed. Dependent: Ollama (:11434), GRID API (:8080)

### 5.2 Ollama Model Inventory (Verified)

| Config Reference | Available Model | Status |
|-----------------|-----------------|--------|
| `ministral:latest` (mcp_config.json) | `ministral-3:14b-cloud` | **Name mismatch** — cloud-proxied variant |
| `nomic-embed-text-v2-moe:latest` (mcp_config.json) | Not found in `ollama list` | **Missing** — embedding model not loaded |
| `qwen3-coder:480b-cloud` (rag-server-config.json) | Not found in `ollama list` | **Missing** — workspace override model not loaded |

20 cloud-proxied models available. Local models may need `ollama pull`.

### 5.3 Audit Trail

- **Location**: `~/.echoes/audit.ndjson` (18 entries)
- **Recent activity**: Security hardening, ecosystem scans, journal entries
- **Integrity**: AuditIntegrityGuard active (source allowlist, timestamp freshness, score delta)

### 5.4 Build State

All 7 TypeScript servers built 2026-03-21 02:19-02:20. Node modules current (~78MB each). Git: `hogsmade` branch, clean.

---

## 6. Security Policy Engine Coverage

### 6.1 Policy Rules (shared-types/src/security-policy.ts)

| Guard Class | Policy IDs | Threat Basis | Wired Into | Status |
|-------------|-----------|--------------|------------|--------|
| ExecutionPolicyEngine | P-MCP-001, 002, 003, 005 | TM-003 (local tool abuse) | lots, maintain | **Active** |
| AuditIntegrityGuard | P-INT-001, 002, 003 | TM-004 (audit poisoning) | echoes, grid | **Active** |
| GateSecurityPolicy | P-INT-004, 005, 006 | TM-005 (GATE bypass), SBP-001 (secrets) | grid | **Active** |
| ReadScopePolicy | P-MCP-004 | TM-006 (reconnaissance) | **None** | **Dead code** |
| OwnershipGovernance | P-GOV-001, 002, 003 | OWN-001, OWN-002 (governance) | CI/CD (ownership-gate.yml) | **Active** |

### 6.2 Multi-Step Safety (Destructive Operations)

**maintain-server `cleanup_execute`**:
1. Dry-run → preview of actions
2. Preview token issued (crypto.randomBytes, SHA256 action hash, 5min TTL)
3. Confirm phrase required: `CONFIRM-CLEANUP`
4. Token + phrase validated → execute

**lots-server `experiment_run`**: Kill switch only (`LOTS_ENABLE_EXPERIMENT_RUN`, default off). No dry-run/confirm once enabled.

---

## 7. JSON Configuration Audit — Factory Defaults vs Actual

### 7.1 tsconfig.json (9 packages)

| Setting | Factory (@tsconfig/node22) | Actual | Delta |
|---------|---------------------------|--------|-------|
| target | ES2022 | ES2022 | None |
| module | NodeNext | NodeNext | None |
| strict | true | true | None |
| esModuleInterop | true | true | None |
| skipLibCheck | true | true | None |
| forceConsistentCasingInFileNames | false | true | **Hardened** |
| resolveJsonModule | false | true | Custom (correct) |
| isolatedModules | false | **Not set** (servers) / true (glimpse-artifact) | **Gap** (F-09) |
| noUnusedLocals | false | true (shared-resilience only) | Inconsistent |
| noUnusedParameters | false | true (shared-resilience only) | Inconsistent |

### 7.2 package.json (7 MCP servers)

| Field | Factory (MCP template) | Actual | Delta |
|-------|----------------------|--------|-------|
| type | "module" | **Not set** | **Gap** (F-10) |
| engines | `"node": ">=18"` | **Not set** | Missing |
| @modelcontextprotocol/sdk | 1.27.1 | ^1.27.1 | Current |
| zod | 4.x available | ^3.22.0 | Correct (MCP SDK peer-deps zod@3) |
| typescript | 5.9.3 | ^5.5.0 (servers) / ~5.9.3 (shared-types) | **Skew** (F-11) |
| @types/node | 25.x available | ^20.0.0 | **Behind** (F-11) |

### 7.3 GRID mcp-setup/mcp_config.json vs CascadeProjects Canonical

| Aspect | GRID Config | Canonical | Delta |
|--------|------------|-----------|-------|
| Transport | HTTP (ports 8000-8009) | stdio | **Different model** (F-13) |
| Health checks | /health, 30s interval | Not configured | GRID more robust |
| RAG model | qwen3-coder:480b-cloud | ministral:latest | **Mismatch** (F-12) |
| Disabled servers | 4 (agentic, memory, filesystem, database) | 2 (agentic, memory) | GRID lists more |

---

## 8. Findings

### F-01 — Python code-analysis/test-runner: no path containment (HIGH)

`analyze_code(file_path)` and `run_tests(test_path)` pass user-supplied paths to subprocess without validation. An MCP caller can target any readable file on the system.

- **TUV-001**: Clause II.1 (Fail-Closed on Ambiguity)
- **Verified**: SecurePathManager is available in GRID venv (`grid.security.path_manager`) — fix is feasible
- **Files**: `roots/GRID/mcp-setup/server/code_analysis_mcp_server.py`, `test_runner_mcp_server.py`
- **Fix**: Add path containment restricting to GRID workspace root. Import `SecurePathManager` or implement allowlist.

### F-02 — ReadScopePolicy (P-MCP-004) defined but never wired (MEDIUM)

Bulk-read reconnaissance throttle (20 calls/60s) exists in `security-policy.ts` but zero server imports it.

- **TUV-001**: Clause I.1 (Provenance Traceability) — threat model documented, mitigation inert
- **Verified**: `rg "ReadScopePolicy" --glob "**/server.ts"` returns zero matches
- **File**: `CascadeProjects/shared-types/src/security-policy.ts:659`
- **Fix**: Wire into pulse-server, echoes-server, seeds-server — or document risk acceptance.

### F-03 — Ollama HTTP calls lack resilience (MEDIUM)

grid-rag and grid-rag-enhanced call `localhost:11434` with no circuit breaker, retry, or timeout at the HTTP transport layer. A hung Ollama blocks the server indefinitely.

- **TUV-001**: Clause II.2 (Anti-Degradation Signal)
- **Files**: `roots/GRID/src/tools/rag/llm/ollama_local.py` and related httpx calls
- **Fix**: Add httpx timeout + circuit breaker. The `shared-resilience` pattern (already used by grid-server) is available.

### F-04 — enhanced-tools debug log at predictable path (LOW-MEDIUM)

`_debug_log()` writes to `../../debug-14d2f0.log` — hardcoded debug artifact.

- **TUV-001**: Clause I.2 (Context Awareness)
- **Verified**: File exists at `/home/caraxes/roots/GRID/debug-14d2f0.log` (0 bytes)
- **File**: `roots/GRID/mcp-setup/server/enhanced_tools_mcp_server.py`
- **Fix**: Remove or gate behind `DEBUG` env var.

### F-05 — Asymmetric security posture: TS vs Python (MEDIUM)

TypeScript stack has shared policy engine (12 rules), resilience layer, Zod validation, audit client. Python custom JSON-RPC servers (code-analysis, test-runner) have none of these.

- **TUV-001**: Clause I.3 (Scope Fidelity) — security contract scope gap
- **Fix**: Create Python security policy module or at minimum implement path containment + input validation.

### F-06 — Audit write failures silently swallowed (LOW)

lots-server lines 533, 1047: empty `catch` blocks around `emitAudit()`. Comment: "must not mask successful operation" — correct intent, but no stderr logging.

- **TUV-001**: Clause III.1 (Self-Reporting)
- **Verified**: Lines 533 and 1047 in `lots-server/src/server.ts` — confirmed empty catch blocks
- **Fix**: Add `console.error` in catch blocks.

### F-07 — lots-server experiment_run: no dry-run flow (LOW)

Once `LOTS_ENABLE_EXPERIMENT_RUN=true`, scripts execute immediately without preview/confirm step.

- **TUV-001**: Clause II.1 (Fail-Closed on Ambiguity)
- **Fix**: Add dry-run + preview token pattern from maintain-server.

### F-08 — Archived Coinbase directory on PYTHONPATH (LOW)

portfolio-safety-lens adds `~/seed/archive/Coinbase_from_zip` to PYTHONPATH — archived code importable at runtime.

- **TUV-001**: Clause I.2 (Context Awareness)
- **Fix**: Validate archive integrity or isolate import scope.

### F-09 — `isolatedModules` not set on MCP servers (LOW)

Factory default is false, but tsx uses esbuild which requires isolated modules. glimpse-artifact sets it correctly; servers don't.

- **Fix**: Add `"isolatedModules": true` to all server tsconfig.json.

### F-10 — Missing `"type": "module"` in server package.json (LOW)

MCP SDK template recommends ESM. Servers work via tsx but miss explicit declaration.

- **Fix**: Add `"type": "module"` to all server package.json.

### F-11 — Dependency version skew across workspace (LOW)

TypeScript: shared-types uses ~5.9.3, servers use ^5.5.0. @types/node: ^20 everywhere but Node 22 types available.

- **Fix**: Align typescript to ~5.9.3 and @types/node to ^22.0.0.

### F-12 — Model mismatch in RAG configs (LOW-MEDIUM)

`rag-server-config.json` references `qwen3-coder:480b-cloud`; canonical uses `ministral:latest`. Ollama actually has `ministral-3:14b-cloud`. Embedding model `nomic-embed-text-v2-moe:latest` not found in Ollama model list.

- **TUV-001**: Clause I.2 (Context Awareness) — config-to-runtime drift
- **Fix**: Reconcile model references. Run `ollama pull nomic-embed-text-v2-moe:latest` if RAG indexing needed.

### F-13 — Dual transport model undocumented (INFO)

GRID `mcp-setup/mcp_config.json` defines HTTP transport (ports 8000-8009); canonical uses stdio. Two valid deployment modes but not documented.

- **Action**: Add transport model documentation to `mcp_inventory.manifest.json`.

---

## 9. Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| **P0** | F-01: Path containment for Python servers | Small | Closes highest-risk gap |
| **P1** | F-03: Ollama resilience wrapper | Medium | Prevents server hang |
| **P1** | F-05: Python security parity | Medium | Systemic improvement |
| **P2** | F-02: Wire ReadScopePolicy | Small | Activates existing code |
| **P2** | F-04: Remove debug log | Trivial | Hygiene |
| **P2** | F-12: Model mismatch in RAG configs | Small | Config drift |
| **P3** | F-06: Audit failure logging | Trivial | Observability |
| **P3** | F-07: Experiment dry-run | Small | Defense in depth |
| **P3** | F-08: Archive PYTHONPATH | Trivial | Import hygiene |
| **P3** | F-09: Add isolatedModules to tsconfig | Trivial | Transpiler safety |
| **P3** | F-10: Add "type": "module" to package.json | Trivial | ESM alignment |
| **P3** | F-11: Align TS + @types/node versions | Small | Consistency |
| **Info** | F-13: Dual transport documentation | Trivial | Clarity |

---

## 10. Generalized Factory Baseline

Standard JSON config baseline for Mangrove MCP servers (TypeScript):

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

```jsonc
// package.json
{
  "name": "<server-name>",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.ts",
  "scripts": {
    "start": "tsx src/server.ts",
    "build": "tsc",
    "dev": "tsx --watch src/server.ts",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@cascade/shared-types": "file:../shared-types",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.6.0",
    "typescript": "~5.9.3",
    "vitest": "3.2.4"
  },
  "engines": { "node": ">=18.0.0" }
}
```

---

## 11. Critical Files Reference

| File | Relevance |
|------|-----------|
| `CascadeProjects/shared-types/src/security-policy.ts` | Policy engine (12 rules), ReadScopePolicy dead code (F-02) |
| `CascadeProjects/shared-resilience/` | CircuitBreaker + Retry pattern to port to Python (F-03) |
| `CascadeProjects/maintain-server/src/server.ts` | Gold standard: multi-step safety pattern |
| `CascadeProjects/lots-server/src/server.ts:533,1047` | Silent audit catch blocks (F-06) |
| `roots/GRID/mcp-setup/server/code_analysis_mcp_server.py` | No path containment (F-01) |
| `roots/GRID/mcp-setup/server/test_runner_mcp_server.py` | No path containment (F-01) |
| `roots/GRID/mcp-setup/server/enhanced_tools_mcp_server.py` | Debug log (F-04), sanitizer pattern to replicate (F-05) |
| `roots/GRID/debug-14d2f0.log` | Debug artifact confirmed present (F-04) |
| `CascadeProjects/mcp_config.json` | Canonical config (13 servers) |
| `CascadeProjects/mcp_inventory.manifest.json` | Bootstrap registry, exclusion tracking |
| `roots/GRID/mcp-setup/mcp_config.json` | GRID-specific config (HTTP transport) |
| `roots/GRID/mcp-setup/server/rag-server-config.json` | Model override (qwen3-coder:480b-cloud) |

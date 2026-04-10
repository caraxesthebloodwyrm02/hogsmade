# MCP Discrepancy Investigation — 2026-03-21

> **Scope**: All non-`glimpse-server` MCP alignment issues discovered during inventory mapping.
> **Contract**: TUV-001 v1.0.0 (`seed/templates/development-contract.md`)
> **Canonical config**: `CascadeProjects/mcp_config.json` > **GRID-internal config**: `GRID-main/mcp-setup/mcp_config.json` > **Status**: Open — requires developer decisions before resolution

---

## Finding Index

| ID      | Summary                                                                   | Severity | Contract Clause    | Root Location                         |
| ------- | ------------------------------------------------------------------------- | -------- | ------------------ | ------------------------------------- |
| MCP-D01 | `grid-agentic` + `grid-memory`: code exists, absent from canonical config | High     | NR-01, Clause I.3  | `GRID-main/mcp-setup/server/`         |
| MCP-D02 | `code-analysis` + `test-runner`: custom JSON-RPC loop, not MCP SDK        | Medium   | Clause II.1, NR-02 | `GRID-main/mcp-setup/server/`         |
| MCP-D03 | GRID-internal config uses stale Windows paths on Linux workstation        | High     | Clause I.2, NR-01  | `GRID-main/mcp-setup/mcp_config.json` |
| MCP-D04 | GRID-internal config entry points don't match actual file locations       | High     | Clause I.1, NR-02  | `GRID-main/mcp-setup/mcp_config.json` |

---

## MCP-D01 — Discovered servers absent from canonical config

### What

Two MCP-capable Python servers exist in `GRID-main/mcp-setup/server/` but are **not present** in the canonical `CascadeProjects/mcp_config.json`:

- **`agentic_mcp_server.py`** — `Server("grid-agentic")`, 3 tools: `create_agent`, `execute_workflow`, `list_agentic_systems`
- **`memory_mcp_server.py`** — `Server("grid-memory")`, 4 tools: `store_memory`, `retrieve_memory`, `list_memory`, `clear_memory`

Both use MCP SDK `stdio_server()` transport correctly.

### Where the mismatch originates

- **GRID-internal config** (`GRID-main/mcp-setup/mcp_config.json`) lists both with `"enabled": false`.
- **Canonical config** (`CascadeProjects/mcp_config.json`) has no entry for either.
- The workspace memory states: _"Treat `CascadeProjects/mcp_config.json` as the canonical MCP source of truth; live Windsurf MCP files should mirror it."_

This means these servers exist as runnable code but have no declared status in the authoritative config. A future session could discover them, assume they are active, and produce decisions based on incomplete inventory.

### Contract mapping

- **NR-01** (Never silently discard context): Their absence from canonical config is silent context loss — the inventory is incomplete without an explicit exclusion record.
- **Clause I.3** (Scope Fidelity): Any future tooling or agent that reads only the canonical config will have a narrower view of the MCP surface than what actually exists. This is scope drift by omission.

### Evidence

```
# GRID-internal config — disabled, Windows paths, wrong entry points:
GRID-main/mcp-setup/mcp_config.json:33  "name": "grid-agentic", "enabled": false
GRID-main/mcp-setup/mcp_config.json:52  "name": "memory", "enabled": false

# Actual server code — runnable, SDK-compliant:
GRID-main/mcp-setup/server/agentic_mcp_server.py:18   server = Server("grid-agentic")
GRID-main/mcp-setup/server/agentic_mcp_server.py:77   async with stdio_server() as (read_stream, write_stream):
GRID-main/mcp-setup/server/memory_mcp_server.py:19    server = Server("grid-memory")
GRID-main/mcp-setup/server/memory_mcp_server.py:105   async with stdio_server() as (read_stream, write_stream):

# Canonical config — no entries for grid-agentic or grid-memory
CascadeProjects/mcp_config.json: (absent)
```

### Action required — choose one per server

| Option           | Action                                                                       | Effect                                                              |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A — Isolate**  | Add entry to canonical config with `"disabled": true` and reason             | Servers stay inert but are inventoried; prevents silent rediscovery |
| **B — Activate** | Add entry to canonical config with correct Linux paths and `"enabled": true` | Servers become part of the active MCP surface                       |
| **C — Remove**   | Delete the server files; remove from GRID-internal config                    | Eliminates the drift source entirely                                |

**Recommended**: Option A for both. They use SDK transport correctly, so activation is low-risk if needed later. But the canonical config must acknowledge their existence either way.

### Verification command

```bash
# Confirm servers are not referenced in canonical config
grep -c 'grid-agentic\|grid-memory' ~/CascadeProjects/mcp_config.json
# Expected: 0 (confirms gap)
```

---

## MCP-D02 — Transport contract violation: custom JSON-RPC loop

### What

Two configured Python MCP servers implement a **manual stdin/stdout JSON-RPC loop** instead of using the MCP SDK's `stdio_server()` transport:

- **`code_analysis_mcp_server.py`** — `SERVER_NAME = "code-analysis"`, 3 tools: `analyze_code`, `check_security`, `get_complexity`
- **`test_runner_mcp_server.py`** — `SERVER_NAME = "test-runner"`, 4 tools: `run_tests`, `run_coverage`, `discover_tests`, `get_test_summary`

All other Python MCP servers (`grid-rag`, `grid-rag-enhanced`, `grid-enhanced-tools`, `portfolio-safety-lens`, `grid-agentic`, `grid-memory`) use the SDK's `Server()` class and `stdio_server()` context manager.

### Where the mismatch originates

These two servers were written as standalone scripts that manually parse JSON-RPC over stdin. They predate (or bypass) the project's adoption of the `mcp` SDK for Python servers.

The result:

- **Different error handling model** — bare `try/except json.JSONDecodeError: continue` vs SDK's structured error propagation
- **No SDK lifecycle hooks** — no `initialize` negotiation beyond a manual response, no capability advertisement via SDK
- **No structured logging** — no `structlog`, plain `print(json.dumps(response))` to stdout
- **Protocol version hardcoded** — `PROTOCOL_VERSION = "2025-06-18"` as a string constant, not negotiated
- **Synchronous `main()` loop** — `def main():` with blocking `sys.stdin.readline()`, not `async def main()` with SDK event loop
- **`subprocess.run` with `timeout`** — direct subprocess calls with no resilience wrapping

### Contract mapping

- **Clause II.1** (Fail-Closed on Ambiguity): The manual JSON-RPC loop silently continues on `json.JSONDecodeError` instead of failing closed. A malformed request is swallowed, not rejected.
- **NR-02** (Never produce output known to be incorrect without flagging): These servers are listed as configured and enabled in both configs, but their transport implementation diverges from the established contract (SDK `stdio_server`). This divergence is undocumented.
- **Workspace standard** (Python: structlog, type hints, Pydantic v2): Both servers use `print()` instead of `structlog`, lack type hints on most functions, and don't use Pydantic for input validation.

### Evidence

```python
# code_analysis_mcp_server.py — manual loop (NOT SDK):
def main():
    """Main MCP server loop"""
    while True:
        try:
            line = sys.stdin.readline()    # blocking, synchronous
            ...
            request = json.loads(line)
            ...
        except json.JSONDecodeError:
            continue                       # silent swallow — Clause II.1 violation
        except KeyboardInterrupt:
            break

# Compare: grid-rag (SDK transport):
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())
```

### Action required — choose one

| Option                       | Action                                                                                                                  | Effect                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A — Migrate to SDK**       | Rewrite both servers to use `Server()` + `stdio_server()` like all other Python servers                                 | Full alignment; consistent error handling, lifecycle, testability                |
| **B — Isolate and document** | Add `# TRANSPORT: custom-jsonrpc-stdio (non-SDK)` header comment; document in canonical config as intentional exception | Drift is acknowledged; code quality gap persists but is visible                  |
| **C — Deprecate**            | Mark as deprecated in config; route `analyze_code`/`check_security`/`run_tests` through `grid-enhanced-tools` instead   | Reduces surface area; `grid-enhanced-tools` already has overlapping capabilities |

**Recommended**: Option A for both. The migration is mechanical — the tool functions themselves are fine; only the transport loop needs replacement. This eliminates the protocol compliance gap.

### Code quality notes

| Check                | `code-analysis`                         | `test-runner`                           | SDK servers                           |
| -------------------- | --------------------------------------- | --------------------------------------- | ------------------------------------- |
| Transport            | `sys.stdin.readline()` loop             | `sys.stdin.readline()` loop             | `stdio_server()`                      |
| Async                | No (`def main()`)                       | No (`def main()`)                       | Yes (`async def main()`)              |
| Error handling       | `except json.JSONDecodeError: continue` | `except json.JSONDecodeError: continue` | SDK-managed                           |
| Logging              | `print()`                               | `print()`                               | `structlog` / `logging`               |
| Type hints           | Partial                                 | Partial                                 | Full                                  |
| Input validation     | Manual dict access                      | Manual dict access                      | SDK + Pydantic/Zod schemas            |
| Protocol negotiation | Hardcoded `PROTOCOL_VERSION`            | Hardcoded `PROTOCOL_VERSION`            | SDK `create_initialization_options()` |

### Verification command

```bash
# Confirm these two are the only non-SDK servers
grep -rL 'stdio_server\|StdioServerTransport' \
  ~/roots/GRID/mcp-setup/server/*_mcp_server.py \
  ~/CascadeProjects/*-server/src/server.ts
# Expected: only code_analysis_mcp_server.py and test_runner_mcp_server.py
```

---

## MCP-D03 — GRID-internal config uses stale Windows paths

### What

`GRID-main/mcp-setup/mcp_config.json` contains **Windows-era paths** for all 9 server entries:

```
"command": "E:\\Seeds\\GRID-main\\.venv\\Scripts\\python.exe"
"cwd": "E:\\Seeds\\GRID-main"
"PYTHONPATH": "E:\\Seeds\\GRID-main\\src;E:\\Seeds\\GRID-main"
```

The workstation is **Arch Linux**. The correct paths (as used in the canonical config) are:

```
"command": "/home/caraxes/roots/GRID/.venv/bin/python"
"PYTHONPATH": "/home/caraxes/roots/GRID/src:/home/caraxes/roots/GRID"
```

### Where the mismatch originates

The GRID-internal config was created on a Windows development environment and never updated after the workstation migration to Linux. The canonical `CascadeProjects/mcp_config.json` was updated separately with correct Linux paths, but the GRID-internal copy was not synchronized.

### Contract mapping

- **Clause I.2** (Context Awareness): The GRID-internal config presents stale context. Any tooling or agent that reads it (e.g., `ToolRegistry` in `grid/mcp/tool_registry.py`) will get non-functional paths.
- **NR-01** (Never silently discard context): The existence of two divergent configs without a declared relationship is silent context fragmentation. `docs/CONFIG_SNAPSHOT.md` states _"`mcp_config.json` is the canonical source"_ but doesn't mention the GRID-internal copy or its staleness.

### Evidence

```
# GRID-internal config — stale Windows paths:
GRID-main/mcp-setup/mcp_config.json:10  "command": "E:\\Seeds\\GRID-main\\.venv\\Scripts\\python.exe"
GRID-main/mcp-setup/mcp_config.json:14  "cwd": "E:\\Seeds\\GRID-main"

# Canonical config — correct Linux paths:
CascadeProjects/mcp_config.json:80  "command": "/home/caraxes/roots/GRID/.venv/bin/python"
```

### Action required — choose one

| Option                                 | Action                                                                                              | Effect                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A — Update GRID-internal config**    | Rewrite all paths to Linux equivalents; sync `enabled` status with canonical                        | Both configs are functional; dual-config drift risk remains    |
| **B — Deprecate GRID-internal config** | Add `DEPRECATED: use CascadeProjects/mcp_config.json` header; stop reading it in `tool_registry.py` | Single source of truth enforced; GRID-internal becomes archive |
| **C — Generate from canonical**        | Write a script that derives `GRID-main/mcp-setup/mcp_config.json` from the canonical config         | Eliminates manual sync; drift becomes mechanically impossible  |

**Recommended**: Option B with a follow-up check on whether `tool_registry.py` actually reads the GRID-internal config at runtime. If it does, Option C is the correct long-term fix.

### Verification command

```bash
# Check if tool_registry.py references the GRID-internal config
grep -n 'mcp_config\|mcp-setup' ~/roots/GRID/src/grid/mcp/tool_registry.py
```

---

## MCP-D04 — GRID-internal config entry points don't match actual files

### What

The GRID-internal config references entry points that **do not exist** at the declared paths:

| Server         | Config says                                  | Actual file                              |
| -------------- | -------------------------------------------- | ---------------------------------------- |
| `grid-agentic` | `workspace/mcp/servers/agentic/server.py`    | `mcp-setup/server/agentic_mcp_server.py` |
| `memory`       | `workspace/mcp/servers/memory/server.py`     | `mcp-setup/server/memory_mcp_server.py`  |
| `filesystem`   | `workspace/mcp/servers/filesystem/server.py` | (no matching file found)                 |
| `database`     | `workspace/mcp/servers/database/server.py`   | (no matching file found)                 |

### Where the mismatch originates

The GRID-internal config was written against a planned directory structure (`workspace/mcp/servers/`) that was never implemented. The actual servers were placed in `mcp-setup/server/` with a different naming convention (`*_mcp_server.py`). The config was never updated to reflect the actual layout.

For `filesystem` and `database`, neither the config path nor a matching `mcp-setup/server/` file exists — these are **phantom entries** (configured but with no backing code on this workstation).

### Contract mapping

- **Clause I.1** (Provenance Traceability): The config claims entry points that don't exist. Any attempt to start these servers from the GRID-internal config will fail silently or with an opaque `FileNotFoundError`.
- **NR-02** (Never produce output known to be incorrect without flagging): The config presents itself as functional (`"enabled": false` implies "could be enabled") but the referenced files don't exist. This is structurally incorrect without flagging.

### Evidence

```bash
# Paths declared in GRID-internal config:
# GRID-main/mcp-setup/mcp_config.json:38  "workspace/mcp/servers/agentic/server.py"
# GRID-main/mcp-setup/mcp_config.json:57  "workspace/mcp/servers/memory/server.py"
# GRID-main/mcp-setup/mcp_config.json:76  "workspace/mcp/servers/filesystem/server.py"
# GRID-main/mcp-setup/mcp_config.json:95  "workspace/mcp/servers/database/server.py"

# Actual files that exist:
# GRID-main/mcp-setup/server/agentic_mcp_server.py  ← EXISTS (grid-agentic)
# GRID-main/mcp-setup/server/memory_mcp_server.py   ← EXISTS (grid-memory)
# (no filesystem_mcp_server.py)                      ← MISSING
# (no database_mcp_server.py)                        ← MISSING
```

### Action required — choose one

| Option                                        | Action                                                                                                                  | Effect                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **A — Fix paths**                             | Update `grid-agentic` and `memory` entries to point to actual files; remove `filesystem` and `database` phantom entries | Config becomes accurate                     |
| **B — Deprecate entire GRID-internal config** | Same as MCP-D03 Option B — single source of truth                                                                       | Eliminates all path mismatches at once      |
| **C — Remove phantom entries**                | Delete `filesystem` and `database` from GRID-internal config; fix `grid-agentic` and `memory` paths                     | Partial fix; dual-config drift risk remains |

**Recommended**: Combine with MCP-D03 resolution. If Option B (deprecate) is chosen for MCP-D03, this finding is resolved automatically.

### Verification command

```bash
# Confirm phantom entries have no backing code
find ~/roots/GRID -name '*filesystem*mcp*' -o -name '*database*mcp*' 2>/dev/null
# Expected: no results
```

---

## Cross-Cutting Root Cause

All four findings trace to the same structural issue:

> **Two MCP config files exist with no declared relationship, no sync mechanism, and no validation gate.**

- `CascadeProjects/mcp_config.json` — canonical, Linux paths, actively maintained
- `GRID-main/mcp-setup/mcp_config.json` — stale, Windows paths, phantom entries, different schema

The canonical config was updated during the Linux migration. The GRID-internal config was not. No automation or process detected or prevented the divergence.

### Prevention controls

1. **Deprecate or generate** the GRID-internal config (MCP-D03/D04 resolution)
2. **Add discovered-but-unconfigured servers** to canonical config with explicit status (MCP-D01 resolution)
3. **Normalize transport contracts** across all Python servers (MCP-D02 resolution)
4. **Add a CI/pre-commit check** that:
   - Scans `*_mcp_server.py` and `*/src/server.ts` for server declarations
   - Compares against canonical config entries
   - Fails if a server exists in code but not in config (or vice versa)
   - Flags transport contract deviations

---

## Decision Log

| Finding | Decision  | Date | By  |
| ------- | --------- | ---- | --- |
| MCP-D01 | _pending_ |      |     |
| MCP-D02 | _pending_ |      |     |
| MCP-D03 | _pending_ |      |     |
| MCP-D04 | _pending_ |      |     |

---

## Audit Trail Entry Template

When decisions are made, append to `~/.echoes/audit.ndjson`:

```json
{
  "timestamp": "2026-03-21T20:43:00Z",
  "event_type": "mcp_discrepancy_resolution",
  "finding_id": "MCP-D01",
  "decision": "isolate|activate|remove|migrate|deprecate",
  "servers_affected": ["grid-agentic", "grid-memory"],
  "contract_clauses": ["NR-01", "Clause I.3"],
  "status": "resolved"
}
```

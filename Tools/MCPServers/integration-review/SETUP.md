# Setup — How to Run ori-server for Review

> Exact steps. No ambiguity. Works on any machine with Node 22+.

---

## Prerequisites

- Node.js 22+ (check: `node --version`)
- npm (comes with Node)
- No Python required
- No GRID API required (degrades gracefully)

---

## Cold Start

```bash
# 1. Clone the monorepo
git clone <repo-url> CascadeProjects
cd CascadeProjects

# 2. Build the shared dependency
cd Components/shared-types
npm install
npm run build
cd ../..

# 3. Install ori-server
cd Tools/MCPServers/ori-server
npm install

# 4. Configure
cp .env.example .env
# Edit .env — set CASCADE_WORKSPACE_ROOT to your clone path

# 5. Verify
npm test
# Expected: 7 files, 100 tests, 0 failures

# 6. Run
npx tsx src/server.ts
# Server starts on stdio — connect with an MCP client
```

---

## Connecting

### Option A: MCP Inspector (recommended for review)

```bash
npx @modelcontextprotocol/inspector
# Then add ori-server as a stdio transport:
#   Command: npx tsx src/server.ts
#   Working directory: <path to ori-server>
#   Env: CASCADE_WORKSPACE_ROOT=<path to CascadeProjects>
```

### Option B: Any MCP-capable editor

Add to your editor's MCP config:

```json
{
  "ori-server": {
    "command": "npx",
    "args": ["-y", "tsx", "<path>/Tools/MCPServers/ori-server/src/server.ts"],
    "env": {
      "CASCADE_WORKSPACE_ROOT": "<path>/CascadeProjects",
      "ECHOES_AUDIT_PATH": "~/.echoes/audit.ndjson"
    }
  }
}
```

---

## Verify It Works

After connecting, call these tools in order:

1. `health_check` — should return `status: "healthy"` (or `"degraded"` without GRID)
2. `list_projects` — should return 25+ projects from seed data
3. `run_tests` with `{ "projectId": "ori-server" }` — ori-server tests itself
4. `probe_test_suite` — scans the test output for risk patterns

If all four work, you're ready to review. See TRACE.md for expected outputs.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@cascade/shared-types'` | shared-types not built | Run `npm run build` in `Components/shared-types` |
| `health_check` returns `status: "degraded"` | GRID API offline | Normal — read/analysis tools still work |
| `run_tests` returns error with "circuit OPEN" | GRID gate unreachable | Expected without GRID — test with unguarded tools |
| `list_projects` returns empty | First run, no registry yet | Call `discover_tests` first, or the seed data loads automatically |
| Tests fail with `ENOENT` | PATH_TO env var points to nonexistent dir | Check `.env` paths match your clone |

# Phase 2 Step 2: One Real Lots + One Real Maintain Audit Event

**Goal:** Write one real lots-server audit event and one real maintain-server audit event into the shared echoes audit NDJSON file so pulse can consume them and Step 2 exit check is satisfied.

**Audit file (default when `ECHOES_AUDIT_PATH` unset):**
`C:\Users\USER\.echoes\audit.ndjson` (Windows; replace `USER` with your username).
Override with env: `ECHOES_AUDIT_PATH`.

---

## Evidence chain (requirements)

| Producer        | Tool              | When `emitAudit` runs                   | Required env / state                                                             |
| --------------- | ----------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| lots-server     | `experiment_run`  | After every run (success or failure)    | `LOTS_EXPERIMENTS_DIR`; catalog with one experiment with `script` under that dir |
| maintain-server | `cleanup_execute` | After action loop (dry-run or executed) | `CASCADE_WORKSPACE_ROOT`, `SEEDS_ROOT`                                           |

- **lots-server:** `emitAudit` is in `lots-server/src/server.ts` after `saveCatalog`; it runs whether the experiment script exits 0 or not. You need a catalog (e.g. from `experiment_create`) with one experiment that has `script` under `LOTS_EXPERIMENTS_DIR`, then call `experiment_run` with that `experimentId`.
- **maintain-server:** `emitAudit` is in `maintain-server/src/server.ts` after the cleanup loop. One call to `cleanup_execute` with `actions: [{ type: "temp_clean" }]` (dry-run is enough) produces one audit line.

Shared-types `audit-client.ts` resolves the path once at load time: `process.env.ECHOES_AUDIT_PATH` or `resolve(homedir(), ".echoes", "audit.ndjson")`. Both servers use that client, so both append to the same file when env is the same.

---

## Workflow A: Automated script (recommended)

From workspace root, with env set (copy from `.env.example` or set in shell):

```powershell
$env:ECHOES_AUDIT_PATH = "C:\Users\USER\.echoes\audit.ndjson"
$env:LOTS_EXPERIMENTS_DIR = "C:\Users\USER\CascadeProjects\experiments"
$env:CASCADE_WORKSPACE_ROOT = "C:\Users\USER\CascadeProjects"
$env:SEEDS_ROOT = "E:\Seeds"
npx tsx scripts/emit_phase2_audit_events.ts
```

The script creates one experiment, runs it, runs one cleanup dry-run, then prints the audit file path and the last two lines. Requires Node and `tsx` (e.g. `npx tsx` from root or `cd lots-server && npx tsx ../scripts/emit_phase2_audit_events.ts`). Run from repo root so `../lots-server` and `../maintain-server` resolve. If `LOTS_EXPERIMENTS_DIR` is not set, the script uses a temporary directory and removes it after.

---

## Workflow B: Manual (Cursor / MCP)

1. **Audit path:** Ensure `ECHOES_AUDIT_PATH` is set (e.g. in `.env` or MCP server env) to `C:\Users\USER\.echoes\audit.ndjson` (or leave unset to use that default). Restart or ensure both servers see the same value.
2. **Lots:** In a chat or tool panel connected to lots-server: call `experiment_create` with `name`, `description`, `script` (e.g. `console.log(0)`), `language` (e.g. `node`). Then call `experiment_run` with the returned `experiment.id`. One NDJSON line is appended.
3. **Maintain:** In a chat or tool panel connected to maintain-server: call `cleanup_execute` with `actions: [{ type: "temp_clean" }]` and `dryRun: true` (default). One NDJSON line is appended.
4. **Verify:** Open `C:\Users\USER\.echoes\audit.ndjson`; the last two lines should be one object with `"source":"lots-server"` and one with `"source":"maintain-server"`.

---

## Exit check

- One real snapshot exists with the documented contract, **or** skip is documented.
- **One real audit event from lots-server** and **one real audit event from maintain-server** are present in the shared echoes NDJSON file and consumable by pulse (valid JSON lines with `source`, `tool`, `metadata`).

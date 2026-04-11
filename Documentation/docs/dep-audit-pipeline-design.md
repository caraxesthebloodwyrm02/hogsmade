# Dependency Audit Pipeline — Design Document

**Date:** 2026-04-12
**Status:** Scoping complete — ready for implementation
**Author:** Cascade session

---

## Problem Statement

The MCP ecosystem collects repo health scores and git status but **no server parses lockfiles or dependency manifests** into structured, filterable signals. The nuke `dep-check` knob calls `scan_workspaces` + `ecosystem_scan`, which report file presence and sizes — not dependency-level vulnerability analysis.

**Missing link:** lockfile read → vulnerability check → signal emission → color-filtered observation.

---

## Lockfile Inventory

### npm (package-lock.json) — 10 files

| Project                             | Path                                                       | Status                |
| ----------------------------------- | ---------------------------------------------------------- | --------------------- |
| **CascadeProjects** (monorepo root) | `CascadeProjects/package-lock.json`                        | Active — 661 deps     |
| **nuke**                            | `CascadeProjects/Hogwarts/nuke/package-lock.json`          | Active — 226 deps     |
| **board**                           | `CascadeProjects/Hogwarts/board/package-lock.json`         | Active                |
| **afloat**                          | `canopy/afloat/package-lock.json`                          | Active — 541 deps     |
| **ai-web-demo/backend**             | `canopy/ai-web-demo/backend/package-lock.json`             | Stale                 |
| **ai-web-demo/frontend**            | `canopy/ai-web-demo/frontend/package-lock.json`            | Stale                 |
| **assistive-agreement-contracts**   | `canopy/assistive-agreement-contracts/package-lock.json`   | Stale                 |
| **home root**                       | `~/package-lock.json`                                      | Stale — likely orphan |
| **mcp-orchestration-language**      | `roots/mcp-orchestration-language/package-lock.json`       | Active                |
| **preference-selection-qa**         | `seed/templates/preference-selection-qa/package-lock.json` | Archive               |

### Python (uv.lock) — 13 files

| Project                | Path                                         | Status             |
| ---------------------- | -------------------------------------------- | ------------------ |
| **GRID-main**          | `CascadeProjects/Projects/GRID-main/uv.lock` | Active — ~200 deps |
| **DIO**                | `CascadeProjects/Projects/DIO/uv.lock`       | Active             |
| **apiguard**           | `CascadeProjects/Projects/apiguard/uv.lock`  | Active             |
| **Vision**             | `CascadeProjects/Projects/Vision/uv.lock`    | Active             |
| **echoes**             | `canopy/echoes/uv.lock`                      | Active — ~97 deps  |
| **upwork-cli**         | `canopy/upwork-cli/uv.lock`                  | Active             |
| **dep-mapper**         | `roots/dep-mapper/uv.lock`                   | Active             |
| **python-craft**       | `roots/python-craft/uv.lock`                 | Active             |
| **mistral-test**       | `roots/mistral-test/uv.lock`                 | Active             |
| **GRID-historical**    | `grove/archive/GRID-historical/uv.lock`      | Archive            |
| **Python**             | `grove/archive/Python/uv.lock`               | Archive            |
| **light_of_the_seven** | `grove/archive/light_of_the_seven/uv.lock`   | Archive            |
| **Coinbase_from_zip**  | `seed/archive/Coinbase_from_zip/uv.lock`     | Archive            |

### pnpm — 0 files (mcp-tool-experiment not yet lockfiled)

---

## Audit Tool Output Shapes

### npm audit --json

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "<package>": {
      "name": "string",
      "severity": "info | low | moderate | high | critical",
      "isDirect": "boolean",
      "via": [
        {
          "source": "number (advisory ID)",
          "title": "string",
          "url": "string (GHSA link)",
          "severity": "string",
          "cwe": ["string"],
          "cvss": { "score": "number", "vectorString": "string" },
          "range": "string (semver)"
        }
      ],
      "fixAvailable": "boolean | { name, version, isSemVerMajor }"
    }
  },
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 },
    "dependencies": { "prod": 0, "dev": 0, "optional": 0, "total": 0 }
  }
}
```

### pip-audit --format=json

```json
{
  "dependencies": [
    {
      "name": "string",
      "version": "string",
      "vulns": [
        {
          "id": "string (GHSA/CVE)",
          "fix_versions": ["string"],
          "aliases": ["string"],
          "description": "string"
        }
      ]
    }
  ],
  "fixes": []
}
```

Note: packages with `skip_reason` instead of `vulns` are local/private (e.g. `echoes`, `torch+cpu`).

---

## Current Vulnerability Findings

| Project             | Tool      | Vuln Count | Severity     | Package                                              | Fix Available  |
| ------------------- | --------- | ---------- | ------------ | ---------------------------------------------------- | -------------- |
| **CascadeProjects** | npm audit | 1          | **high**     | `basic-ftp` (CRLF injection, CVSS 8.2)               | Yes            |
| **afloat**          | npm audit | 1          | **high**     | `next` (DoS via Server Components, CVSS 7.5)         | Yes → `16.2.3` |
| **nuke**            | npm audit | 0          | —            | —                                                    | —              |
| **echoes**          | pip-audit | 0          | —            | —                                                    | —              |
| **GRID-main**       | pip-audit | 1          | **moderate** | `uv` (RECORD path traversal on uninstall, GHSA-pjjw) | Yes → `0.11.6` |

---

## Proposed Signal Shape

Unified record emitted per vulnerability finding:

```typescript
interface DepAuditSignal {
  project: string; // "afloat", "GRID-main"
  ecosystem: "npm" | "pip"; // lockfile type
  package: string; // "next", "uv"
  installedVersion: string; // "16.2.2"
  severity: "critical" | "high" | "moderate" | "low" | "info";
  advisoryId: string; // "GHSA-q4gf-8mx6-v5v3"
  advisoryTitle: string; // "Next.js has a Denial of Service..."
  cvssScore: number | null; // 7.5
  fixAvailable: boolean;
  fixVersion: string | null; // "16.2.3"
  isDirect: boolean; // true = direct dep, false = transitive
}
```

### Severity → Color Mapping (nuke amber filter)

| Severity       | Amber Filter           | LED State        |
| -------------- | ---------------------- | ---------------- |
| **critical**   | `--led-error` (red)    | Immediate action |
| **high**       | `--knot-amber` (amber) | Review + fix     |
| **moderate**   | `--knot-amber-dim`     | Track            |
| **low / info** | `--nuke-text-dim`      | Log only         |

---

## Implementation Plan

### Phase 1 — maintain-server `dep_audit` tool

Add a new tool to `maintain-server` that:

1. Accepts `roots: string[]` (defaults to config.scanRoots)
2. Detects `package-lock.json` and `uv.lock` files
3. Runs `npm audit --json` / `uv run --with pip-audit pip-audit --format=json`
4. Normalizes output into `DepAuditSignal[]`
5. Returns structured summary + per-vulnerability detail

### Phase 2 — ori-server signal integration

1. Add `dep-audit` risk patterns to ori's pattern registry
2. After `dep_audit` returns, pipe findings into `ori-server/collect_logs` with source `dep-audit`
3. Enable `filter_logs(source: "dep-audit")` and `probe_test_suite(source: "dep-audit")`

### Phase 3 — nuke UI wiring

1. Update `dep-check` knob to call `maintain-server/dep_audit` instead of `scan_workspaces`
2. Add a `DepAuditLens` component (amber-themed) that renders findings with severity color coding
3. Wire into `StatusBar` detail panel for per-vulnerability drill-down

### Phase 4 — automated branching analysis

1. Add `seeds-server` or `overview-server` snapshot integration so dep audit results are tracked longitudinally
2. Enable `ecosystem_trend`-style comparison: "3 new vulns since last scan", "2 fixed"
3. Route to nuke macro rail as an auto-triggerable sweep

---

## Scope Exclusions

- **No CI/CD integration** — this is local-first tooling
- **No external API calls** — `npm audit` and `pip-audit` use public advisory DBs, which is acceptable
- **Archive repos** (grove/, seed/archive/) — excluded from active scanning
- **pnpm** — deferred until mcp-tool-experiment has a lockfile

---

## Heatmap — Design Doc Surface Analysis

Cross-referencing: dep-audit findings × threat model × glimpse confidence × design phases.

### Vulnerability × Project Grid

```
                 CascadeProjects  afloat  nuke  echoes  GRID-main
 ─────────────────────────────────────────────────────────────────
 critical               ·           ·       ·      ·        ·
 high              RED:basic-ftp  RED:next  ·      ·        ·
 moderate               ·           ·       ·      ·    AMB:uv
 low/info               ·           ·       ·      ·        ·
 ─────────────────────────────────────────────────────────────────
 total deps           661         541     226     97     ~200
 lockfile type        npm          npm     npm    pip      pip
```

### Threat Model Coverage Gap (from ori heatmap)

```
         grid-main  grid-server  afloat  echoes  lots  maintain  seeds
 ────────────────────────────────────────────────────────────────────────
 TM-001   DEGRADED    unmapped     ·       ·      ·       ·        ·
 TM-002   DEGRADED    HEALTHY      ·       ·      ·       ·        ·
 TM-003   DEGRADED    unmapped   HEALTHY HEALTHY  ·       ·        ·
 TM-004   DEGRADED    unmapped     ·       ·      ·       ·        ·
 TM-005   DEGRADED    HEALTHY      ·       ·      ·       ·        ·
 TM-006   DEGRADED    unmapped     ·       ·    HEALTHY HEALTHY  HEALTHY

 Legend: DEGRADED = 0.5 (stale run), HEALTHY = 1.0, · = unmapped (null)
```

**Key observation:** `grid-main` is **degraded across all 6 threat vectors** — no healthy test run on record. This is the single largest red zone in the ecosystem, compounded by the `uv` toolchain vulnerability.

### Design Phase Risk Heatmap

```
Phase                     Effort  Risk   Dependency       Red?
────────────────────────────────────────────────────────────────
1. maintain-server tool   HIGH    MED    child_process    RED
   └─ shell-exec npm/uv          ↑ command injection surface
2. ori-server patterns    LOW     LOW    config-only       ·
3. nuke UI lens           MED     LOW    pure React        ·
4. longitudinal tracking  MED     MED    snapshot schema   ·
```

---

## RED Scope — Immediate Action Items

### RED-1: afloat `next` vulnerability (CVSS 7.5)

- **Advisory:** GHSA-q4gf-8mx6-v5v3 — DoS via Server Components
- **Fix:** `next@16.2.3` (non-breaking semver patch)
- **Action:** `npm update next` in `canopy/afloat`
- **Direct dep:** yes — this is a production-facing framework dependency
- **Urgency:** HIGH — afloat is a deployed Next.js app (Vercel)

### RED-2: CascadeProjects `basic-ftp` vulnerability (CVSS 8.2)

- **Advisory:** GHSA-6v7q-wjvx-w8wg — CRLF injection in FTP credentials
- **Fix:** available (transitive, via parent dependency)
- **Action:** `npm audit fix` in `CascadeProjects/`
- **Direct dep:** no — transitive through dev tooling
- **Urgency:** MEDIUM — not used in production paths, but highest CVSS score in ecosystem

### RED-3: GRID-main degraded across all threat vectors

- **Problem:** ori-server shows `grid-main` at score 0.5 on TM-001 through TM-006
- **Root cause:** no recent healthy test run (pytest suite exceeds ori runner timeout)
- **Action:** either increase ori timeout for GRID, or run a subset (`tests/unit`) that completes within window
- **Urgency:** HIGH — this masks whether the `uv` vuln or any code-level issue is caught by tests

### RED-4: Phase 1 command injection surface

- **Problem:** the proposed `dep_audit` tool will shell-exec `npm audit` and `pip-audit` across user-provided roots
- **Mitigation required:** validate roots against `config.scanRoots` allowlist, never interpolate paths into shell strings, use `execFile` (not `exec`), sanitize output before returning
- **Urgency:** MUST resolve during Phase 1 implementation — this is a safety-critical module boundary

---

## Risk Notes

- `npm audit --json` can be slow on large lockfiles (~2-5s for 661 deps)
- `uv run --with pip-audit pip-audit` installs pip-audit ephemerally per invocation (~11ms after first install)
- GRID-main's `uv` vulnerability (GHSA-pjjw) is a toolchain vuln, not application code — but should still be flagged and tracked
- Glimpse confidence on the vulnerability dataset is 0% (no relations, no dimensional coverage) — confirms the data is isolated point findings with no cross-project dependency graph yet; Phase 4 would address this

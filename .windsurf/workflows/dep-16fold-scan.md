---
description: 16-fold dependency vulnerability scan — comprehensive coverage across all ecosystem projects with attention mechanism
---

# DEP-16FOLD-SCAN

Comprehensive dependency vulnerability audit covering all 16+ active projects in the ecosystem. Uses the dep_audit tool with attention mechanism to prioritize direct/deployed vulnerabilities.

**Coverage**: CascadeProjects, afloat, nuke, GRID-main, echoes, DIO, apiguard, Vision, board, upwork-cli, dep-mapper, python-craft, mistral-test, mcp-orchestration-language.

---

## Current Vulnerability State

```
┌─ 661 deps ──── CascadeProjects (npm)
│                 └─ basic-ftp HIGH (CVSS 8.2)
│
├─ 541 deps ──── afloat (npm)
│                 └─ next HIGH (CVSS 7.5) ← DIRECT, DEPLOYED
│
├─ 226 deps ──── nuke (npm)         ← clean
│
├─ ~200 deps ─── GRID-main (pip)
│                 └─ uv MOD (GHSA-pjjw) ← toolchain
│
├─ ~97 deps ──── echoes (pip)       ← clean
│
└─ ??? deps ──── 13+ other active projects (UNAUDITED)
                  - DIO
                  - apiguard
                  - Vision
                  - board
                  - upwork-cli
                  - dep-mapper
                  - python-craft
                  - mistral-test
                  - mcp-orchestration-language
```

---

## Comprehensive ScanRoots Configuration

Set the `MAINTAIN_SCAN_ROOTS` environment variable to include all projects:

```bash
export MAINTAIN_SCAN_ROOTS="/home/caraxes/CascadeProjects,/home/caraxes/canopy/afloat,/home/caraxes/CascadeProjects/Projects/GRID-main,/home/caraxes/canopy/echoes,/home/caraxes/CascadeProjects/Projects/DIO,/home/caraxes/CascadeProjects/Projects/apiguard,/home/caraxes/CascadeProjects/Projects/Vision,/home/caraxes/canopy/upwork-cli,/home/caraxes/roots/dep-mapper,/home/caraxes/roots/python-craft,/home/caraxes/roots/mistral-test,/home/caraxes/roots/mcp-orchestration-language"
```

Or add to `~/.config/maintain-server/env` or `.env`:

```env
MAINTAIN_SCAN_ROOTS=/home/caraxes/CascadeProjects,/home/caraxes/canopy/afloat,/home/caraxes/CascadeProjects/Projects/GRID-main,/home/caraxes/canopy/echoes,/home/caraxes/CascadeProjects/Projects/DIO,/home/caraxes/CascadeProjects/Projects/apiguard,/home/caraxes/CascadeProjects/Projects/Vision,/home/caraxes/canopy/upwork-cli,/home/caraxes/roots/dep-mapper,/home/caraxes/roots/python-craft,/home/caraxes/roots/mistral-test,/home/caraxes/roots/mcp-orchestration-language
```

---

## Attention Mechanism

The dep_audit tool now includes an attention mechanism that prioritizes direct dependencies:

```javascript
{
  "attention": {
    "directVulnerabilities": 1,
    "attentionList": [
      {
        "project": "afloat",
        "vuln": "next",
        "severity": "high"
      }
    ]
  }
}
```

**Priority rules**:

1. Direct + Deployed (e.g., afloat's next) → URGENT
2. Direct but not deployed → HIGH
3. Transitive + High CVSS → MEDIUM
4. Transitive + Low/Mod → LOW

---

## 16-Fold Parallel Audit

The dep_audit tool processes all roots in sequence with deduplication. For true parallel execution at scale:

```bash
# Parallel audit using background jobs
for root in $(echo $MAINTAIN_SCAN_ROOTS | tr ',' '\n'); do
  (cd $root && npm audit --json 2>/dev/null || uv run --with pip-audit pip-audit --format json 2>/dev/null) &
done
wait
```

Or use the maintain-server tool with all roots configured:

```
mcp11_dep_audit()
```

The tool automatically:

- Deduplicates roots
- Validates against allowlist
- Detects lockfile type (npm/pip/none)
- Runs appropriate audit tool
- Applies attention mechanism
- Saves results to history

---

## Transformers Core Comparison

The attention mechanism in dep_audit is inspired by transformer attention but adapted for vulnerability prioritization:

| Concept           | Transformers          | dep_audit Attention                 |
| ----------------- | --------------------- | ----------------------------------- |
| Query             | What to attend to     | Direct vulnerabilities              |
| Key               | What to match against | Severity + CVSS score               |
| Value             | Output weight         | Priority tier (URGENT/HIGH/MED/LOW) |
| Multi-head        | Parallel attention    | Multiple severity tiers             |
| Position encoding | Token position        | Project context (deployed vs not)   |

**Key differences**:

1. No learned weights - rule-based priority system
2. Fixed attention window - only direct dependencies
3. Binary attention - either direct or not, not continuous
4. No self-attention - vulnerabilities don't attend to each other

---

## Quick Reference

### Project Lockfile Types

| Project                    | Type | Lockfile          | Deps (est) |
| -------------------------- | ---- | ----------------- | ---------- |
| CascadeProjects            | npm  | package-lock.json | 661        |
| afloat                     | npm  | package-lock.json | 541        |
| nuke                       | npm  | package-lock.json | 226        |
| GRID-main                  | pip  | uv.lock           | ~200       |
| echoes                     | pip  | uv.lock           | ~97        |
| DIO                        | pip  | uv.lock           | ???        |
| apiguard                   | npm  | package-lock.json | ???        |
| Vision                     | npm  | package-lock.json | ???        |
| board                      | npm  | package-lock.json | ???        |
| upwork-cli                 | npm  | package-lock.json | ???        |
| dep-mapper                 | pip  | uv.lock           | ???        |
| python-craft               | pip  | uv.lock           | ???        |
| mistral-test               | pip  | uv.lock           | ???        |
| mcp-orchestration-language | pip  | uv.lock           | ???        |

### Severity Mapping

| Source    | Severity | dep_audit Severity |
| --------- | -------- | ------------------ |
| npm audit | info     | info               |
| npm audit | low      | low                |
| npm audit | moderate | moderate           |
| npm audit | high     | high               |
| npm audit | critical | critical           |
| pip-audit | low      | low                |
| pip-audit | medium   | moderate           |
| pip-audit | high     | high               |
| pip-audit | critical | critical           |

---

## Usage

Run comprehensive audit:

```bash
# Set scanRoots
export MAINTAIN_SCAN_ROOTS="..."

# Restart maintain-server
cd /home/caraxes/CascadeProjects/Tools/MCPServers/maintain-server
npx -y tsx src/server.ts

# Run audit
mcp11_dep_audit()

# View history with trend
mcp11_dep_audit_history(limit: 30)
```

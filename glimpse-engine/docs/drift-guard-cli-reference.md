# DriftGuard CLI — Complete Reference

## Installation

DriftGuard CLI is included with Glimpse Engine. No separate installation required.

```bash
cd /home/caraxes/CascadeProjects/glimpse-engine
```

---

## Quick Start Commands

### Health Check
```bash
npm run glimpse:health
```
**Output:**
```
🔍 DriftGuard Health Check

State:      ✓ HEALTHY
Duration:   12ms
Policy:     adaptive
```

### CI/CD Validation
```bash
# Standard check (warnings only)
npm run glimpse:ci

# Strict mode (fails on any drift)
npm run glimpse:ci -- --strict

# With auto-heal
npm run glimpse:ci -- --heal
```

### Auto-Healing
```bash
npm run glimpse:heal
```
**Output:**
```
🔧 DriftGuard Auto-Heal

✓ Successfully healed configuration
# or
✗ Could not auto-heal
```

### Trend Analysis
```bash
npm run glimpse:trends
```
**Output:**
```
📊 DriftGuard Trend Analysis

Total Runs:    47
Drift Rate:    4.3%
Avg Duration:  18ms
Trend:         STABLE
```

### Policy Listing
```bash
npm run glimpse:policies
```
**Output:**
```
📋 Available Policies

STRICT
  Coverage Threshold: 50%
  Auto-Heal:          No
  Fail-Closed:        Yes
  Escalation:         HALT

ADAPTIVE
  Coverage Threshold: 30%
  Auto-Heal:          Yes
  Fail-Closed:        No
  Escalation:         WARN

PERMISSIVE
  Coverage Threshold: 20%
  Auto-Heal:          Yes
  Fail-Closed:        No
  Escalation:         LOG
```

---

## Use Case Scenarios

### Scenario 1: Developer Pre-Commit Workflow

```bash
# Developer makes changes to glimpse.master.yaml
$ npm run glimpse:health

🔍 DriftGuard Health Check

State:      ✗ DRIFTED
Duration:   15ms
Policy:     adaptive

Recommendations:
  🟡 run_sync_script
```

```bash
# Developer runs sync
$ npm run glimpse:heal

🔧 DriftGuard Auto-Heal

✓ Successfully healed configuration
```

```bash
# Verify
$ npm run glimpse:health

State:      ✓ HEALTHY
```

---

### Scenario 2: CI/CD Pipeline

**GitHub Actions workflow:**
```yaml
name: Validate
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check Drift
        run: npm run glimpse:ci -- --strict
```

**Output on success:**
```
🔒 DriftGuard CI Check (strict)

✓ CI check passed
```

**Output on failure:**
```
🔒 DriftGuard CI Check (strict)

✗ CI check failed
State: DRIFT_DETECTED
```

---

### Scenario 3: Monitoring Dashboard

```bash
# Get trends for monitoring
$ npm run glimpse:trends

📊 DriftGuard Trend Analysis

Total Runs:    152
Drift Rate:    8.6%
Avg Duration:  22ms
Trend:         DEGRADING

⚠ System health is degrading
```

---

### Scenario 4: Multi-Environment Policy

**Production (strict):**
```bash
# .github/workflows/production.yml
- name: Production Validation
  run: |
    npm run glimpse:ci -- --strict
```

**Development (adaptive):**
```bash
# Developer workflow
$ npm run glimpse:ci  # Permissive by default
# Auto-heals if drift detected
```

**Research (permissive):**
```bash
# Experiments
$ npm run glimpse:ci -- --policy=permissive
# Logs only, no blocking
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / Healthy |
| 1 | Drift detected / Unhealthy |
| 99 | Unknown error |

---

## Integration Patterns

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

npm run glimpse:health || {
  echo "Configuration drift detected. Run 'npm run glimpse:heal' to fix."
  exit 1
}
```

### Makefile Integration

```makefile
check:
  @npm run glimpse:ci

heal:
  @npm run glimpse:heal

ci:
  @npm run glimpse:ci -- --strict
```

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD npm run glimpse:health || exit 1
```

---

## Advanced Usage

### Custom Policy (via API)

```javascript
import { DriftGuard, DRIFT_POLICIES } from './core/drift-guard/index.js';

const customPolicy = {
  ...DRIFT_POLICIES.STRICT,
  thresholds: { COVERAGE: 0.75, LINE_DIFF: 5 }
};

const guard = new DriftGuard({ policy: customPolicy });
await guard.ci(true);
```

### Programmatic Usage

```javascript
import { createDriftGuard } from './core/engine.js';

const guard = createDriftGuard();

// Health check
const result = await guard.guard();
console.log(result.healthy ? 'OK' : 'DRIFT');

// With auto-heal
const result = await guard.guard({ execute: true });
console.log(result.report.healed ? 'Healed' : 'Manual intervention needed');
```

---

## Troubleshooting

### Command not found
```bash
# Ensure you're in the correct directory
cd /home/caraxes/CascadeProjects/glimpse-engine
npm run glimpse:health
```

### Permission denied
```bash
chmod +x cli-drift-guard-real.mjs
```

### No drift detected but files differ
```bash
# Check both paths exist
ls -la glimpse.master.yaml
ls -la default-master.js
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DRIFTGUARD_POLICY` | Default policy | `adaptive` |
| `DRIFTGUARD_AUTOHEAL` | Enable auto-heal | `false` |
| `DRIFTGUARD_STRICT` | Strict mode | `false` |

---

## See Also

- [Usage Patterns](./drift-guard-usage-patterns.md)
- [Architecture Review](./drift-guard-architecture-review.md)
- Full API documentation in `core/drift-guard/index.js`

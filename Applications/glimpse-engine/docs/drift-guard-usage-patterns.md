# DriftGuard — Usage Patterns & Design Reference

## Overview

DriftGuard is a **mature, production-hardened anti-drift subsystem** that provides continuous integrity validation for the Glimpse Cognitive Engine. It implements formula-driven detection, policy-based decision matrices, and automated resolution strategies.

---

## Core Architecture

```
DriftGuard (Orchestrator)
├── DriftDetector      → Extraction & comparison engine
├── DriftResolver      → Decision matrix & execution
├── DriftTelemetry     → Logging, metrics, trends
└── DriftFormulas      → Mathematical validation layer
```

---

## Quick Start Patterns

### Pattern 1: Basic Health Check

```javascript
import { createDriftGuard } from "./core/engine.js";

// Create guard with default adaptive policy
const guard = createDriftGuard();

// Quick health check
const isHealthy = guard.health();
console.log(`System health: ${isHealthy ? "✅" : "❌"}`);

// Or async with full report
const result = await guard.guard();
console.log(`State: ${result.report.state}`);
console.log(`Trends: ${result.trends.trend}`);
```

### Pattern 2: CI/CD Integration

```javascript
import { DriftGuard, DRIFT_POLICIES } from "./core/engine.js";

// Strict mode for releases
async function releaseCheck() {
  const guard = new DriftGuard({
    policy: DRIFT_POLICIES.STRICT,
  });

  try {
    await guard.ci(true); // strict mode
    console.log("✅ Release checks passed");
    return true;
  } catch (err) {
    console.error("❌ Release blocked:", err.result.report);
    process.exit(1);
  }
}

releaseCheck();
```

### Pattern 3: Policy-Driven Auto-Healing

```javascript
import { createDriftGuard, DRIFT_POLICIES } from "./core/engine.js";

// Adaptive policy with auto-healing
const guard = createDriftGuard({
  policy: DRIFT_POLICIES.ADAPTIVE,
  yamlPath: "./config/master.yaml",
  jsPath: "./config/backup.js",
});

// Execute with auto-heal enabled
const result = await guard.guard({ execute: true });

if (result.report.healed) {
  console.log("✅ Auto-healed drift");
} else if (result.report.drift?.detected) {
  console.log("⚠️ Drift requires manual intervention");
}
```

---

## Advanced Patterns

### Pattern 4: Pipeline Integration (Express Middleware)

```javascript
import { withDriftProtection } from "./core/engine.js";

const protectedPipeline = withDriftProtection(runContextPipeline);

// Now runs drift check before each execution
app.post("/analyze", async (req, res) => {
  try {
    const result = await protectedPipeline(req.body.data, "json", config, {
      driftPolicy: "adaptive",
      autoHealDrift: true,
    });
    res.json(result);
  } catch (err) {
    if (err.type === "DRIFT_GUARD_VIOLATION") {
      res.status(503).json({ error: "Service integrity compromised" });
    }
  }
});
```

### Pattern 5: Calibration-Aware Confidence Scoring

```javascript
import { createGuardedFrame } from "./core/engine.js";

// Create frame with calibration policy
const frame = createGuardedFrame("adaptive");

// Detect gaps with policy-adjusted thresholds
frame.detectGaps({
  entities: parsedEntities,
  evidences: collectedEvidences,
});

if (frame.gaps.length > 0) {
  console.log(`Detected ${frame.gaps.length} policy violations`);
  // Adjust pipeline behavior based on gaps
}
```

### Pattern 6: Custom Policy Definition

```javascript
import { DriftGuard } from "./core/engine.js";

const CUSTOM_POLICY = {
  id: "research",
  thresholds: { LINE_DIFF: 200, HASH_DIFF: 1, COVERAGE: 0.15 },
  autoHeal: true,
  failClosed: false,
  escalation: "LOG",
};

const guard = new DriftGuard({
  policy: CUSTOM_POLICY,
});
```

---

## Decision Matrix Reference

### Severity Calculation

```javascript
compoundSeverity = min(1,
  (driftDetected ? 0.4 : 0) +
  (gapCount > 5 ? 0.3 : gapCount × 0.06) +
  (contractViolations > 0 ? 0.3 : 0) +
  (trend > 0 ? 0.1 : 0)
)
```

| Severity Score | Action  | Auto-Heal       | Notification |
| -------------- | ------- | --------------- | ------------ |
| ≥ 0.7          | HALT    | No              | ADMIN_ALERT  |
| ≥ 0.4          | WARN    | Yes (if policy) | LOG_EVENT    |
| > 0            | MONITOR | No              | METRICS_ONLY |
| 0              | HEALTHY | No              | SILENT       |

### Policy Matrix

| Policy         | Coverage Threshold | Line Diff | Auto-Heal | Fail Closed |
| -------------- | ------------------ | --------- | --------- | ----------- |
| **strict**     | 0.50               | 50        | ❌        | ✅          |
| **adaptive**   | 0.30               | 10        | ✅        | ❌          |
| **permissive** | 0.20               | 100       | ✅        | ❌          |
| **research**   | 0.15               | 200       | ✅        | ❌          |

---

## Telemetry & Monitoring

### Accessing Trend Analysis

```javascript
const guard = createDriftGuard();
const trends = guard.telemetry.analyzeTrends();

console.log(`Drift rate: ${(trends.driftRate * 100).toFixed(1)}%`);
console.log(`Trend direction: ${trends.trend}`); // STABLE | DEGRADING | FLUCTUATING
```

### Event Log Structure

```javascript
// Each guard execution logs:
{
  timestamp: "2026-03-31T12:00:00Z",
  runId: "l8x9p2",
  state: "HEALTHY",  // or "DRIFT_DETECTED", "ERROR"
  driftDetected: false,
  severity: "none",
  duration: 42,
  action: "HEALTHY",
  resolution: null
}
```

---

## Error Handling

### DriftGuard Error Types

```javascript
try {
  await guard.ci(true);
} catch (err) {
  if (err.message.includes("DRIFTGUARD_HALT")) {
    // Critical - operation blocked
    console.error("Report:", err.result.report);
    console.error("Decision:", err.result.decision);
  }
}
```

### Graceful Degradation

```javascript
const guard = createDriftGuard({
  policy: { ...DRIFT_POLICIES.ADAPTIVE, failClosed: false },
});

const result = await guard.guard();

if (!result.healthy) {
  // Continue with degraded functionality
  console.warn("Operating in degraded mode");
}
```

---

## Integration Checklist

- [ ] Import DriftGuard from `'./core/engine.js'`
- [ ] Choose appropriate policy (strict/adaptive/permissive)
- [ ] Configure paths if non-standard
- [ ] Decide auto-heal strategy
- [ ] Set up CI check for releases
- [ ] Monitor trends via telemetry
- [ ] Document custom policy if defined

---

## Performance Characteristics

| Operation       | Typical Duration | Notes                         |
| --------------- | ---------------- | ----------------------------- |
| health()        | < 5ms            | Synchronous, read-only        |
| guard()         | 10-50ms          | Includes detection + decision |
| ci(strict)      | 50-100ms         | Includes verification loop    |
| trends analysis | 1-5ms            | In-memory calculations        |

---

## Migration from Legacy Validators

```javascript
// Old approach (separate validators)
import { validateSyncHealth } from "./validators/sync-validator.js";
const health = validateSyncHealth();

// New approach (unified DriftGuard)
import { createDriftGuard } from "./core/engine.js";
const guard = createDriftGuard();
const result = await guard.guard();

// Access legacy data through report
console.log(result.report.yaml.hash); // Was drift.yamlHash
console.log(result.report.drift.detected); // Was drift.driftDetected
```

---

## Best Practices

1. **Use appropriate policy**: Strict for production, adaptive for development
2. **Enable telemetry**: Essential for trend analysis
3. **Handle CI failures**: Always check `result.healthy` in strict mode
4. **Monitor trends**: Watch for DEGRADING patterns
5. **Custom policies**: Document thresholds and justification
6. **Auto-heal wisely**: Only enable when manual review isn't critical

---

## Architecture Compliance

DriftGuard is architecturally aligned with:

- **Fail-closed**: Defaults to safe when detection fails
- **Observable**: Full telemetry and trend analysis
- **Policy-driven**: Behavior configurable without code changes
- **Self-healing**: Auto-resolution when appropriate
- **Non-blocking**: Can operate asynchronously to pipeline

---

**Version**: 2.1.0  
**Last Updated**: 2026-03-31  
**Status**: Production Ready

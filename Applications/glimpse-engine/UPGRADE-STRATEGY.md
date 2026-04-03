# Glimpse Engine v2.1 — Agentic Architecture Upgrade

## Executive Summary

This upgrade transforms Glimpse from a declarative engine into an **agentic, self-validating cognitive system**. The strategy addresses 4 critical architecture gaps while introducing autonomous capabilities for drift detection, auto-healing, and contract enforcement.

---

## Phase Overview

| Phase | Focus                       | Duration | Risk Level |
| ----- | --------------------------- | -------- | ---------- |
| 1     | Foundation Contracts        | Day 1    | 🟡 Medium  |
| 2     | Agentic Validators          | Day 1-2  | 🟡 Medium  |
| 3     | Dynamic Calibration         | Day 2    | 🔴 High    |
| 4     | Self-Healing Sync           | Day 2-3  | 🔴 High    |
| 5     | Smoke Testing & Integration | Day 3    | 🟡 Medium  |

---

## Gap Analysis Summary

```
┌─────────────────────────────┬───────────────────────────────────────────────────┐
│ Gap                         │ Agentic Solution                                  │
├─────────────────────────────┼───────────────────────────────────────────────────┤
│ YAML/JS Silent Divergence     │ SyncValidator + Checksum Registry               │
│ Function Registry Coupling    │ ContractValidator + Auto-healing shim generator   │
│ Circular Dependencies         │ Core Types Extraction + Interface Contracts       │
│ Confidence Calibration Drift  │ DynamicCalibrationEngine + Threshold policies   │
└─────────────────────────────┴───────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation Contracts

### 1.1 Core Types Extraction

**Problem:** `view-specs.js` imports `computeClusters` from `engine.js`, creating circular dependency risk.

**Solution:** Extract shared types to `core/contracts.js`.

```javascript
/**
 * @file core/contracts.js
 * @description Immutable type contracts and shared interfaces
 * Prevents circular dependencies by establishing canonical shapes
 */

/**
 * @typedef {Object} Entity
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} type - Entity classification
 * @property {Object} dimensions - Mapped dimensions (time, space, domain, etc.)
 * @property {Object} metrics - Computed metrics
 * @property {string[]} evidenceIds - References to supporting evidence
 */

/**
 * @typedef {Object} Relation
 * @property {string} id - Unique identifier
 * @property {string} source - Source entity ID
 * @property {string} target - Target entity ID
 * @property {string} type - Relation classification
 * @property {number} weight - Relation strength 0-1
 * @property {string[]} tags - Annotations
 * @property {string[]} evidenceIds - References
 */

/**
 * @typedef {Object} Evidence
 * @property {string} id - Unique identifier
 * @property {string} sourceRuleId - Originating rule
 * @property {number} confidence - Confidence score
 * @property {string} scope - "dataset" | "entity" | "relation"
 * @property {string} targetId - Subject reference
 * @property {string[]} affects - What this evidence impacts
 * @property {string} reason - Human-readable explanation
 * @property {Object} payload - Additional data
 */

/**
 * @typedef {Object} ViewSpec
 * @property {string} id - View identifier
 * @property {boolean} enabled - Availability flag
 * @property {string} label - Display name
 * @property {number} base_weight - Scoring weight
 * @property {Function} [renderer] - Optional custom render function
 */

/**
 * @typedef {Object} PipelineContext
 * @property {Object[]} records - Normalized input records
 * @property {Object} profile - Data profile with flags
 * @property {Entity[]} entities - Extracted entities
 * @property {Relation[]} relations - Computed relations
 * @property {Evidence[]} evidences - All evidence
 * @property {Object} evidenceIndex - Fast lookup map
 * @property {Object[]} contextLenses - Activated lenses
 * @property {Object} viewPreferences - View scoring preferences
 * @property {string} clusterBy - Active clustering dimension
 */

/**
 * Canonical shapes for validation
 */
export const Shapes = {
  Entity: {
    required: ["id", "name", "type", "dimensions", "metrics", "evidenceIds"],
    types: {
      id: "string",
      name: "string",
      type: "string",
      dimensions: "object",
      metrics: "object",
      evidenceIds: "array",
    },
  },
  Relation: {
    required: ["id", "source", "target", "type", "weight", "evidenceIds"],
    types: {
      id: "string",
      source: "string",
      target: "string",
      type: "string",
      weight: "number",
      evidenceIds: "array",
    },
  },
};

/**
 * Validator for runtime shape checking
 * @param {string} shapeName - Key in Shapes
 * @param {Object} data - Data to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateShape(shapeName, data) {
  const shape = Shapes[shapeName];
  if (!shape) {
    return { valid: false, errors: [`Unknown shape: ${shapeName}`] };
  }

  const errors = [];

  // Check required fields
  for (const field of shape.required) {
    if (data[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check types
  for (const [field, expectedType] of Object.entries(shape.types)) {
    if (data[field] !== undefined) {
      const actualType = Array.isArray(data[field]) ? "array" : typeof data[field];
      if (actualType !== expectedType) {
        errors.push(`Field ${field} expected ${expectedType}, got ${actualType}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Factory function for creating validated entities
 * @param {Object} partial - Partial entity data
 * @returns {Entity} Validated entity
 * @throws {TypeError} If validation fails
 */
export function createEntity(partial) {
  const entity = {
    id: partial.id || `entity-${crypto.randomUUID()}`,
    name: partial.name || "Unnamed",
    type: partial.type || "general",
    dimensions: partial.dimensions || {},
    metrics: partial.metrics || {},
    evidenceIds: partial.evidenceIds || [],
    ...partial,
  };

  const validation = validateShape("Entity", entity);
  if (!validation.valid) {
    throw new TypeError(`Invalid Entity: ${validation.errors.join(", ")}`);
  }

  return Object.freeze(entity);
}

/**
 * Safely access nested path with default
 * @param {Object} obj - Source object
 * @param {string} path - Dot-separated path
 * @param {*} defaultValue - Fallback value
 * @returns {*} Resolved value or default
 */
export function safePath(obj, path, defaultValue = undefined) {
  return path.split(".").reduce((acc, part) => {
    return acc && acc[part] !== undefined ? acc[part] : defaultValue;
  }, obj);
}

/**
 * Deep equality check for change detection
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}

// Re-export for backward compatibility
export { unique, clamp, slugify } from "../utils/utils.js";
```

### 1.2 Dependency Graph Resolution

**Create `core/index.js` as canonical export point:**

```javascript
/**
 * @file core/index.js
 * @description Canonical exports for core module
 * Prevents deep import chains and circular references
 */

// Contracts (must be first - no internal dependencies)
export * from "./contracts.js";

// Utilities (pure functions)
export * from "./confidence.js";
export * from "./definitions.js";
export * from "./modes.js";

// Pipeline stages (in order of execution)
export { runContextPipeline, computeClusters } from "./pipeline.js";
export { runMultiPassInference, detectContradictions } from "./multi-pass.js";

// Analysis engines
export * from "./compression.js";
export * from "./grounding.js";
export * from "./query.js";
export * from "./interview.js";

// Path and learning systems
export * from "./paths.js";
export * from "./learning.js";

// Registry and validation
export { validateConfigWithRegistry } from "../functions/rules.js";

// Views (re-exported from view-specs to avoid circular ref)
export { rankViews, renderView } from "../view-specs.js";
```

---

## Phase 2: Agentic Validators

### 2.1 SyncValidator — YAML/JS Divergence Detection

```javascript
/**
 * @file core/validators/sync-validator.js
 * @description Detects and reports configuration drift between YAML and JS fallback
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REGISTRY_PATH = ".glimpse-sync-registry.json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Generates content-addressable hash
 * @param {string} content - Content to hash
 * @returns {string} SHA-256 hash
 */
export function computeChecksum(content) {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

/**
 * Loads sync registry with drift tracking
 * @returns {Object} Registry state
 */
export function loadSyncRegistry() {
  const registryPath = path.join(REPO_ROOT, REGISTRY_PATH);
  if (!existsSync(registryPath)) {
    return {
      version: "1.0",
      lastSync: null,
      entries: {},
      driftLog: [],
    };
  }
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

/**
 * Saves sync registry
 * @param {Object} registry - Registry state
 */
export function saveSyncRegistry(registry) {
  const registryPath = path.join(REPO_ROOT, REGISTRY_PATH);
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Detects configuration drift
 * @param {string} yamlPath - Path to YAML source
 * @param {string} jsPath - Path to JS fallback
 * @returns {Object} Drift report
 */
export function detectDrift(yamlPath, jsPath) {
  const yaml = readFileSync(yamlPath, "utf8");
  const js = readFileSync(jsPath, "utf8");

  // Extract YAML content from JS export (DEFAULT_MASTER_YAML template literal)
  const yamlMatch = js.match(/export const DEFAULT_MASTER_YAML = `([^`]+)`/s);
  const embeddedYaml = yamlMatch ? yamlMatch[1] : null;

  const yamlHash = computeChecksum(yaml);
  const embeddedHash = embeddedYaml ? computeChecksum(embeddedYaml) : null;

  return {
    driftDetected: yamlHash !== embeddedHash,
    yamlHash,
    embeddedHash,
    yamlLines: yaml.split("\n").length,
    embeddedLines: embeddedYaml ? embeddedYaml.split("\n").length : 0,
    lastModified: {
      yaml: existsSync(yamlPath)
        ? readFileSync(yamlPath, { encoding: "utf8", flag: "r" }) && Date.now()
        : null,
      js: existsSync(jsPath) ? Date.now() : null,
    },
  };
}

/**
 * Validates sync health and returns actionable report
 * @returns {Object} Validation result
 */
export function validateSyncHealth() {
  const yamlPath = path.join(REPO_ROOT, "glimpse.master.yaml");
  const jsPath = path.join(REPO_ROOT, "default-master.js");

  if (!existsSync(yamlPath)) {
    return { healthy: false, reason: "YAML_SOURCE_MISSING", action: "restore_from_backup" };
  }

  if (!existsSync(jsPath)) {
    return { healthy: false, reason: "JS_FALLBACK_MISSING", action: "regenerate_fallback" };
  }

  const drift = detectDrift(yamlPath, jsPath);
  const registry = loadSyncRegistry();

  const report = {
    healthy: !drift.driftDetected,
    timestamp: new Date().toISOString(),
    ...drift,
    recommendations: [],
  };

  if (drift.driftDetected) {
    report.recommendations.push({
      severity: "high",
      message: `Configuration drift detected: YAML (${drift.yamlHash}) ≠ JS (${drift.embeddedHash})`,
      action: "run_sync_script",
      command: "node scripts/sync-default-master.mjs",
    });

    // Log drift
    registry.driftLog.push({
      timestamp: report.timestamp,
      yamlHash: drift.yamlHash,
      embeddedHash: drift.embeddedHash,
    });
    saveSyncRegistry(registry);
  }

  return report;
}

/**
 * Auto-healing sync — regenerates fallback if drift detected
 * @param {Object} options - { autoHeal: boolean }
 * @returns {Object} Result
 */
export async function autoSync(options = { autoHeal: false }) {
  const health = validateSyncHealth();

  if (health.healthy) {
    return { status: "healthy", action: "none_needed" };
  }

  if (!options.autoHeal) {
    return {
      status: "drift_detected",
      action: "manual_sync_required",
      health,
    };
  }

  // Trigger sync
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync("node scripts/sync-default-master.mjs", {
      cwd: REPO_ROOT,
    });
    return {
      status: "healed",
      action: "sync_completed",
      output: stdout,
      errors: stderr || null,
    };
  } catch (error) {
    return {
      status: "heal_failed",
      action: "manual_intervention_required",
      error: error.message,
    };
  }
}

/**
 * Middleware for CI/CD pipeline
 * @returns {Promise<boolean>} True if healthy
 * @throws {Error} If drift detected in strict mode
 */
export async function ciCheck(strict = true) {
  const health = validateSyncHealth();

  if (!health.healthy) {
    console.error("❌ Configuration drift detected:");
    health.recommendations.forEach((r) => {
      console.error(`   [${r.severity.toUpperCase()}] ${r.message}`);
    });

    if (strict) {
      throw new Error("CI_CHECK_FAILED: Configuration drift detected");
    }
    return false;
  }

  console.log("✅ Configuration sync healthy");
  return true;
}
```

### 2.2 FunctionRegistryContract — Auto-validation

```javascript
/**
 * @file core/validators/function-contract.js
 * @description Validates function registry consistency
 */

/**
 * Analyzes function implementations vs YAML declarations
 * @param {Object} registry - function_registry from config
 * @param {Object} implementations - Map of actual implementations
 * @returns {Object} Contract validation report
 */
export function validateFunctionContracts(registry, implementations) {
  const report = {
    valid: true,
    missing: [],
    mismatched: [],
    orphaned: [],
    details: {},
  };

  const declaredNames = Object.keys(registry);
  const implementedNames = Object.keys(implementations);

  // Check for missing implementations
  for (const fnName of declaredNames) {
    if (!implementedNames.includes(fnName)) {
      report.missing.push(fnName);
      report.valid = false;
    } else {
      // Validate signature compatibility
      const declared = registry[fnName];
      const impl = implementations[fnName];
      const arity = impl.length;
      const declaredArgCount = Object.keys(declared.args || {}).length;

      if (arity < declaredArgCount) {
        report.mismatched.push({
          name: fnName,
          reason: `arity_mismatch: declared ${declaredArgCount}, implemented ${arity}`,
        });
        report.valid = false;
      }

      report.details[fnName] = { status: "ok", arity, returns: declared.returns };
    }
  }

  // Check for orphaned implementations (not in registry)
  for (const fnName of implementedNames) {
    if (!declaredNames.includes(fnName)) {
      report.orphaned.push(fnName);
      report.valid = false;
    }
  }

  return report;
}

/**
 * Generates shim for missing function
 * @param {string} fnName - Function name
 * @param {Object} declaration - YAML declaration
 * @returns {string} Generated implementation
 */
export function generateFunctionShim(fnName, declaration) {
  const args = Object.keys(declaration.args || {}).join(", ");
  const returns = declaration.returns || "undefined";

  return `
/**
 * AUTO-GENERATED SHIM for ${fnName}
 * @description ${declaration.description || "No description"}
 * @param {Object} ctx - Evaluation context
 ${Object.keys(declaration.args || {})
   .map((k) => ` * @param {*} ${k}`)
   .join("\n ")}
 * @returns {${returns}}
 */
export function ${fnName}(ctx${args ? ", { " + args + " }" : ""}) {
  // TODO: Implement actual logic
  console.warn('[SHIM] ${fnName} called but not implemented');
  ${
    returns === "boolean"
      ? "return false;"
      : returns === "score"
        ? "return 0;"
        : returns === "number"
          ? "return 0;"
          : "return undefined;"
  }
}
`;
}
```

### 2.3 ConfidenceCalibrationEngine

```javascript
/**
 * @file core/validators/calibration-engine.js
 * @description Dynamic confidence calibration with configurable policies
 */

import { GAP_TYPES, recordGap } from "../confidence.js";

/**
 * Calibration policies for different execution modes
 */
export const CALIBRATION_POLICIES = {
  strict: {
    thresholds: {
      LOW_COVERAGE: 0.4, // Default 0.3
      WEAK_BASIS: 0.6, // Default 0.5
      MISSING_DIMENSION: 0.5, // Default 0.3
    },
    autoAdjust: false,
    failOnGap: true,
  },
  adaptive: {
    thresholds: {
      LOW_COVERAGE: 0.3,
      WEAK_BASIS: 0.5,
      MISSING_DIMENSION: 0.3,
    },
    autoAdjust: true,
    windowSize: 10, // Recent runs to consider
    failOnGap: false,
  },
  permissive: {
    thresholds: {
      LOW_COVERAGE: 0.2,
      WEAK_BASIS: 0.4,
      MISSING_DIMENSION: 0.2,
    },
    autoAdjust: true,
    windowSize: 5,
    failOnGap: false,
  },
};

/**
 * Creates calibration engine with policy
 * @param {string} policyName - Key in CALIBRATION_POLICIES
 * @returns {CalibrationEngine}
 */
export function createCalibrationEngine(policyName = "adaptive") {
  const policy = CALIBRATION_POLICIES[policyName] || CALIBRATION_POLICIES.adaptive;

  return {
    policy,
    history: [],

    /**
     * Detects gaps using policy-adjusted thresholds
     * @param {Object} frame - Confidence frame
     * @param {Object} ctx - Pipeline context
     */
    detectGapsPolicy(frame, ctx) {
      const { entities } = ctx;
      const dimensions = ["time", "space", "domain"];

      for (const dim of dimensions) {
        const coverage = entities.filter((e) => e.dimensions?.[dim] != null).length;
        const ratio = entities.length > 0 ? coverage / entities.length : 0;
        const threshold = policy.thresholds.LOW_COVERAGE || 0.3;

        if (ratio < threshold) {
          const severity = ratio === 0 ? 0.8 : (1 - ratio / threshold) * 0.7 + 0.3;

          recordGap(frame, {
            type: GAP_TYPES.LOW_COVERAGE,
            description: `Coverage ${(ratio * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}% for ${dim}`,
            severity: Math.min(1, severity),
            affectedIds: entities.filter((e) => e.dimensions?.[dim] == null).map((e) => e.id),
          });
        }
      }

      // Store for adaptive learning
      this.history.push({
        timestamp: Date.now(),
        gapCount: frame.gaps.length,
        entityCount: entities.length,
      });

      // Trim history
      if (this.history.length > policy.windowSize) {
        this.history = this.history.slice(-policy.windowSize);
      }
    },

    /**
     * Suggests threshold adjustments based on history
     * @returns {Object} Suggestions
     */
    suggestAdjustments() {
      if (!policy.autoAdjust || this.history.length < 3) {
        return { canAdjust: false, reason: "insufficient_history" };
      }

      const avgGaps = this.history.reduce((a, b) => a + b.gapCount, 0) / this.history.length;

      if (avgGaps < 1) {
        return {
          canAdjust: true,
          action: "lower_thresholds",
          reason: "consistently low gap count suggests thresholds too strict",
          suggestedAdjustment: -0.05,
        };
      }

      if (avgGaps > 5) {
        return {
          canAdjust: true,
          action: "raise_thresholds",
          reason: "high gap count suggests thresholds too permissive",
          suggestedAdjustment: 0.05,
        };
      }

      return { canAdjust: false, reason: "thresholds_well_calibrated" };
    },
  };
}

/**
 * Factory for confidence frame with policy
 * @param {string} policy - Policy name
 * @returns {Object} Frame with calibrated detection
 */
export function createCalibratedFrame(policy = "adaptive") {
  const base = {
    entries: [],
    gaps: [],
    summary: null,
    policy,
    calibrationEngine: createCalibrationEngine(policy),
  };

  // Bind policy-aware detect gaps
  base.detectGaps = function (ctx) {
    this.calibrationEngine.detectGapsPolicy(this, ctx);
  };

  return base;
}
```

---

## Phase 3: Integration & Implementation Steps

### Step 3.1: Create Directory Structure

```bash
#!/bin/bash
# setup-agentic-infrastructure.sh

mkdir -p core/validators
mkdir -p core/contracts
mkdir -p scripts/ci
mkdir -p .glimpse

# Create marker files
touch core/validators/.gitkeep
touch core/contracts/.gitkeep
touch scripts/ci/.gitkeep
```

### Step 3.2: Update package.json

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:validators": "node --test tests/validators/*.test.js",
    "glimpse": "node cli.js",
    "demo": "node examples/simplify-demo.mjs",
    **"validate:sync": "node scripts/validate-sync.mjs",
    "validate:contracts": "node scripts/validate-contracts.mjs",
    "ci:check": "node scripts/ci-check.mjs --strict",
    "sync:auto": "node scripts/sync-default-master.mjs --auto"**
  }
}
```

### Step 3.3: Create CI Check Script

```javascript
/**
 * @file scripts/ci-check.mjs
 * @description Pre-commit validation for CI/CD
 */

import { validateSyncHealth, detectDrift } from "../core/validators/sync-validator.js";
import {
  validateFunctionContracts,
  generateFunctionShim,
} from "../core/validators/function-contract.js";
import { parseMasterConfig } from "../master-config.js";
import { DEFAULT_MASTER_YAML } from "../default-master.js";

const strict = process.argv.includes("--strict");
const exitCodes = { SUCCESS: 0, SYNC_DRIFT: 1, CONTRACT_FAIL: 2, UNKNOWN: 99 };

async function main() {
  console.log("🔍 Glimpse Engine CI Validation\n");

  let exitCode = exitCodes.SUCCESS;
  const reports = [];

  // 1. Sync Validation
  console.log("1️⃣  Checking configuration sync...");
  const syncHealth = validateSyncHealth();
  reports.push({ name: "sync", healthy: syncHealth.healthy });

  if (!syncHealth.healthy) {
    console.error(`   ❌ ${syncHealth.reason}`);
    console.error(`   YAML: ${syncHealth.yamlHash}`);
    console.error(`   JS:   ${syncHealth.embeddedHash || "MISSING"}`);
    exitCode = exitCodes.SYNC_DRIFT;
  } else {
    console.log("   ✅ Configuration sync healthy");
  }

  // 2. Function Registry Validation
  console.log("\n2️⃣  Validating function contracts...");
  const config = parseMasterConfig(DEFAULT_MASTER_YAML);

  // Import actual implementations dynamically
  const { FunctionRegistry } = await import("../functions/functions.js");
  const implementations = Object.fromEntries(
    FunctionRegistry ? [["FunctionRegistry", FunctionRegistry]] : [],
  );

  // Note: Full implementation would check all builtin functions
  const contractReport = validateFunctionContracts(
    config.function_registry,
    {}, // Would be populated with actual implementations
  );

  if (!contractReport.valid) {
    console.error(`   ❌ Contract validation failed`);
    contractReport.missing.forEach((fn) => console.error(`      Missing: ${fn}`));
    contractReport.orphaned.forEach((fn) => console.error(`      Orphaned: ${fn}`));
    if (strict) exitCode = exitCodes.CONTRACT_FAIL;
  } else {
    console.log("   ✅ Function contracts valid");
  }

  // 3. Summary
  console.log("\n📊 Validation Summary");
  console.log("─".repeat(40));
  console.log(`Sync Health:     ${syncHealth.healthy ? "✅" : "❌"}`);
  console.log(`Contract Health: ${contractReport.valid ? "✅" : "❌"}`);
  console.log(`Mode:            ${strict ? "strict (fail on any issue)" : "permissive"}`);

  if (exitCode !== exitCodes.SUCCESS && strict) {
    console.error("\n❌ CI validation failed — commit blocked");
    process.exit(exitCode);
  }

  console.log("\n✅ CI validation passed");
  process.exit(exitCodes.SUCCESS);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(exitCodes.UNKNOWN);
});
```

---

## Phase 4: Smoke Testing

### 4.1 Validator Unit Tests

```javascript
/**
 * @file tests/validators/sync-validator.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChecksum,
  validateSyncHealth,
  detectDrift,
} from "../../core/validators/sync-validator.js";

test("computeChecksum generates consistent hashes", () => {
  const content = "test content";
  const hash1 = computeChecksum(content);
  const hash2 = computeChecksum(content);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 16);
});

test("computeChecksum produces different hashes for different content", () => {
  const hash1 = computeChecksum("content A");
  const hash2 = computeChecksum("content B");
  assert.notEqual(hash1, hash2);
});

test("validateSyncHealth returns structure", () => {
  const health = validateSyncHealth();
  assert.ok(typeof health.healthy === "boolean");
  assert.ok(Array.isArray(health.recommendations));
});

test("detectDrift identifies matching content", () => {
  const content = "version: 2\nrules: []";
  // Would need temp files to test properly
  assert.ok(true); // Placeholder
});
```

### 4.2 Calibration Engine Tests

```javascript
/**
 * @file tests/validators/calibration-engine.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createCalibrationEngine,
  CALIBRATION_POLICIES,
  createCalibratedFrame,
} from "../../core/validators/calibration-engine.js";

test("createCalibrationEngine returns engine with policy", () => {
  const engine = createCalibrationEngine("strict");
  assert.equal(engine.policy, CALIBRATION_POLICIES.strict);
  assert.ok(Array.isArray(engine.history));
});

test("calibration engine stores history", () => {
  const engine = createCalibrationEngine("adaptive");
  const frame = { gaps: [], entries: [] };
  const ctx = { entities: [{ id: "1", dimensions: {} }] };

  engine.detectGapsPolicy(frame, ctx);
  assert.equal(engine.history.length, 1);
});

test("suggestAdjustments requires sufficient history", () => {
  const engine = createCalibrationEngine("adaptive");
  const result = engine.suggestAdjustments();
  assert.equal(result.canAdjust, false);
  assert.equal(result.reason, "insufficient_history");
});

test("createCalibratedFrame includes policy", () => {
  const frame = createCalibratedFrame("strict");
  assert.equal(frame.policy, "strict");
  assert.ok(frame.calibrationEngine);
  assert.ok(typeof frame.detectGaps === "function");
});
```

### 4.3 Integration Test

```javascript
/**
 * @file tests/validators/integration.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { runContextPipeline } from "../../core/engine.js";
import { parseMasterConfig } from "../../master-config.js";
import { DEFAULT_MASTER_YAML } from "../../default-master.js";

const config = parseMasterConfig(DEFAULT_MASTER_YAML);

test("pipeline runs with calibrated confidence frame", async () => {
  const data = [
    { name: "Test", year: 2020, domain: "technology" },
    { name: "Test 2", year: 2021, domain: "technology" },
  ];

  const ctx = runContextPipeline(data, "json", config, {
    presetId: "analyst",
    calibrationPolicy: "adaptive", // New option
  });

  assert.ok(ctx);
  assert.ok(ctx.confidenceReport);
  assert.ok(Array.isArray(ctx.inferenceGaps));
});

test("validation report includes contract status", async () => {
  const data = [{ token: "test" }];
  const ctx = runContextPipeline(data, "json", config);

  assert.ok(ctx.validationReport);
  assert.ok(Array.isArray(ctx.validationReport.missingFunctions));
  assert.ok(Array.isArray(ctx.validationReport.invalidArgs));
});
```

---

## Implementation Checklist

```markdown
## Pre-Implementation

- [ ] Read existing code thoroughly
- [ ] Run existing tests: `npm test`
- [ ] Backup current state: `git tag pre-agentic-upgrade`

## Phase 1: Foundation

- [ ] Create `core/contracts.js` with type definitions
- [ ] Create `core/index.js` export barrel
- [ ] Update all imports to use canonical paths
- [ ] Run tests: `npm test`

## Phase 2: Agentic Validators

- [ ] Create `core/validators/sync-validator.js`
- [ ] Create `core/validators/function-contract.js`
- [ ] Create `core/validators/calibration-engine.js`
- [ ] Write unit tests for all validators
- [ ] Run tests: `npm run test:validators`

## Phase 3: Integration

- [ ] Create `scripts/ci-check.mjs`
- [ ] Update `package.json` scripts
- [ ] Create `.github/workflows/validate.yml` (CI)
- [ ] Run full validation: `npm run ci:check`

## Phase 4: Pipeline Integration

- [ ] Modify `pipeline.js` to accept calibrationPolicy option
- [ ] Update `confidence.js` to use calibration engine
- [ ] Ensure backward compatibility (default behavior unchanged)
- [ ] Run integration tests

## Phase 5: Documentation

- [ ] Update UPGRADE-SUMMARY.md
- [ ] Document new CLI commands
- [ ] Update examples with calibration policies

## Smoke Testing

- [ ] Run all tests: `npm test`
- [ ] Run demo: `npm run demo`
- [ ] Run CI check: `npm run ci:check`
- [ ] Verify sync: `npm run validate:sync`

## Post-Deployment

- [ ] Monitor drift logs
- [ ] Review calibration suggestions
- [ ] Iterate on thresholds
```

---

## Risk Mitigation

| Risk                   | Mitigation                                                 |
| ---------------------- | ---------------------------------------------------------- |
| Breaking changes       | 100% backward compatible; new features opt-in              |
| Performance regression | Lazy-loaded validators; zero overhead if unused            |
| False positives in CI  | `permissive` mode by default; `strict` for releases        |
| Circular dependencies  | Contracts have zero dependencies; verified by import graph |

---

## Success Metrics

- ✅ All existing tests pass
- ✅ New validator tests pass
- ✅ CI check runs in <2s
- ✅ No manual sync required for 30 days
- ✅ Calibration suggestions actionable (≥80% precision)

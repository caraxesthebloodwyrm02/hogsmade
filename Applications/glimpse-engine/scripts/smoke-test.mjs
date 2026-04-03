#!/usr/bin/env node
/**
 * @file scripts/smoke-test.mjs
 * @description Comprehensive smoke test for agentic capabilities
 * Tests all new infrastructure without external dependencies
 */

import test from "node:test";
import assert from "node:assert/strict";

const exitCodes = { SUCCESS: 0, FAILURE: 1 };

console.log("🧪 GLIMPSE AGENTIC INFRASTRUCTURE SMOKE TEST\n");
console.log("═".repeat(60));

let totalTests = 0;
let passedTests = 0;

async function testModule(name, importPath) {
  totalTests++;
  try {
    const module = await import(importPath);
    console.log(`✅ ${name} - Module loads successfully`);
    console.log(
      `   Exports: ${Object.keys(module).slice(0, 5).join(", ")}${Object.keys(module).length > 5 ? "..." : ""}`,
    );
    passedTests++;
    return module;
  } catch (err) {
    console.error(`❌ ${name} - Failed to load: ${err.message}`);
    return null;
  }
}

function testFunction(module, fnName, args, expectedType) {
  totalTests++;
  try {
    if (!module[fnName]) {
      console.error(`❌ ${fnName} - Not found in module`);
      return false;
    }

    const result = module[fnName](...args);
    const actualType = Array.isArray(result) ? "array" : typeof result;

    if (actualType === expectedType) {
      console.log(`✅ ${fnName}() - Returns ${expectedType}`);
      passedTests++;
      return true;
    } else {
      console.error(`❌ ${fnName}() - Expected ${expectedType}, got ${actualType}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ ${fnName}() - Threw: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1: Core Contracts
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 TEST SUITE: Core Contracts");
console.log("─".repeat(60));

const contracts = await testModule("contracts", "../core/contracts.js");

if (contracts) {
  testFunction(
    contracts,
    "validateShape",
    [
      "Entity",
      { id: "test", name: "Test", type: "general", dimensions: {}, metrics: {}, evidenceIds: [] },
    ],
    "object",
  );
  testFunction(contracts, "createEntity", [{ name: "Test Entity" }], "object");
  testFunction(contracts, "safePath", [{ a: { b: 1 } }, "a.b"], "number");
  testFunction(contracts, "deepEqual", [1, 1], "boolean");
  testFunction(contracts, "createChecksum", ["test"], "string");
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Calibration Engine
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 TEST SUITE: Calibration Engine");
console.log("─".repeat(60));

const calibration = await testModule(
  "calibration-engine",
  "../core/validators/calibration-engine.js",
);

if (calibration) {
  // Test CALIBRATION_POLICIES
  totalTests++;
  if (calibration.CALIBRATION_POLICIES.strict && calibration.CALIBRATION_POLICIES.adaptive) {
    console.log("✅ CALIBRATION_POLICIES - Contains strict & adaptive");
    passedTests++;
  } else {
    console.error("❌ CALIBRATION_POLICIES - Missing policies");
  }

  // Test createCalibrationEngine
  totalTests++;
  try {
    const engine = calibration.createCalibrationEngine("adaptive");
    if (engine.policy && engine.history && typeof engine.detectGapsPolicy === "function") {
      console.log("✅ createCalibrationEngine - Returns valid engine");
      passedTests++;
    } else {
      console.error("❌ createCalibrationEngine - Missing engine properties");
    }
  } catch (err) {
    console.error(`❌ createCalibrationEngine - Failed: ${err.message}`);
  }

  // Test createCalibratedFrame
  totalTests++;
  try {
    const frame = calibration.createCalibratedFrame("strict");
    if (frame.entries && frame.gaps && typeof frame.detectGaps === "function") {
      console.log("✅ createCalibratedFrame - Returns valid frame");
      passedTests++;
    } else {
      console.error("❌ createCalibratedFrame - Missing frame properties");
    }
  } catch (err) {
    console.error(`❌ createCalibratedFrame - Failed: ${err.message}`);
  }

  // Test comparePolicies
  testFunction(calibration, "comparePolicies", ["adaptive", "strict"], "object");
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Sync Validator
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 TEST SUITE: Sync Validator");
console.log("─".repeat(60));

const sync = await testModule("sync-validator", "../core/validators/sync-validator.js");

if (sync) {
  // Test computeChecksum
  totalTests++;
  try {
    const hash1 = sync.computeChecksum("test");
    const hash2 = sync.computeChecksum("test");
    if (hash1 === hash2 && hash1.length === 16) {
      console.log("✅ computeChecksum - Consistent 16-char hex");
      passedTests++;
    } else {
      console.error("❌ computeChecksum - Inconsistent or wrong length");
    }
  } catch (err) {
    console.error(`❌ computeChecksum - Failed: ${err.message}`);
  }

  // Test loadSyncRegistry
  testFunction(sync, "loadSyncRegistry", [], "object");

  // Test validateSyncHealth
  totalTests++;
  try {
    const health = sync.validateSyncHealth();
    if (typeof health.healthy === "boolean" && health.timestamp && health.recommendations) {
      console.log(`✅ validateSyncHealth - Returns structured report (healthy: ${health.healthy})`);
      passedTests++;
    } else {
      console.error("❌ validateSyncHealth - Invalid report structure");
    }
  } catch (err) {
    console.error(`❌ validateSyncHealth - Failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Function Contract
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 TEST SUITE: Function Contracts");
console.log("─".repeat(60));

const funcContracts = await testModule(
  "function-contract",
  "../core/validators/function-contract.js",
);

if (funcContracts) {
  // Test validateFunctionContracts
  totalTests++;
  try {
    const mockRegistry = {
      testFunction: { args: { x: "number" }, returns: "boolean", scope: ["dataset"] },
    };
    const mockImpls = { testFunction: (ctx, { x }) => true };
    const report = funcContracts.validateFunctionContracts(mockRegistry, mockImpls);
    if (report.valid === true && Array.isArray(report.missing)) {
      console.log("✅ validateFunctionContracts - Validates correctly");
      passedTests++;
    } else {
      console.error("❌ validateFunctionContracts - Invalid report");
    }
  } catch (err) {
    console.error(`❌ validateFunctionContracts - Failed: ${err.message}`);
  }

  // Test generateFunctionStub
  totalTests++;
  try {
    const stub = funcContracts.generateFunctionStub("testFunc", {
      args: { a: "number", b: "string" },
      returns: "boolean",
      description: "Test function",
    });
    if (stub.includes("function testFunc") && stub.includes("STUB")) {
      console.log("✅ generateFunctionStub - Generates valid stub");
      passedTests++;
    } else {
      console.error("❌ generateFunctionStub - Invalid stub format");
    }
  } catch (err) {
    console.error(`❌ generateFunctionStub - Failed: ${err.message}`);
  }

  // Test formatReport
  totalTests++;
  try {
    const mockReport = {
      valid: true,
      summary: { coverage: 1.0, totalDeclared: 5 },
      missing: [],
      orphaned: [],
      mismatched: [],
    };
    const formatted = funcContracts.formatReport(mockReport);
    if (formatted.includes("VALID") && formatted.includes("100.0%")) {
      console.log("✅ formatReport - Formats readable report");
      passedTests++;
    } else {
      console.error("❌ formatReport - Invalid formatting");
    }
  } catch (err) {
    console.error(`❌ formatReport - Failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Integration
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 TEST SUITE: Integration");
console.log("─".repeat(60));

const validators = await testModule("validators/index", "../core/validators/index.js");

if (validators) {
  testFunction(validators, "createCalibrationEngine", ["adaptive"], "object");
  testFunction(validators, "computeChecksum", ["test"], "string");
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log("📊 SMOKE TEST SUMMARY");
console.log("═".repeat(60));
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${totalTests - passedTests} ${totalTests - passedTests > 0 ? "❌" : ""}`);
console.log(`Success rate: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);

const success = passedTests === totalTests;

if (success) {
  console.log("\n✅ All smoke tests passed!");
  console.log("Agentic infrastructure is ready for deployment.");
  process.exit(exitCodes.SUCCESS);
} else {
  console.error("\n❌ Some smoke tests failed.");
  console.error("Review test output above before deployment.");
  process.exit(exitCodes.FAILURE);
}

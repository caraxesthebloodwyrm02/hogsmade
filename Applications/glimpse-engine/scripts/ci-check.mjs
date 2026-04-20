#!/usr/bin/env node
/**
 * @file scripts/ci-check.mjs
 * @description Pre-commit validation for CI/CD
 * Run: node scripts/ci-check.mjs [--strict] [--allow-heal]
 */

import { validateSyncHealth, ciCheck, autoSync } from "../core/validators/index.js";
import { validateFunctionContracts, formatReport } from "../core/validators/function-contract.js";
import { parseMasterConfig } from "../master-config.js";
import { DEFAULT_MASTER_YAML } from "../default-master.js";

// Parse arguments
const args = process.argv.slice(2);
const strict = args.includes("--strict") || args.includes("-s");
const allowHeal = args.includes("--allow-heal") || args.includes("-a");
const verbose = args.includes("--verbose") || args.includes("-v");
const json = args.includes("--json") || args.includes("-j");

const exitCodes = {
  SUCCESS: 0,
  SYNC_DRIFT: 1,
  CONTRACT_FAIL: 2,
  VALIDATION_ERROR: 3,
  UNKNOWN: 99,
};

async function main() {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    success: true,
    checks: {},
    durationMs: 0,
  };

  console.log("🔍 Glimpse Engine CI Validation\n");
  console.log(`Mode: ${strict ? "strict" : "permissive"}${allowHeal ? " + auto-heal" : ""}\n`);

  let exitCode = exitCodes.SUCCESS;

  // ═══════════════════════════════════════════════════════════════════
  // 1. SYNC VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  console.log("1️⃣  Checking configuration sync...");

  try {
    let syncHealth = validateSyncHealth();

    // Attempt auto-heal if allowed and drift detected
    if (!syncHealth.healthy && allowHeal) {
      console.log("   ⚠️  Drift detected, attempting auto-heal...");
      const healResult = await autoSync({ autoHeal: true });

      if (healResult.success) {
        console.log("   ✅ Auto-heal successful");
        syncHealth = healResult.health;
      } else {
        console.error(`   ❌ Auto-heal failed: ${healResult.error || "unknown"}`);
      }
    }

    results.checks.sync = {
      healthy: syncHealth.healthy,
      hash: syncHealth.yamlHash,
    };

    if (!syncHealth.healthy) {
      results.success = false;

      if (!json) {
        console.error(`   ❌ ${syncHealth.reason || "Configuration drift detected"}`);
        if (syncHealth.yamlHash) {
          console.error(`   YAML hash: ${syncHealth.yamlHash}`);
        }
        if (syncHealth.embeddedHash) {
          console.error(`   JS hash:   ${syncHealth.embeddedHash}`);
        }

        if (syncHealth.recommendations?.length) {
          console.error("\n   Recommendations:");
          syncHealth.recommendations.forEach((rec) => {
            const icon =
              rec.severity === "critical"
                ? "🔴"
                : rec.severity === "high"
                  ? "🟠"
                  : rec.severity === "medium"
                    ? "🟡"
                    : "🔵";
            console.error(
              `      ${icon} [${rec.severity.toUpperCase()}] ${rec.message || rec.action}`,
            );
            if (rec.command) {
              console.error(`         → Run: ${rec.command}`);
            }
          });
        }
      }

      exitCode = exitCodes.SYNC_DRIFT;
    } else {
      if (!json) {
        console.log(`   ✅ Configuration sync healthy`);
        if (verbose) {
          console.log(`      Hash: ${syncHealth.yamlHash}`);
          console.log(`      Last sync: ${syncHealth.lastSuccessfulSync || "N/A"}`);
        }
      }
    }
  } catch (err) {
    results.checks.sync = { healthy: false, error: err.message };
    results.success = false;
    console.error(`   ❌ Sync check error: ${err.message}`);
    exitCode = exitCodes.VALIDATION_ERROR;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. FUNCTION CONTRACT VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n2️⃣  Validating function contracts...");

  try {
    const config = parseMasterConfig(DEFAULT_MASTER_YAML);

    // Import actual implementations dynamically
    let implementations = {};
    try {
      const funcs = await import("../functions/functions.js");
      // Extract builtin functions from the module
      implementations = Object.fromEntries(
        Object.entries(funcs).filter(([k, v]) => typeof v === "function"),
      );
    } catch (err) {
      console.warn(`   ⚠️  Could not load implementations: ${err.message}`);
    }

    const contractReport = validateFunctionContracts(config.function_registry, implementations);

    results.checks.contracts = {
      valid: contractReport.valid,
      coverage: contractReport.summary.coverage,
      missing: contractReport.missing.length,
      orphaned: contractReport.orphaned.length,
    };

    if (!contractReport.valid) {
      results.success = false;

      if (!json) {
        console.error(`   ❌ Contract validation failed`);

        if (contractReport.missing.length) {
          console.error(
            `      Missing implementations: ${contractReport.missing.slice(0, 5).join(", ")}${
              contractReport.missing.length > 5 ? "..." : ""
            }`,
          );
        }
        if (contractReport.orphaned.length) {
          console.error(
            `      Orphaned implementations: ${contractReport.orphaned.slice(0, 5).join(", ")}${
              contractReport.orphaned.length > 5 ? "..." : ""
            }`,
          );
        }
        if (contractReport.mismatched.length) {
          console.error(`      Arity mismatches: ${contractReport.mismatched.length}`);
        }

        if (verbose) {
          console.error("\n" + formatReport(contractReport));
        }
      }

      if (strict) exitCode = Math.max(exitCode, exitCodes.CONTRACT_FAIL);
    } else {
      if (!json) {
        console.log(
          `   ✅ Function contracts valid (${contractReport.summary.totalDeclared} functions)`,
        );
        if (verbose) {
          console.log(`      Coverage: ${(contractReport.summary.coverage * 100).toFixed(1)}%`);
        }
      }
    }
  } catch (err) {
    results.checks.contracts = { valid: false, error: err.message };
    results.success = false;
    console.error(`   ❌ Contract check error: ${err.message}`);
    exitCode = Math.max(exitCode, exitCodes.VALIDATION_ERROR);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  results.durationMs = Date.now() - startTime;

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("\n" + "═".repeat(50));
    console.log("📊 VALIDATION SUMMARY");
    console.log("═".repeat(50));
    console.log(`Sync:      ${results.checks.sync?.healthy ? "✅ HEALTHY" : "❌ FAILED"}`);
    console.log(`Contracts: ${results.checks.contracts?.valid ? "✅ VALID" : "❌ INVALID"}`);
    console.log(`Duration:  ${results.durationMs}ms`);
    console.log(`Mode:      ${strict ? "strict (fail on issues)" : "permissive (warnings only)"}`);
    console.log("═".repeat(50));

    if (results.success) {
      console.log("\n✅ All checks passed");
    } else {
      console.error(`\n❌ Validation failed (exit code ${exitCode})`);
    }
  }

  process.exit(exitCode);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(exitCodes.UNKNOWN);
  });
}

/**
 * @file core/drift-guard/detector.js
 * @description File-based drift inspection engine
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DriftFormulas } from "./formulas.js";

// ═══════════════════════════════════════════════════════════════════
// DETECTOR — Extraction & Comparison Engine
// ═══════════════════════════════════════════════════════════════════

export class DriftDetector {
  constructor(config = {}) {
    this.yamlPath = config.yamlPath || "glimpse.master.yaml";
    this.jsPath = config.jsPath || "default-master.js";
    this.root = config.root || process.cwd();
  }

  resolve(p) {
    return path.resolve(this.root, p);
  }

  /**
   * Extract embedded YAML from JS fallback
   * @param {string} jsContent
   * @returns {Object} extraction result
   */
  extractEmbeddedYaml(jsContent) {
    const match = jsContent.match(/export const DEFAULT_MASTER_YAML = `([\s\S]*?)`;?$/m);

    if (!match) {
      return {
        success: false,
        error: "no_template_literal_found",
        content: null,
      };
    }

    return {
      success: true,
      content: match[1],
      error: null,
    };
  }

  /**
   * Execute full drift detection sequence
   * @returns {Object} comprehensive drift report
   */
  detect() {
    const startTime = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      duration: 0,
      state: "unknown",
      yaml: { exists: false, hash: null, lines: 0 },
      embedded: { exists: false, hash: null, lines: 0, extractable: false },
      drift: { detected: false, severity: "none", lineDiff: 0 },
      recommendations: [],
    };

    try {
      // Phase 1: Source existence
      const yamlPath = this.resolve(this.yamlPath);
      const jsPath = this.resolve(this.jsPath);

      report.yaml.exists = existsSync(yamlPath);
      report.embedded.exists = existsSync(jsPath);

      if (!report.yaml.exists || !report.embedded.exists) {
        report.state = "MISSING_SOURCE";
        report.drift.detected = report.yaml.exists !== report.embedded.exists;
        report.recommendations.push({
          severity: "critical",
          action: report.yaml.exists ? "extract_from_embedded" : "restore_backup",
        });
        return report;
      }

      // Phase 2: Content extraction
      const yamlContent = readFileSync(yamlPath, "utf8");
      const jsContent = readFileSync(jsPath, "utf8");

      report.yaml.content = yamlContent.slice(0, 100); // Preview
      report.yaml.lines = yamlContent.split("\n").length;
      report.yaml.hash = DriftFormulas.computeHash(yamlContent);

      // Phase 3: Embedded extraction
      const embedded = this.extractEmbeddedYaml(jsContent);
      report.embedded.extractable = embedded.success;

      if (!embedded.success) {
        report.state = "EXTRACTION_FAILED";
        report.drift.detected = true;
        report.recommendations.push({
          severity: "critical",
          action: "regenerate_fallback",
          reason: embedded.error,
        });
        return report;
      }

      report.embedded.lines = embedded.content.split("\n").length;
      report.embedded.hash = DriftFormulas.computeHash(embedded.content);

      // Phase 4: Drift calculation
      report.drift.detected = DriftFormulas.isDrift(report.yaml.hash, report.embedded.hash);
      report.drift.lineDiff = report.yaml.lines - report.embedded.lines;
      report.drift.severity = DriftFormulas.calculateSeverity(report.drift.lineDiff);

      report.duration = Date.now() - startTime;

      if (report.drift.detected) {
        report.state = "DRIFT_DETECTED";
        report.recommendations.push({
          severity: report.drift.severity,
          action: "run_sync_script",
          command: "node scripts/sync-default-master.mjs",
          metadata: {
            lineDiff: report.drift.lineDiff,
            yamlHash: report.yaml.hash,
            embeddedHash: report.embedded.hash,
          },
        });
      } else {
        report.state = "HEALTHY";
      }
    } catch (error) {
      report.state = "ERROR";
      report.error = error.message;
      report.recommendations.push({
        severity: "critical",
        action: "manual_investigation",
        reason: error.message,
      });
    }

    report.duration = Date.now() - startTime;
    return report;
  }
}

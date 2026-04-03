/**
 * @file core/drift-guard/telemetry.js
 * @description Event logging, state persistence, and trend analysis
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { VERSION, LOG_PATH, DEFAULT_STATE_PATH } from "./formulas.js";

// ═══════════════════════════════════════════════════════════════════
// TELEMETRY — Event Logging & Metrics
// ═══════════════════════════════════════════════════════════════════

export class DriftTelemetry {
  constructor(config = {}) {
    this.logPath = config.logPath || LOG_PATH;
    this.statePath = config.statePath || DEFAULT_STATE_PATH;
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dir = path.dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Append event to log
   * @param {Object} event
   */
  log(event) {
    const entry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
      }) + "\n";

    try {
      writeFileSync(this.logPath, entry, { flag: "a" });
    } catch (e) {
      console.error("Telemetry log failed:", e.message);
    }
  }

  /**
   * Persist state for history tracking
   * @param {Object} state
   */
  saveState(state) {
    try {
      const existing = this.loadState();
      const updated = {
        ...existing,
        ...state,
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(this.statePath, JSON.stringify(updated, null, 2));
    } catch (e) {
      console.error("State save failed:", e.message);
    }
  }

  loadState() {
    try {
      return JSON.parse(readFileSync(this.statePath, "utf8"));
    } catch {
      return { version: VERSION, runs: [] };
    }
  }

  /**
   * Calculate trends from history
   * @returns {Object} trend analysis
   */
  analyzeTrends() {
    const state = this.loadState();
    const runs = state.runs || [];

    if (runs.length < 3) {
      return { insufficient: true, minRequired: 3, actual: runs.length };
    }

    const recent = runs.slice(-10);
    const driftRate = recent.filter((r) => r.driftDetected).length / recent.length;
    const avgDuration = recent.reduce((a, r) => a + (r.duration || 0), 0) / recent.length;

    return {
      driftRate,
      avgDuration,
      totalRuns: runs.length,
      trend: driftRate > 0.3 ? "DEGRADING" : driftRate === 0 ? "STABLE" : "FLUCTUATING",
    };
  }
}

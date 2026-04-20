/**
 * Anticipation Engine for Pipeline Failure Prediction.
 *
 * Complements the existing Signal Router with proactive predictions about
 * likely pipeline failures based on historical patterns, current signals,
 * and environmental context.
 *
 * Processes both real-time log entries and periodic state evaluations to
 * generate AnticipationSignal objects that can be consumed by monitoring
 * systems, dashboards, and automated remediation tools.
 */

import { promises as fs } from "fs";
import path from "path";
import { generateId } from "@cascade/shared-types/id";
import { getConfig } from "./config.js";
import { readAllLogs } from "./storage.js";
import type { LogEntry } from "./types.js";
import { runProbe } from "./probe.js";
import { loadRegistry, getProject } from "./registry.js";

const config = getConfig();

// ── Anticipation Types (aligned with anticipation-schema.ts definitions) ──

export type AnticipationConfidence = "high" | "medium" | "low" | "unknown";
export type AnticipationHorizon = "immediate" | "short" | "medium" | "long";

export type AnticipationCategory =
  | "pipeline_failure"
  | "test_flake"
  | "resource_exhaustion"
  | "dependency_block"
  | "fixture_missing"
  | "env_drift";

export interface AnticipationSignal {
  id: string;
  category: AnticipationCategory;
  label: string;
  confidence: AnticipationConfidence;
  horizon: AnticipationHorizon;
  target: string;
  transition: {
    from: string;
    to: string;
  };
  evidence: string[];
  action: string;
  generatedAt: string;
  expectedAt?: string;
  resolvedAt?: string;
  resolved: boolean;
}

export interface ProximityWindow {
  id: string;
  window: {
    start: string;
    end: string;
  };
  signals: AnticipationSignal[];
  confidence: AnticipationConfidence;
  primaryCategory: AnticipationCategory;
  signalCount: number;
  isRiskCluster: boolean;
}

export interface AnticipationStore {
  id: string;
  activeSignals: AnticipationSignal[];
  resolvedSignals: AnticipationSignal[];
  windows: ProximityWindow[];
  metadata: {
    schemaVersion: string;
    lastUpdated: string;
    totalSignalsGenerated: number;
    totalSignalsResolved: number;
    activeRiskClusters: number;
  };
}

// ── Configuration & Constants ──

const ANTICIPATION_SCHEMA_VERSION = "1.0.0";
const DEFAULT_WINDOW_MINUTES = 30;
const RISK_THRESHOLD_MEDIUM = 5;
const RISK_THRESHOLD_HIGH = 10;
const SIGNAL_TTL_DAYS = 7;

// Schema migration path — old versions map to new fields
const SCHEMA_MIGRATIONS: Record<string, (store: AnticipationStore) => AnticipationStore> = {
  "0.9.0": (store) => {
    // Migrate from 0.9.0: add missing metadata fields
    store.metadata.totalSignalsGenerated = store.metadata.totalSignalsGenerated || 0;
    store.metadata.totalSignalsResolved = store.metadata.totalSignalsResolved || 0;
    store.metadata.activeRiskClusters = store.metadata.activeRiskClusters || 0;
    return store;
  },
};

// ── Store Implementation ──

class PipelineAnticipationStore {
  private path: string;
  private mutex: Promise<void> = Promise.resolve();

  constructor() {
    this.path = path.join(config.dataDir, "anticipation", "store.json");
  }

  async load(): Promise<AnticipationStore> {
    try {
      await fs.mkdir(path.dirname(this.path), { recursive: true });
      const content = await fs.readFile(this.path, "utf-8");
      const store = JSON.parse(content) as AnticipationStore;

      // Check schema version and migrate if needed
      const storeVersion = store.metadata.schemaVersion;
      if (storeVersion !== ANTICIPATION_SCHEMA_VERSION) {
        // Try migration path first
        if (SCHEMA_MIGRATIONS[storeVersion]) {
          const migrated = SCHEMA_MIGRATIONS[storeVersion](store);
          migrated.metadata.schemaVersion = ANTICIPATION_SCHEMA_VERSION;
          await this.save(migrated);
          return migrated;
        }
        // No migration path — warn and create new store
        process.stderr.write(
          `[anticipation] schema version mismatch: ${storeVersion} -> ${ANTICIPATION_SCHEMA_VERSION}. ` +
            "Active signals will be discarded. No migration path available.\n",
        );
        return this.createDefaultStore();
      }

      // Prune resolved signals older than TTL
      const ttlCutoff = new Date(Date.now() - SIGNAL_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      store.resolvedSignals = store.resolvedSignals.filter(
        (s) => (s.resolvedAt ?? s.generatedAt) >= ttlCutoff,
      );

      return store;
    } catch {
      return this.createDefaultStore();
    }
  }

  async save(store: AnticipationStore): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    const tmpPath = this.path + `.tmp.${process.pid}`;
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, this.path);
  }

  private createDefaultStore(): AnticipationStore {
    return {
      id: generateId("anticipation-store"),
      activeSignals: [],
      resolvedSignals: [],
      windows: [],
      metadata: {
        schemaVersion: ANTICIPATION_SCHEMA_VERSION,
        lastUpdated: new Date().toISOString(),
        totalSignalsGenerated: 0,
        totalSignalsResolved: 0,
        activeRiskClusters: 0,
      },
    };
  }

  async appendSignal(signal: AnticipationSignal): Promise<void> {
    const ours = this.mutex.then(async () => {
      try {
        const store = await this.load();
        store.activeSignals.push(signal);
        store.metadata.totalSignalsGenerated++;
        store.metadata.lastUpdated = new Date().toISOString();
        await this.save(store);
      } catch (err) {
        console.error("PipelineAnticipationStore.appendSignal failed:", err);
      }
    });
    this.mutex = ours;
    await ours;
    // N1: reset chain only if no concurrent caller extended it — prevents unbounded growth
    if (this.mutex === ours) {
      this.mutex = Promise.resolve();
    }
  }

  async resolveSignal(signalId: string, _outcome: string): Promise<void> {
    const ours = this.mutex.then(async () => {
      try {
        const store = await this.load();
        const signalIndex = store.activeSignals.findIndex((s) => s.id === signalId);

        if (signalIndex !== -1) {
          const signal = store.activeSignals[signalIndex];
          signal.resolved = true;
          signal.resolvedAt = new Date().toISOString();

          // Move from active to resolved
          store.activeSignals.splice(signalIndex, 1);
          store.resolvedSignals.push(signal);

          store.metadata.totalSignalsResolved++;
          store.metadata.lastUpdated = new Date().toISOString();

          await this.save(store);
        }
      } catch (err) {
        console.error("PipelineAnticipationStore.resolveSignal failed:", err);
      }
    });
    this.mutex = ours;
    await ours;
    // N1: reset chain only if no concurrent caller extended it — prevents unbounded growth
    if (this.mutex === ours) {
      this.mutex = Promise.resolve();
    }
  }

  async getActiveSignals(): Promise<AnticipationSignal[]> {
    const store = await this.load();
    return store.activeSignals;
  }

  async getSignalsByTarget(target: string): Promise<AnticipationSignal[]> {
    const store = await this.load();
    return store.activeSignals.filter((s) => s.target === target);
  }
}

// ── Prediction Engine ──

export class PipelineAnticipationEngine {
  private store: PipelineAnticipationStore;

  constructor() {
    this.store = new PipelineAnticipationStore();
  }

  private calculateConfidence(
    riskScore: number,
    historicalAccuracy: number,
  ): AnticipationConfidence {
    if (riskScore >= RISK_THRESHOLD_HIGH && historicalAccuracy >= 0.7) return "high";
    if (riskScore >= RISK_THRESHOLD_MEDIUM && historicalAccuracy >= 0.5) return "medium";
    if (riskScore > 0) return "low";
    return "unknown";
  }

  private determineHorizon(riskPatterns: string[]): AnticipationHorizon {
    const immediatePatterns = ["timeout", "memory_leak", "unhandled_rejection"];
    const shortPatterns = ["assertion_error", "race_condition", "network_error"];

    if (riskPatterns.some((p) => immediatePatterns.includes(p))) return "immediate";
    if (riskPatterns.some((p) => shortPatterns.includes(p))) return "short";
    return "medium";
  }

  private generateAction(category: AnticipationCategory, target: string): string {
    const actions: Record<AnticipationCategory, string> = {
      pipeline_failure: `Review ${target} test patterns and check resource usage`,
      test_flake: `Investigate flaky tests in ${target} and add retry logic`,
      resource_exhaustion: `Monitor ${target} resource usage and consider scaling`,
      dependency_block: `Check ${target} dependency versions and availability`,
      fixture_missing: `Verify test fixtures for ${target} are properly configured`,
      env_drift: `Audit ${target} environment configuration for inconsistencies`,
    };
    return actions[category];
  }

  async analyzeRecentLogs(logs: LogEntry[]): Promise<AnticipationSignal[]> {
    if (logs.length === 0) return [];

    // Run probe for side effects (logging, metrics) if needed
    runProbe(logs, "anticipation-engine");
    const registry = await loadRegistry();
    const signals: AnticipationSignal[] = [];

    // Group logs by source/project
    const projectSignals = new Map<
      string,
      { critical: number; warning: number; patterns: Set<string> }
    >();

    for (const entry of logs) {
      if (!entry.source) continue;

      let projectStats = projectSignals.get(entry.source);
      if (!projectStats) {
        projectStats = { critical: 0, warning: 0, patterns: new Set() };
        projectSignals.set(entry.source, projectStats);
      }

      if (entry.severity === "critical") projectStats.critical++;
      if (entry.severity === "warning") projectStats.warning++;

      const stats = projectStats;
      entry.matchedPatterns.forEach((pattern) => stats.patterns.add(pattern));
    }

    // Generate signals for each project with significant risk
    for (const [projectId, stats] of projectSignals) {
      const totalRisk = stats.critical * 2 + stats.warning; // Weight critical higher

      if (totalRisk >= RISK_THRESHOLD_MEDIUM) {
        const patterns = Array.from(stats.patterns);
        const project =
          registry.projects.find((p) => p.id === projectId) || (await getProject(projectId));

        let category: AnticipationCategory = "pipeline_failure";

        // Refine category based on specific patterns
        if (patterns.includes("flaky_test")) {
          category = "test_flake";
        } else if (patterns.includes("memory_leak")) {
          category = "resource_exhaustion";
        } else if (patterns.includes("network_error") || patterns.includes("ECONNREFUSED")) {
          category = "dependency_block";
        }

        const confidence = this.calculateConfidence(totalRisk, 0.6); // Start with moderate historical accuracy
        const horizon = this.determineHorizon(patterns);

        const signal: AnticipationSignal = {
          id: generateId("anticipation"),
          category,
          label: `${category.replace("_", " ")} predicted for ${projectId}`,
          confidence,
          horizon,
          target: projectId,
          transition: {
            from: project?.healthStatus || "unknown",
            to: "failing",
          },
          evidence: [
            `${stats.critical} critical signals detected`,
            `${stats.warning} warning signals detected`,
            `Patterns: ${patterns.join(", ")}`,
            `Time window: last ${DEFAULT_WINDOW_MINUTES} minutes`,
          ],
          action: this.generateAction(category, projectId),
          generatedAt: new Date().toISOString(),
          resolved: false,
        };

        signals.push(signal);
        await this.store.appendSignal(signal);
      }
    }

    return signals;
  }

  async evaluateProjectHealth(projectId: string): Promise<AnticipationSignal[]> {
    const project = await getProject(projectId);
    if (!project) return [];

    const logs = await readAllLogs();
    const projectLogs = logs.filter((entry) => entry.source === projectId);

    if (projectLogs.length === 0) return [];

    const recentLogs = projectLogs.slice(-100); // Last 100 entries
    return this.analyzeRecentLogs(recentLogs);
  }

  async generateProximityWindow(start: string, end: string): Promise<ProximityWindow> {
    const store = await this.store.load();
    const signalsInWindow = store.activeSignals.filter(
      (s) => s.generatedAt >= start && s.generatedAt <= end,
    );

    // Determine primary category
    const categoryCounts = new Map<AnticipationCategory, number>();
    signalsInWindow.forEach((signal) => {
      categoryCounts.set(signal.category, (categoryCounts.get(signal.category) || 0) + 1);
    });

    let primaryCategory: AnticipationCategory = "pipeline_failure";
    let maxCount = 0;
    for (const [category, count] of categoryCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryCategory = category;
      }
    }

    // Determine overall confidence (highest among signals)
    const confidenceOrder: AnticipationConfidence[] = ["unknown", "low", "medium", "high"];
    let overallConfidence: AnticipationConfidence = "unknown";

    for (const signal of signalsInWindow) {
      const signalIndex = confidenceOrder.indexOf(signal.confidence);
      const currentIndex = confidenceOrder.indexOf(overallConfidence);
      if (signalIndex > currentIndex) {
        overallConfidence = signal.confidence;
      }
    }

    const window: ProximityWindow = {
      id: generateId("proximity"),
      window: { start, end },
      signals: signalsInWindow,
      confidence: overallConfidence,
      primaryCategory,
      signalCount: signalsInWindow.length,
      isRiskCluster: signalsInWindow.length >= 3 && overallConfidence !== "unknown",
    };

    return window;
  }

  // Public API
  async getActiveAnticipationSignals(): Promise<AnticipationSignal[]> {
    return this.store.getActiveSignals();
  }

  async resolveAnticipationSignal(signalId: string, outcome: string): Promise<void> {
    await this.store.resolveSignal(signalId, outcome);
  }
}

// ── Module-level singleton and exports ──

let engine: PipelineAnticipationEngine | null = null;

export function getAnticipationEngine(): PipelineAnticipationEngine {
  if (!engine) {
    engine = new PipelineAnticipationEngine();
  }
  return engine;
}

export async function generateAnticipationSignals(): Promise<AnticipationSignal[]> {
  const logs = await readAllLogs();
  const recentLogs = logs.slice(-200); // Last 200 log entries
  const engine = getAnticipationEngine();
  return engine.analyzeRecentLogs(recentLogs);
}

export async function getAnticipationStatus(): Promise<{
  activeSignals: number;
  riskClusters: number;
  recentPredictions: AnticipationSignal[];
}> {
  const engine = getAnticipationEngine();
  const signals = await engine.getActiveAnticipationSignals();

  // Generate proximity window for last 24 hours
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const window = await engine.generateProximityWindow(start, end);

  return {
    activeSignals: signals.length,
    riskClusters: window.isRiskCluster ? 1 : 0,
    recentPredictions: signals.slice(0, 5), // Top 5 recent predictions
  };
}

/**
 * Harness → Ori bridge.
 *
 * Converts HarnessSignal objects to ori LogEntry format and appends them to
 * ori's daily log file (~/.ori/logs/{YYYY-MM-DD}.ndjson) so the ori signal
 * router can evaluate them, fire routes, and write notebook entries.
 *
 * Direct filesystem write — no MCP transport needed. Mirrors the appendLogEntries
 * function in ori-server/src/storage.ts.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { HarnessSignal } from "./types.js";

// Severity mirrors ori-server/src/types.ts → Severity
type Severity = "critical" | "warning" | "info" | "unknown";

// Minimal LogEntry matching ori-server/src/types.ts → LogEntry
interface OriLogEntry {
  id: string;
  timestamp: string;
  line: string;
  source: string;
  severity: Severity;
  matchedPatterns: string[];
  testFile?: string;
}

function oriLogDir(): string {
  const oriDir = process.env.ORI_DATA_DIR?.trim() || path.join(os.homedir(), ".ori");
  return path.join(oriDir, "logs");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function signalToLogEntry(signal: HarnessSignal): OriLogEntry {
  // Severity: anomaly (silence-zone signals) → warning; transistor fire → info; others → unknown
  let severity: Severity = "info";
  if (signal.isAnomaly) {
    severity = "warning";
  }

  // Human-readable one-liner for ori's pattern classifier
  const line =
    `HARNESS:${signal.scenarioName}:${signal.signalType.toUpperCase()}:${signal.key}=${
      signal.value
    }` + ` step=${signal.step} zone=${signal.zone} intensity=${signal.intensity.toFixed(2)}`;

  return {
    id: signal.id,
    timestamp: signal.timestamp,
    line,
    source: "harness-server",
    severity,
    matchedPatterns: [signal.signalType, `zone:${signal.zone}`],
  };
}

/**
 * Convert and append harness signals to ori's log store.
 * Called fire-and-forget from runner.ts after runScenario completes.
 */
export async function bridgeSignalsToOri(signals: HarnessSignal[]): Promise<void> {
  if (signals.length === 0) return;

  const logDir = oriLogDir();
  await fs.mkdir(logDir, { recursive: true });

  const logFile = path.join(logDir, `${todayKey()}.ndjson`);
  const entries = signals.map(signalToLogEntry);
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

  await fs.appendFile(logFile, lines, "utf-8");
}

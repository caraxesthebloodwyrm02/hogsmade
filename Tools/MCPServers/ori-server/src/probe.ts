/**
 * Probe engine — time-aware risk scanning.
 */

import { generateId } from "@cascade/shared-types/id";
import { promises as fs } from "fs";
import { getConfig } from "./config.js";
import { RISK_PATTERNS } from "./patterns.js";
import type { LogEntry, ProbeResult } from "./types.js";

const config = getConfig();

export function runProbe(entries: LogEntry[], source: string): ProbeResult {
  const criticalCount = entries.filter((e) => e.severity === "critical").length;
  const warningCount = entries.filter((e) => e.severity === "warning").length;
  const infoCount = entries.filter((e) => e.severity === "info").length;
  const unknownCount = entries.filter((e) => e.severity === "unknown").length;
  const riskSignals = criticalCount + warningCount;

  const patternCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const pid of entry.matchedPatterns) {
      patternCounts.set(pid, (patternCounts.get(pid) ?? 0) + 1);
    }
  }

  const topPatterns = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pid, count]) => {
      const def = RISK_PATTERNS.find((p) => p.id === pid);
      return { patternId: pid, label: def?.label ?? pid, count };
    });

  const timestamps = entries.map((e) => e.timestamp).sort();
  const timeWindow = {
    start: timestamps[0] ?? new Date().toISOString(),
    end: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
  };

  return {
    id: generateId("probe"),
    timestamp: new Date().toISOString(),
    totalLines: entries.length,
    riskSignals,
    criticalCount,
    warningCount,
    infoCount,
    unknownCount,
    topPatterns,
    timeWindow,
    source,
  };
}

export async function saveProbe(result: ProbeResult): Promise<void> {
  const filepath = `${config.probeDir}/${result.id}.json`;
  await fs.writeFile(filepath, JSON.stringify(result, null, 2), "utf-8");
}

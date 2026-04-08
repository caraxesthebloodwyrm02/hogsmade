/**
 * Recommendation engine — read-reason-actionable output for edge cases.
 */

import { generateId } from "@cascade/shared-types/id";
import { promises as fs } from "fs";
import { getConfig } from "./config.js";
import { RISK_PATTERNS } from "./patterns.js";
import { todayKey } from "./storage.js";
import type { ThreatEntry } from "./threat-model.js";
import type { LogEntry, ProbeResult, Recommendation } from "./types.js";

const config = getConfig();

// Map risk patterns to related threat IDs for threat-aware recommendations
const PATTERN_THREAT_MAP: Record<string, string[]> = {
  assertion_error: ["TM-001", "TM-002", "TM-005"],
  timeout: ["TM-002"],
  unhandled_rejection: ["TM-001", "TM-002"],
  race_condition: ["TM-002", "TM-003"],
  network_error: ["TM-002", "TM-005"],
  type_error: ["TM-001"],
  memory_leak: ["TM-002"],
  console_error: [],
  console_warn: [],
  deprecation: [],
  test_skip: [],
  flaky_test: [],
};

export function generateRecommendations(probe: ProbeResult, entries: LogEntry[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Group entries by pattern for targeted recommendations
  const byPattern = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    for (const pid of entry.matchedPatterns) {
      if (!byPattern.has(pid)) byPattern.set(pid, []);
      byPattern.get(pid)!.push(entry);
    }
  }

  // Critical patterns -> immediate action
  for (const pattern of RISK_PATTERNS.filter((p) => p.severity === "critical")) {
    const hits = byPattern.get(pattern.id) ?? [];
    if (hits.length === 0) continue;

    const uniqueFiles = [...new Set(hits.map((h) => h.testFile).filter(Boolean))];
    const timeSpan =
      hits.length > 1
        ? Math.round(
            (new Date(hits[hits.length - 1].timestamp).getTime() -
              new Date(hits[0].timestamp).getTime()) /
              1000,
          )
        : 0;

    recommendations.push({
      id: generateId("rec"),
      timestamp: new Date().toISOString(),
      title: `Sand edge: ${pattern.label} (${hits.length} occurrence${hits.length > 1 ? "s" : ""})`,
      read: `Detected ${hits.length} ${pattern.label} signal${hits.length > 1 ? "s" : ""} across test output${uniqueFiles.length > 0 ? ` in ${uniqueFiles.join(", ")}` : ""}${timeSpan > 0 ? ` over ${timeSpan}s window` : ""}.`,
      reason: `${pattern.label} indicates a sharp edge that could surface as a production failure. ${hits.length > 3 ? "High frequency suggests systemic issue, not isolated flake." : "Low frequency may indicate an edge case worth documenting."}`,
      action:
        hits.length > 1
          ? `Investigate root cause in ${uniqueFiles.length > 0 ? uniqueFiles.slice(0, 3).join(", ") : "affected test files"}. Add explicit assertion or error boundary to prevent silent failure.`
          : `Review the single occurrence at ${hits[0]?.timestamp ?? "unknown time"}. Determine if it's a false positive or a genuine edge case.`,
      severity: "critical",
      relatedPatterns: [pattern.id],
      reproducibility: `Re-run test suite with same seed. Filter logs for pattern "${pattern.id}" using filter_logs tool. Compare counts across runs to determine determinism.`,
    });
  }

  // Warning patterns -> watch and document
  for (const pattern of RISK_PATTERNS.filter((p) => p.severity === "warning")) {
    const hits = byPattern.get(pattern.id) ?? [];
    if (hits.length === 0) continue;

    const uniqueFiles = [...new Set(hits.map((h) => h.testFile).filter(Boolean))];

    recommendations.push({
      id: generateId("rec"),
      timestamp: new Date().toISOString(),
      title: `Monitor: ${pattern.label} (${hits.length} occurrence${hits.length > 1 ? "s" : ""})`,
      read: `Found ${hits.length} ${pattern.label} signal${hits.length > 1 ? "s" : ""}${uniqueFiles.length > 0 ? ` in ${uniqueFiles.join(", ")}` : ""}.`,
      reason: `${pattern.label} is not blocking but indicates degradation risk. ${hits.length > 5 ? "Accumulating — consider addressing before it escalates." : "Within acceptable range but worth tracking."}`,
      action: `Document this pattern in test notes. ${hits.length > 5 ? "Set up automated alert if count increases in next run." : "No immediate action required — re-evaluate on next probe."}`,
      severity: "warning",
      relatedPatterns: [pattern.id],
      reproducibility: `Filter logs for "${pattern.id}" across the last 3 test runs. If count is stable, mark as known-warn. If increasing, escalate to critical.`,
    });
  }

  // Sort by severity then count
  const severityWeight = { critical: 3, warning: 2, info: 1 };
  recommendations.sort((a, b) => {
    const sa = severityWeight[a.severity] ?? 0;
    const sb = severityWeight[b.severity] ?? 0;
    if (sb !== sa) return sb - sa;
    return a.relatedPatterns.length - b.relatedPatterns.length;
  });

  return recommendations;
}

export async function saveRecommendations(recs: Recommendation[]): Promise<void> {
  const filepath = `${config.recommendationsDir}/${todayKey()}.json`;
  await fs.writeFile(filepath, JSON.stringify(recs, null, 2), "utf-8");
}

/**
 * Generate threat-aware recommendations — "less is more" methodology.
 *
 * Enriches standard recommendations with threat model context.
 * Only surfaces recommendations relevant to the scoped projects.
 * Each recommendation targets one specific action.
 */
export function generateThreatAwareRecommendations(
  probe: ProbeResult,
  entries: LogEntry[],
  threats: ThreatEntry[],
  scopedProjectIds?: string[],
): Recommendation[] {
  // Start with standard recommendations
  const base = generateRecommendations(probe, entries);

  // Build a threat lookup
  const threatMap = new Map<string, ThreatEntry>();
  for (const t of threats) threatMap.set(t.id, t);

  // Enrich with threat context
  for (const rec of base) {
    const relatedThreats: string[] = [];
    for (const patId of rec.relatedPatterns) {
      const mapped = PATTERN_THREAT_MAP[patId] ?? [];
      relatedThreats.push(...mapped);
    }
    const uniqueThreats = [...new Set(relatedThreats)];

    if (uniqueThreats.length > 0) {
      const threatDetails = uniqueThreats
        .map((tid) => threatMap.get(tid))
        .filter(Boolean) as ThreatEntry[];

      if (threatDetails.length > 0) {
        const highestPriority = threatDetails.find((t) => t.priority === "high")
          ?? threatDetails[0];

        rec.reason += ` Related to ${uniqueThreats.join(", ")} (${highestPriority.priority} priority). Mitigation: ${highestPriority.mitigations.slice(0, 200)}`;
        rec.relatedPatterns.push(...uniqueThreats);
      }
    }
  }

  // Scope filtering: if project IDs are specified, only keep entries whose
  // source matches one of the scoped projects
  if (scopedProjectIds && scopedProjectIds.length > 0) {
    const scopeSet = new Set(scopedProjectIds);
    const sourceProjects = new Set(entries.map((e) => e.source));
    // Only filter if entries have project-scoped sources
    const hasProjectSources = [...sourceProjects].some((s) => scopeSet.has(s));
    if (hasProjectSources) {
      const scopedEntries = entries.filter((e) => scopeSet.has(e.source));
      if (scopedEntries.length < entries.length) {
        // Re-run with scoped entries for a tighter recommendation set
        return generateThreatAwareRecommendations(probe, scopedEntries, threats);
      }
    }
  }

  // "Less is more": cap at top 5 most actionable
  return base.slice(0, 5);
}

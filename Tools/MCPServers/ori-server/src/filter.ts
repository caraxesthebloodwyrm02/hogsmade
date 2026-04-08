/**
 * Filter engine — sort + filter = good note material.
 */

import type { LogEntry } from "./types.js";

export interface FilterOptions {
  severity?: string[];
  patternIds?: string[];
  source?: string;
  since?: string;
  until?: string;
  sortBy?: "timestamp" | "severity" | "pattern_count";
  sortOrder?: "asc" | "desc";
}

export function filterLogs(entries: LogEntry[], options: FilterOptions = {}): LogEntry[] {
  let filtered = [...entries];

  if (options.severity && options.severity.length > 0) {
    const sevSet = new Set(options.severity);
    filtered = filtered.filter((e) => sevSet.has(e.severity));
  }

  if (options.patternIds && options.patternIds.length > 0) {
    const patSet = new Set(options.patternIds);
    filtered = filtered.filter((e) => e.matchedPatterns.some((p) => patSet.has(p)));
  }

  if (options.source) {
    filtered = filtered.filter((e) => e.source === options.source);
  }

  if (options.since) {
    const sinceMs = new Date(options.since).getTime();
    filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceMs);
  }

  if (options.until) {
    const untilMs = new Date(options.until).getTime();
    filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= untilMs);
  }

  const sortBy = options.sortBy ?? "timestamp";
  const sortOrder = options.sortOrder ?? "desc";
  const severityOrder = { critical: 3, warning: 2, info: 1, unknown: 0 };

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "timestamp") {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else if (sortBy === "severity") {
      cmp = (severityOrder[a.severity] ?? 0) - (severityOrder[b.severity] ?? 0);
    } else if (sortBy === "pattern_count") {
      cmp = a.matchedPatterns.length - b.matchedPatterns.length;
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });

  return filtered;
}

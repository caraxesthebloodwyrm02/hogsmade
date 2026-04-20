/**
 * Risk pattern definitions and classification engine.
 */

import type { RiskPattern, Severity } from "./types.js";

export const RISK_PATTERNS: RiskPattern[] = [
  {
    id: "assertion_error",
    label: "Assertion failure",
    regex: /AssertionError|assert\s+failed|expect.*to\s+be/i,
    severity: "critical",
  },
  {
    id: "timeout",
    label: "Timeout detected",
    regex: /TimeoutError|timed?\s*out|Exceeded\s+timeout|ETIMEDOUT/i,
    severity: "critical",
  },
  {
    id: "unhandled_rejection",
    label: "Unhandled promise rejection",
    regex: /UnhandledPromiseRejection|unhandled\s+rejection|promise.*reject/i,
    severity: "critical",
  },
  {
    id: "deprecation",
    label: "Deprecation warning",
    regex: /deprecat(ed|ion)|will\s+be\s+removed|no\s+longer\s+supported/i,
    severity: "warning",
  },
  {
    id: "memory_leak",
    label: "Memory concern",
    regex: /memory\s+leak|heap\s+(out|exhausted)|MaxListenersExceeded|possible\s+memory/i,
    severity: "warning",
  },
  {
    id: "race_condition",
    label: "Race condition signal",
    regex: /race\s+condition|concurrent\s+modif|deadlock|lock\s+contention/i,
    severity: "critical",
  },
  {
    id: "type_error",
    label: "Type mismatch",
    regex: /TypeError|Cannot\s+read\s+propert|undefined\s+is\s+not|cannot\s+read\s+properties/i,
    severity: "warning",
  },
  {
    id: "network_error",
    label: "Network failure",
    regex: /ECONNREFUSED|ENOTFOUND|fetch\s+failed|network\s+error|socket\s+hang/i,
    severity: "warning",
  },
  {
    id: "console_warn",
    label: "Console warning",
    regex: /console\.warn|WARN\s*[:\]]|⚠/i,
    severity: "info",
  },
  {
    id: "console_error",
    label: "Console error",
    regex: /console\.error|ERROR\s*[:\]]|✖/i,
    severity: "warning",
  },
  {
    id: "test_skip",
    label: "Skipped test",
    regex: /skip(ped)?|todo|pending|disabled\s+test/i,
    severity: "info",
  },
  {
    id: "flaky_test",
    label: "Flaky test signal",
    regex: /flaky?\s+test|intermittent\s+(fail|error)|non-determin/i,
    severity: "warning",
  },
];

export function classifyLine(line: string): { severity: Severity; matchedPatterns: string[] } {
  const matched: string[] = [];
  let highestSeverity: Severity = "unknown";
  const severityOrder: readonly Severity[] = ["unknown", "info", "warning", "critical"];

  for (const pattern of RISK_PATTERNS) {
    if (pattern.regex.test(line)) {
      matched.push(pattern.id);
      const currentIdx = severityOrder.indexOf(highestSeverity);
      const newIdx = severityOrder.indexOf(pattern.severity);
      if (newIdx > currentIdx) {
        highestSeverity = pattern.severity;
      }
    }
  }

  return { severity: highestSeverity, matchedPatterns: matched };
}

export function extractTestFile(line: string): string | undefined {
  const match = line.match(/(?:at\s+)?(?:file:\/\/)?([^\s]+\.test\.[a-z]+)/i);
  if (match) return match[1];
  const specMatch = line.match(/(?:at\s+)?(?:file:\/\/)?([^\s]+\.spec\.[a-z]+)/i);
  if (specMatch) return specMatch[1];
  return undefined;
}

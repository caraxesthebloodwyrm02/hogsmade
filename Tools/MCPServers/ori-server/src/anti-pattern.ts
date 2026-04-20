/**
 * Protocol-level anti-pattern scanner.
 *
 * Operates on the signal *sequence* — not individual lines — to detect
 * structural pathologies that single-pattern matching cannot see.
 *
 * Design constraints:
 *   1. Deterministic — same input always produces same output.
 *   2. Context-minimal — each finding carries the smallest window of
 *      LogEntry IDs that is sufficient to reproduce it.
 *   3. Adaptive — detectors use dynamic thresholds derived from the
 *      batch characteristics, not hard-coded absolute counts.
 *   4. No I/O — pure function over the in-memory entry slice.
 *   5. Fast — linear or O(n log n); no nested quadratic scans.
 */

import type { AntiPatternFinding, LogEntry } from "./types.js";

// ── Internal helpers ──

/** Parse ISO timestamp to epoch ms. Fast path: skip Date constructor when possible. */
function tsMs(ts: string): number {
  return new Date(ts).getTime();
}

/** Deduplicate an array preserving order. */
function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Return at most `n` items from `arr`, centre-biased (keep head+tail, drop middle). */
function clampWindow(ids: string[], n = 10): string[] {
  if (ids.length <= n) return ids;
  const half = Math.floor(n / 2);
  return [...ids.slice(0, half), ...ids.slice(-half)];
}

// ── Detector implementations ──

/**
 * AP_RETRY_STORM
 * Same source + same pattern appears ≥3 times within a 500 ms bracket.
 * Adaptive threshold: at least 3 hits OR >30% of the batch from that source.
 */
function detectRetryStorm(entries: LogEntry[]): AntiPatternFinding[] {
  const findings: AntiPatternFinding[] = [];
  // Group by source → pattern
  const index = new Map<string, LogEntry[]>();
  for (const e of entries) {
    for (const pat of e.matchedPatterns) {
      const key = `${e.source}::${pat}`;
      const bucket = index.get(key) ?? [];
      bucket.push(e);
      index.set(key, bucket);
    }
  }
  const batchSize = entries.length;

  for (const [key, bucket] of index.entries()) {
    if (bucket.length < 3) continue;
    const adaptiveMin = Math.max(3, Math.floor(batchSize * 0.3));
    const sorted = [...bucket].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
    // Sliding window: find any span of ≥3 entries within 500 ms
    for (let i = 0; i <= sorted.length - 3; i++) {
      const span = tsMs(sorted[Math.min(i + adaptiveMin - 1, sorted.length - 1)].timestamp) - tsMs(sorted[i].timestamp);
      if (span <= 500) {
        const [src, pat] = key.split("::");
        const windowSlice = sorted.slice(i, i + adaptiveMin);
        findings.push({
          code: "AP_RETRY_STORM",
          label: "Retry storm — repeated signal burst",
          severity: "critical",
          windowIds: clampWindow(windowSlice.map((e) => e.id)),
          topLine: windowSlice[0].line.slice(0, 200),
          sources: [src],
          patterns: [pat],
          action: `Halt retries from source "${src}" on pattern "${pat}". Inspect for missing backoff or broken circuit breaker. Add jitter.`,
        });
        break;
      }
    }
  }
  return findings;
}

/**
 * AP_ONSET_MASK
 * ≥2 warning entries from source S immediately precede a critical from S
 * (within 2 entries in sequence order) — warnings were masking imminent failure.
 */
function detectOnsetMask(entries: LogEntry[]): AntiPatternFinding[] {
  const findings: AntiPatternFinding[] = [];
  const bySource = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const bucket = bySource.get(e.source) ?? [];
    bucket.push(e);
    bySource.set(e.source, bucket);
  }

  for (const [src, bucket] of bySource.entries()) {
    const sorted = [...bucket].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
    for (let i = 2; i < sorted.length; i++) {
      if (sorted[i].severity !== "critical") continue;
      const pre = sorted.slice(Math.max(0, i - 4), i);
      const warningPre = pre.filter((e) => e.severity === "warning");
      if (warningPre.length < 2) continue;
      const window = [...warningPre, sorted[i]];
      findings.push({
        code: "AP_ONSET_MASK",
        label: "Warning onset masking critical failure",
        severity: "warning",
        windowIds: clampWindow(window.map((e) => e.id)),
        topLine: sorted[i].line.slice(0, 200),
        sources: [src],
        patterns: uniq(window.flatMap((e) => e.matchedPatterns)),
        action: `Escalate warning signals from "${src}" before they reach critical. Add an intermediate alert or lower the warning threshold for patterns: ${uniq(warningPre.flatMap((e) => e.matchedPatterns)).join(", ")}.`,
      });
      i++; // skip past this critical to avoid duplicate findings
    }
  }
  return findings;
}

/**
 * AP_REJECTION_CHAIN
 * unhandled_rejection entry followed immediately (within 3 entries, same source)
 * by a type_error entry — classic null-dereference cascade.
 */
function detectRejectionChain(entries: LogEntry[]): AntiPatternFinding[] {
  const findings: AntiPatternFinding[] = [];
  const bySource = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const bucket = bySource.get(e.source) ?? [];
    bucket.push(e);
    bySource.set(e.source, bucket);
  }

  for (const [src, bucket] of bySource.entries()) {
    const sorted = [...bucket].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (!sorted[i].matchedPatterns.includes("unhandled_rejection")) continue;
      // Look ahead ≤3 entries for type_error
      const lookahead = sorted.slice(i + 1, i + 4);
      const typeErr = lookahead.find((e) => e.matchedPatterns.includes("type_error"));
      if (!typeErr) continue;
      findings.push({
        code: "AP_REJECTION_CHAIN",
        label: "Rejection→type-error null-dereference cascade",
        severity: "critical",
        windowIds: clampWindow([sorted[i].id, typeErr.id]),
        topLine: sorted[i].line.slice(0, 200),
        sources: [src],
        patterns: ["unhandled_rejection", "type_error"],
        action: `Guard the promise chain in "${src}": add null-checks or optional chaining before the property access that follows rejection. The TypeError at "${typeErr.line.slice(0, 100)}" is the dereference site.`,
      });
      i += 2; // advance past the chain
    }
  }
  return findings;
}

/**
 * AP_SOURCE_OSCILLATION
 * Critical/warning entries alternate between exactly 2 sources with no
 * intervening clean entries — suggests a ping-pong failure handoff.
 * Requires ≥4 alternating entries.
 */
function detectSourceOscillation(entries: LogEntry[]): AntiPatternFinding[] {
  const signal = entries
    .filter((e) => e.severity === "critical" || e.severity === "warning")
    .sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));

  if (signal.length < 4) return [];

  const findings: AntiPatternFinding[] = [];
  let runStart = 0;

  while (runStart <= signal.length - 4) {
    const srcA = signal[runStart].source;
    const srcB = signal[runStart + 1].source;
    if (srcA === srcB) { runStart++; continue; }

    let len = 2;
    while (
      runStart + len < signal.length &&
      signal[runStart + len].source === (len % 2 === 0 ? srcA : srcB)
    ) {
      len++;
    }

    if (len >= 4) {
      const window = signal.slice(runStart, runStart + len);
      findings.push({
        code: "AP_SOURCE_OSCILLATION",
        label: "Source oscillation — ping-pong failure handoff",
        severity: "critical",
        windowIds: clampWindow(window.map((e) => e.id)),
        topLine: window[0].line.slice(0, 200),
        sources: [srcA, srcB],
        patterns: uniq(window.flatMap((e) => e.matchedPatterns)),
        action: `Sources "${srcA}" and "${srcB}" are alternately failing — likely a shared dependency or circular call chain. Introduce an isolation boundary or circuit breaker between them.`,
      });
      runStart += len;
    } else {
      runStart++;
    }
  }
  return findings;
}

/**
 * AP_PATTERN_CONVERGENCE
 * A single log entry matches ≥4 distinct risk patterns — indicative of a
 * panic/crash message that spans multiple signal dimensions simultaneously.
 */
function detectPatternConvergence(entries: LogEntry[]): AntiPatternFinding[] {
  return entries
    .filter((e) => e.matchedPatterns.length >= 4)
    .map((e) => ({
      code: "AP_PATTERN_CONVERGENCE" as const,
      label: "Pattern convergence — multi-dimensional crash signal",
      severity: "critical" as const,
      windowIds: [e.id],
      topLine: e.line.slice(0, 200),
      sources: [e.source],
      patterns: e.matchedPatterns,
      action: `Single line in "${e.source}" matches ${e.matchedPatterns.length} patterns simultaneously (${e.matchedPatterns.join(", ")}). This is a high-density crash signal. Inspect immediately — do not wait for threshold accumulation.`,
    }));
}

/**
 * AP_TEMPORAL_BURST
 * ≥5 entries arrive within a 500 ms wall-clock span.
 * Adaptive: threshold scales to 20% of batch size for large batches.
 */
function detectTemporalBurst(entries: LogEntry[]): AntiPatternFinding[] {
  if (entries.length < 5) return [];

  const sorted = [...entries].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
  const threshold = Math.max(5, Math.floor(sorted.length * 0.2));
  const findings: AntiPatternFinding[] = [];
  let i = 0;

  while (i <= sorted.length - threshold) {
    const windowEnd = tsMs(sorted[i + threshold - 1].timestamp);
    const windowStart = tsMs(sorted[i].timestamp);
    if (windowEnd - windowStart <= 500) {
      // Expand to include all entries in this burst
      let j = i + threshold;
      while (j < sorted.length && tsMs(sorted[j].timestamp) - windowStart <= 500) j++;
      const burst = sorted.slice(i, j);
      const sources = uniq(burst.map((e) => e.source));
      findings.push({
        code: "AP_TEMPORAL_BURST",
        label: "Temporal burst — ingestion flood or tight loop",
        severity: "warning",
        windowIds: clampWindow(burst.map((e) => e.id)),
        topLine: burst[0].line.slice(0, 200),
        sources,
        patterns: uniq(burst.flatMap((e) => e.matchedPatterns)),
        action: `${burst.length} entries from [${sources.join(", ")}] within ${windowEnd - windowStart} ms. Check for a tight error loop, log-on-every-tick pattern, or test harness without rate control.`,
      });
      i = j; // skip past the burst
    } else {
      i++;
    }
  }
  return findings;
}

/**
 * AP_SILENT_REGRESSION
 * A source that produced critical/warning signals in an earlier portion of
 * the batch produces *only* info/unknown signals in the latter half.
 * Indicates an error-silencing path was taken (swallowed catch, fallback that
 * hides failures).
 *
 * Only fires when both halves have ≥3 entries from that source.
 */
function detectSilentRegression(entries: LogEntry[]): AntiPatternFinding[] {
  if (entries.length < 6) return [];

  const sorted = [...entries].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid);
  const second = sorted.slice(mid);

  const findings: AntiPatternFinding[] = [];
  const sources = uniq(entries.map((e) => e.source));

  for (const src of sources) {
    const firstSrc = first.filter((e) => e.source === src);
    const secondSrc = second.filter((e) => e.source === src);
    if (firstSrc.length < 3 || secondSrc.length < 3) continue;

    const firstHasCritWarn = firstSrc.some(
      (e) => e.severity === "critical" || e.severity === "warning",
    );
    const secondAllInfoOrUnknown = secondSrc.every(
      (e) => e.severity === "info" || e.severity === "unknown",
    );

    if (!firstHasCritWarn || !secondAllInfoOrUnknown) continue;

    const evidenceWindow = [
      ...firstSrc.filter((e) => e.severity === "critical" || e.severity === "warning").slice(-2),
      ...secondSrc.slice(0, 2),
    ];

    findings.push({
      code: "AP_SILENT_REGRESSION",
      label: "Silent regression — errors swallowed mid-sequence",
      severity: "warning",
      windowIds: clampWindow(evidenceWindow.map((e) => e.id)),
      topLine: evidenceWindow[0]?.line.slice(0, 200) ?? "",
      sources: [src],
      patterns: uniq(evidenceWindow.flatMap((e) => e.matchedPatterns)),
      action: `Source "${src}" went quiet after producing critical/warning signals. Audit catch blocks and fallback paths in "${src}" for swallowed errors. Add structured error logging at boundaries.`,
    });
  }
  return findings;
}

// ── Public API ──

/**
 * Scan a signal-bearing entry slice for protocol-level anti-patterns.
 *
 * Input: the entries that already have `matchedPatterns.length > 0`
 * (the same slice passed to `evaluateSignals`).
 *
 * Returns deduplicated findings sorted by severity (critical first)
 * then by window start position.
 */
export function detectAntiPatterns(entries: LogEntry[]): AntiPatternFinding[] {
  if (entries.length === 0) return [];

  const all: AntiPatternFinding[] = [
    ...detectRetryStorm(entries),
    ...detectOnsetMask(entries),
    ...detectRejectionChain(entries),
    ...detectSourceOscillation(entries),
    ...detectPatternConvergence(entries),
    ...detectTemporalBurst(entries),
    ...detectSilentRegression(entries),
  ];

  // Deduplicate: same code + same first windowId = same finding
  const seen = new Set<string>();
  const deduped: AntiPatternFinding[] = [];
  for (const f of all) {
    const key = `${f.code}::${f.windowIds[0] ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  // Sort: critical first, then by first windowId (preserves batch order)
  deduped.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (a.windowIds[0] ?? "").localeCompare(b.windowIds[0] ?? "");
  });

  return deduped;
}

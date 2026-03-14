/**
 * Continuous Learning System for Glimpse Engine
 *
 * Four layers, each feeding the next:
 *
 * 1. LOG       — Append-only JSONL trace of every pipeline run
 * 2. COLLECT   — Accumulate history: file churn, pattern hits, confidence trends
 * 3. REFINE    — Compare current run against historical baseline, detect drift
 * 4. IMPROVE   — Auto-tune config thresholds based on accumulated evidence
 *
 * Storage: single .glimpse-history.json file (local-first, no external deps).
 * Traces: .glimpse-traces.jsonl (append-only log).
 *
 * Pure functions + fs, browser-safe fallback (returns data without writing).
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HISTORY_PATH = ".glimpse-history.json";
const DEFAULT_TRACES_PATH  = ".glimpse-traces.jsonl";

function emptyHistory() {
  return {
    version: 1,
    created: new Date().toISOString(),
    runs: 0,
    fileIndex: {},       // path -> { totalChurn, appearances, avgAddRatio, vectors: {} }
    patternIndex: {},    // ruleId -> { firings, avgDensity, lastSeen }
    confidenceTrend: [], // [{ ts, overall, avg, gaps }] — last 50 entries
    lensHistory: {},     // lensId -> { appearances, totalScore }
    improvements: [],    // [{ ts, field, from, to, reason }] — audit trail
    thresholds: {},      // auto-tuned overrides: { secondary_lens_threshold, evidence_confidence_floor, ... }
  };
}

// ============================================================================
// 1. LOG — Append-only JSONL trace
// ============================================================================

/**
 * Build a lightweight trace entry from pipeline inputs/outputs.
 *
 * @param {Array} records - Input records fed to pipeline
 * @param {object} result - Pipeline output from runContextPipeline
 * @param {object} meta   - { source, elapsed }
 * @returns {object} Trace entry
 */
export function buildTrace(records, result, meta = {}) {
  return {
    ts: new Date().toISOString(),
    source: meta.source || "unknown",
    elapsed: meta.elapsed || 0,
    fileCount: records.length,
    totalChurn: records.reduce((s, r) => s + (r.churn || 0), 0),
    complexity: result.complexity?.level || "unknown",
    passCount: result.modeSettings?.passCount || 1,
    confidence: result.confidenceReport?.overallScore || 0,
    avgConfidence: result.confidenceReport?.avgConfidence || 0,
    gapCount: result.confidenceReport?.gapCount || 0,
    lensCount: result.contextLenses?.length || 0,
    primaryLens: result.primaryLens?.id || null,
    patternCount: result.invariantPatterns?.length || 0,
    topPatterns: (result.invariantPatterns || []).slice(0, 3).map(p => ({
      rule: p.ruleId, density: p.densityScore, firings: p.firingCount,
    })),
    // Session shape — for cross-session comparison
    dirCount: [...new Set(records.map(r => r.directory))].length,
    dirs: [...new Set(records.map(r => r.directory))],
    vectorMix: buildVectorMix(records),
    adds: records.reduce((s, r) => s + (r.additions || 0), 0),
    dels: records.reduce((s, r) => s + (r.deletions || 0), 0),
    files: records.map(r => ({ path: r.path, churn: r.churn, vector: r.vector })),
  };
}

/**
 * Append trace to JSONL file.
 *
 * @param {object} trace - From buildTrace
 * @param {string} [path] - File path, defaults to .glimpse-traces.jsonl
 */
export function appendTrace(trace, path) {
  const p = path || DEFAULT_TRACES_PATH;
  try {
    appendFileSync(p, JSON.stringify(trace) + "\n", "utf-8");
  } catch (_) {
    // Swallow — logging must never break the pipeline
  }
}

// ============================================================================
// 2. COLLECT — Accumulate history from traces
// ============================================================================

/**
 * Load history from disk, or create empty.
 *
 * @param {string} [path]
 * @returns {object} History object
 */
export function loadHistory(path) {
  const p = path || DEFAULT_HISTORY_PATH;
  try {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8"));
    }
  } catch (_) { /* corrupt file — start fresh */ }
  return emptyHistory();
}

/**
 * Save history to disk.
 *
 * @param {object} history
 * @param {string} [path]
 */
export function saveHistory(history, path) {
  const p = path || DEFAULT_HISTORY_PATH;
  try {
    writeFileSync(p, JSON.stringify(history, null, 2), "utf-8");
  } catch (_) { /* non-fatal */ }
}

/**
 * Ingest a trace into the history, updating all indices.
 *
 * @param {object} history - Mutable history object
 * @param {object} trace   - From buildTrace
 * @returns {object} The mutated history
 */
export function collectTrace(history, trace) {
  history.runs++;

  // File index
  for (const f of (trace.files || [])) {
    const idx = history.fileIndex[f.path] || { totalChurn: 0, appearances: 0, avgAddRatio: 0.5, vectors: {} };
    idx.totalChurn += f.churn || 0;
    idx.appearances++;
    idx.vectors[f.vector] = (idx.vectors[f.vector] || 0) + 1;
    history.fileIndex[f.path] = idx;
  }

  // Pattern index
  for (const p of (trace.topPatterns || [])) {
    const idx = history.patternIndex[p.rule] || { firings: 0, avgDensity: 0, lastSeen: null, densityHistory: [] };
    idx.firings += p.firings || 0;
    idx.densityHistory.push(p.density || 0);
    if (idx.densityHistory.length > 50) idx.densityHistory.shift();
    idx.avgDensity = idx.densityHistory.reduce((s, v) => s + v, 0) / idx.densityHistory.length;
    idx.lastSeen = trace.ts;
    history.patternIndex[p.rule] = idx;
  }

  // Confidence trend (ring buffer, 50 entries) — enriched with session shape
  history.confidenceTrend.push({
    ts: trace.ts,
    overall: trace.confidence,
    avg: trace.avgConfidence,
    gaps: trace.gapCount,
    files: trace.fileCount,
    files_list: (trace.files || []).map(f => f.path),
    dirCount: trace.dirCount || 0,
    dirs: trace.dirs || [],
    vectorMix: trace.vectorMix || {},
    primaryLens: trace.primaryLens || null,
  });
  if (history.confidenceTrend.length > 50) history.confidenceTrend.shift();

  // Lens history
  if (trace.primaryLens) {
    const lh = history.lensHistory[trace.primaryLens] || { appearances: 0, totalScore: 0 };
    lh.appearances++;
    history.lensHistory[trace.primaryLens] = lh;
  }

  return history;
}

// ============================================================================
// 3. REFINE — Compare current run against baseline, detect drift
// ============================================================================

/**
 * Compute a refinement report: how does this run compare to history?
 *
 * @param {object} history - Accumulated history
 * @param {object} trace   - Current run trace
 * @returns {object} Refinement report
 */
export function refineRun(history, trace) {
  const report = {
    isFirstRun: history.runs <= 1,
    runNumber: history.runs,
    confidenceDelta: 0,
    gapDelta: 0,
    churnTrend: "stable",
    hotFiles: [],
    stalePatterns: [],
    improvingPatterns: [],
    driftWarnings: [],
  };

  if (report.isFirstRun) return report;

  // Confidence delta vs historical average
  const confHistory = history.confidenceTrend;
  if (confHistory.length >= 2) {
    const prevAvg = confHistory.slice(0, -1).reduce((s, c) => s + c.overall, 0) / (confHistory.length - 1);
    report.confidenceDelta = +(trace.confidence - prevAvg).toFixed(3);

    const prevGapAvg = confHistory.slice(0, -1).reduce((s, c) => s + c.gaps, 0) / (confHistory.length - 1);
    report.gapDelta = +(trace.gapCount - prevGapAvg).toFixed(1);
  }

  // Churn trend: is total churn growing, shrinking, or stable?
  if (confHistory.length >= 3) {
    const recentChurn = confHistory.slice(-3).reduce((s, c) => s + (c.files || 0), 0) / 3;
    const olderChurn  = confHistory.slice(0, -3).reduce((s, c) => s + (c.files || 0), 0) / Math.max(1, confHistory.length - 3);
    if (recentChurn > olderChurn * 1.5) report.churnTrend = "increasing";
    else if (recentChurn < olderChurn * 0.6) report.churnTrend = "decreasing";
  }

  // Hot files: top 5 by total churn across all runs
  report.hotFiles = Object.entries(history.fileIndex)
    .sort((a, b) => b[1].totalChurn - a[1].totalChurn)
    .slice(0, 5)
    .map(([path, idx]) => ({ path, totalChurn: idx.totalChurn, appearances: idx.appearances, topVector: topKey(idx.vectors) }));

  // Pattern health: stale (not seen in last 5 runs) vs improving (density rising)
  for (const [rule, idx] of Object.entries(history.patternIndex)) {
    const dh = idx.densityHistory || [];
    if (dh.length >= 3) {
      const recent = avg(dh.slice(-3));
      const older  = avg(dh.slice(0, -3));
      if (recent > older * 1.1) report.improvingPatterns.push({ rule, delta: +(recent - older).toFixed(3) });
    }
    // Stale: not in current run's top patterns
    const inCurrent = (trace.topPatterns || []).some(p => p.rule === rule);
    if (!inCurrent && idx.firings > 3) {
      report.stalePatterns.push({ rule, lastSeen: idx.lastSeen, totalFireings: idx.firings });
    }
  }

  // Drift warnings
  if (report.confidenceDelta < -0.1) {
    report.driftWarnings.push({ type: "confidence_drop", message: `Confidence dropped ${(-report.confidenceDelta * 100).toFixed(0)}% vs baseline`, severity: 0.6 });
  }
  if (report.gapDelta > 1) {
    report.driftWarnings.push({ type: "gap_increase", message: `${report.gapDelta.toFixed(0)} more gaps than average`, severity: 0.5 });
  }
  if (report.churnTrend === "increasing") {
    report.driftWarnings.push({ type: "churn_spike", message: "Recent diffs are significantly larger than historical average", severity: 0.4 });
  }

  return report;
}

// ============================================================================
// 4. IMPROVE — Auto-tune config based on accumulated evidence
// ============================================================================

/**
 * Suggest and apply threshold adjustments based on history.
 * Returns a list of improvements made. Does NOT mutate config directly —
 * returns an override object to merge into config.defaults.
 *
 * @param {object} history    - Accumulated history
 * @param {object} refinement - From refineRun
 * @param {object} currentDefaults - Current config.defaults
 * @returns {{ overrides: object, applied: Array<{field, from, to, reason}> }}
 */
export function suggestImprovements(history, refinement, currentDefaults = {}) {
  const overrides = { ...history.thresholds };
  const applied = [];

  // Only improve after enough data (5+ runs)
  if (history.runs < 5) return { overrides, applied };

  const trend = history.confidenceTrend;

  // 4a. Confidence floor — if consistently high, we can tighten
  if (trend.length >= 5) {
    const recentAvg = avg(trend.slice(-5).map(t => t.avg));
    const currentFloor = overrides.evidence_confidence_floor ?? currentDefaults.evidence_confidence_floor ?? 0.35;

    if (recentAvg > 0.85 && currentFloor < 0.45) {
      const newFloor = +(currentFloor + 0.05).toFixed(2);
      overrides.evidence_confidence_floor = newFloor;
      applied.push({ field: "evidence_confidence_floor", from: currentFloor, to: newFloor, reason: `Avg confidence ${(recentAvg * 100).toFixed(0)}% over last 5 runs — tightening floor` });
    }
    // If confidence is dropping, loosen
    if (recentAvg < 0.5 && currentFloor > 0.25) {
      const newFloor = +(currentFloor - 0.05).toFixed(2);
      overrides.evidence_confidence_floor = newFloor;
      applied.push({ field: "evidence_confidence_floor", from: currentFloor, to: newFloor, reason: `Avg confidence ${(recentAvg * 100).toFixed(0)}% — loosening floor to capture more` });
    }
  }

  // 4b. Secondary lens threshold — if many lenses consistently appear, lower threshold
  const lensAppearances = Object.values(history.lensHistory).reduce((s, l) => s + l.appearances, 0);
  const lensCount = Object.keys(history.lensHistory).length;
  if (lensCount >= 3 && history.runs >= 5) {
    const avgAppearance = lensAppearances / lensCount;
    const currentThreshold = overrides.secondary_lens_threshold ?? currentDefaults.secondary_lens_threshold ?? 0.35;

    if (avgAppearance > history.runs * 0.6 && currentThreshold > 0.25) {
      const newThreshold = +(currentThreshold - 0.03).toFixed(2);
      overrides.secondary_lens_threshold = newThreshold;
      applied.push({ field: "secondary_lens_threshold", from: currentThreshold, to: newThreshold, reason: `${lensCount} lenses each appearing ${avgAppearance.toFixed(0)}/${history.runs} runs — widening lens capture` });
    }
  }

  // 4c. Gap-aware pass count suggestion
  if (trend.length >= 5) {
    const recentGaps = avg(trend.slice(-5).map(t => t.gaps));
    if (recentGaps > 3 && !overrides.suggested_min_passes) {
      overrides.suggested_min_passes = 2;
      applied.push({ field: "suggested_min_passes", from: 1, to: 2, reason: `Avg ${recentGaps.toFixed(1)} gaps/run — recommending 2+ inference passes` });
    }
    if (recentGaps < 1 && overrides.suggested_min_passes === 2) {
      delete overrides.suggested_min_passes;
      applied.push({ field: "suggested_min_passes", from: 2, to: "auto", reason: "Gaps resolved — removing pass count override" });
    }
  }

  // Persist improvements in history
  if (applied.length > 0) {
    history.thresholds = overrides;
    for (const a of applied) {
      history.improvements.push({ ts: new Date().toISOString(), ...a });
    }
    // Cap audit trail
    if (history.improvements.length > 100) {
      history.improvements = history.improvements.slice(-100);
    }
  }

  return { overrides, applied };
}

/**
 * Apply threshold overrides to a config object (non-destructive copy).
 *
 * @param {object} config    - Original config
 * @param {object} overrides - From suggestImprovements
 * @returns {object} New config with merged defaults
 */
export function applyOverrides(config, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return config;
  return {
    ...config,
    defaults: {
      ...config.defaults,
      ...overrides,
    },
  };
}

// ============================================================================
// 5. ORCHESTRATOR — single function that runs the full loop
// ============================================================================

/**
 * Run the full learning cycle: log → collect → refine → improve.
 * Call this AFTER runContextPipeline completes.
 *
 * @param {Array} records   - Input records
 * @param {object} result   - Pipeline output
 * @param {object} config   - Config used for this run
 * @param {object} meta     - { source, elapsed }
 * @param {object} [opts]   - { historyPath, tracesPath }
 * @returns {{ trace, history, refinement, improvements, config }}
 */
export function learnFromRun(records, result, config, meta, opts = {}) {
  const historyPath = opts.historyPath || DEFAULT_HISTORY_PATH;
  const tracesPath  = opts.tracesPath  || DEFAULT_TRACES_PATH;

  // 1. Log
  const trace = buildTrace(records, result, meta);
  appendTrace(trace, tracesPath);

  // 2. Collect
  const history = loadHistory(historyPath);
  collectTrace(history, trace);

  // 3. Refine
  const refinement = refineRun(history, trace);

  // 4. Compare to recent sessions
  const comparison = compareToRecent(history, trace);

  // 5. Improve
  const { overrides, applied } = suggestImprovements(history, refinement, config.defaults);
  const improvedConfig = applyOverrides(config, overrides);

  // Persist
  saveHistory(history, historyPath);

  return {
    trace,
    history: {
      runs: history.runs,
      hotFiles: Object.keys(history.fileIndex).length,
      trackedPatterns: Object.keys(history.patternIndex).length,
      confidenceTrendLength: history.confidenceTrend.length,
      improvementCount: history.improvements.length,
    },
    refinement,
    comparison,
    improvements: applied,
    config: improvedConfig,
  };
}

// ============================================================================
// 6. SESSION RECAP — the core output: "what did I actually do?"
// ============================================================================

/**
 * Generate a compact session recap: 5-10 lines that answer
 * "what did I just do?" for a solo developer.
 *
 * @param {Array} records        - Input records (files changed)
 * @param {object} result        - Pipeline output
 * @param {object} refinement    - From refineRun
 * @param {object} meta          - { source, elapsed }
 * @param {object} [comparison]  - From compareToRecent
 * @param {object} [pathResult]  - From runPaths (PATH system evaluation)
 * @returns {string[]} Lines of the recap (ready to console.log)
 */
export function buildSessionRecap(records, result, refinement, meta = {}, comparison = null, pathResult = null) {
  const lines = [];

  // Line 1: Session fingerprint — one-line characterization
  const fingerprint = buildFingerprint(records, result);
  lines.push(`  ${fingerprint}`);
  lines.push(`  ${"─".repeat(Math.min(50, fingerprint.length))}`);

  // Line 2: Scope — how many files, total churn, time
  const totalChurn = records.reduce((s, r) => s + (r.churn || 0), 0);
  const adds = records.reduce((s, r) => s + (r.additions || 0), 0);
  const dels = records.reduce((s, r) => s + (r.deletions || 0), 0);
  lines.push(`  ${records.length} files  +${adds} -${dels}  (${meta.elapsed || "?"}ms, ${result.modeSettings?.passCount || 1}-pass)`);

  // Line 3: Domains touched — which conceptual areas
  const lenses = (result.contextLenses || []).filter(l => l.score > 0.3);
  if (lenses.length > 0) {
    const domainStr = lenses.map(l => `${l.label.toLowerCase()}${l.role === "primary" ? "*" : ""}`).join(", ");
    lines.push(`  domains: ${domainStr}`);
  }

  // Line 4: Directory spread — where the changes landed
  const dirs = [...new Set(records.map(r => r.directory))];
  if (dirs.length <= 4) {
    lines.push(`  touched: ${dirs.join(", ")}`);
  } else {
    lines.push(`  touched: ${dirs.slice(0, 3).join(", ")} +${dirs.length - 3} more`);
  }

  // Line 5: Dominant vector — what kind of work this was
  const vectorCounts = {};
  records.forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const sorted = Object.entries(vectorCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const top = sorted.slice(0, 3).map(([v, c]) => `${v}(${c})`).join(" ");
    lines.push(`  vectors: ${top}`);
  }

  // Line 6: Confidence + gaps (only if noteworthy)
  const conf = result.confidenceReport;
  if (conf) {
    const confPct = Math.round((conf.overallScore || 0) * 100);
    const gapNote = conf.gapCount > 0 ? `, ${conf.gapCount} gap${conf.gapCount !== 1 ? "s" : ""}` : "";
    lines.push(`  confidence: ${confPct}%${gapNote}`);
  }

  // Line 7: Session comparison — the key line: how does this compare to recent sessions?
  if (comparison?.summary) {
    lines.push(`  ${comparison.summary}`);
  }

  // Line 8: Drift warnings (only if present, keep short)
  if (refinement.driftWarnings?.length > 0) {
    lines.push(`  ! ${refinement.driftWarnings.map(w => w.type.replace(/_/g, " ")).join(", ")}`);
  }

  // Line 9: Nudge — from PATH system (weighted accumulation) or fallback
  const nudge = pathResult?.nudge || buildNudge(records, result, refinement, comparison);
  if (nudge) lines.push(`  → ${nudge}`);

  return lines;
}

/**
 * Build a one-line "fingerprint" of the session.
 * Examples:
 *   "deep refactor in core/ (5 files, logic*)"
 *   "scattered config touches across 8 dirs"
 *   "expansion burst in analysis/ + tests/"
 */
function buildFingerprint(records, result) {
  const vectorCounts = {};
  records.forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const topVector = topKey(vectorCounts) || "mixed";

  const dirs = [...new Set(records.map(r => r.directory))];
  const primaryLens = result.primaryLens?.label?.toLowerCase() || null;

  // Determine shape
  const isDeep = dirs.length <= 2 && records.length >= 3;
  const isScattered = dirs.length >= 5;
  const isSurgical = records.length <= 2;

  let shape;
  if (isSurgical) shape = "quick fix";
  else if (isDeep) shape = `deep ${topVector}`;
  else if (isScattered) shape = `scattered ${topVector}`;
  else shape = `${topVector} session`;

  // Location
  let location;
  if (dirs.length === 1) location = `in ${dirs[0]}`;
  else if (dirs.length <= 3) location = `in ${dirs.join(" + ")}`;
  else location = `across ${dirs.length} dirs`;

  // Domain tag
  const tag = primaryLens ? ` (${primaryLens})` : "";

  return `${shape} ${location}${tag}`;
}

/**
 * Build a forward-looking nudge — one sentence connecting what happened
 * to what to watch for next. Not a summary, a coach's note.
 *
 * Rules are evaluated top-down; first match wins.
 * Each rule tests a session condition and returns actionable advice.
 */
function buildNudge(records, result, refinement, comparison) {
  const dirs = [...new Set(records.map(r => r.directory))];
  const totalChurn = records.reduce((s, r) => s + (r.churn || 0), 0);
  const adds = records.reduce((s, r) => s + (r.additions || 0), 0);
  const dels = records.reduce((s, r) => s + (r.deletions || 0), 0);
  const conf = result.confidenceReport?.overallScore || 0;
  const gaps = result.confidenceReport?.gapCount || 0;
  const lenses = (result.contextLenses || []).filter(l => l.score > 0.3);
  const primaryDomain = result.primaryLens?.label?.toLowerCase() || null;

  const vectorCounts = {};
  records.forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const topVector = topKey(vectorCounts);
  const hasTests = records.some(r => /test|spec/i.test(r.path));
  const hasConfig = records.some(r => /config|env|json|yaml|toml/i.test(r.extension || ""));
  const novelAreas = comparison?.details?.novelDirs?.length || 0;
  const isScattered = dirs.length >= 5;
  const isDeep = dirs.length <= 2 && records.length >= 3;

  // — Nudge rules: first match wins —

  // Scattered expansion into new areas without tests
  if (isScattered && topVector === "expansion" && !hasTests && novelAreas > 2) {
    return "wide expansion into new areas with no test coverage — integration risk is high";
  }

  // Heavy expansion without tests
  if (topVector === "expansion" && adds > 200 && !hasTests) {
    return "lots of new code, no tests in this diff — consider a test pass next";
  }

  // Scattered changes + low confidence
  if (isScattered && conf < 0.7) {
    return "changes are spread thin and confidence is low — might be worth consolidating focus";
  }

  // Pure removal session
  if (topVector === "removal" && dels > adds * 3) {
    return "cleanup session — verify nothing downstream depends on what was removed";
  }

  // Deep refactor in one area
  if (isDeep && topVector === "refactor") {
    return `deep refactor in ${dirs[0] || "one area"} — run the existing tests before moving on`;
  }

  // Config-only changes
  if (hasConfig && records.length <= 3 && !hasTests) {
    return "config changes can have wide blast radius — quick smoke test recommended";
  }

  // Novel areas detected (comparison available)
  if (novelAreas > 0 && comparison?.details?.hasHistory) {
    return `touching ${novelAreas} area${novelAreas > 1 ? "s" : ""} you haven't been in recently — check for stale assumptions`;
  }

  // High churn single file (specific > generic)
  const maxChurnFile = records.reduce((best, r) => r.churn > (best?.churn || 0) ? r : best, null);
  if (maxChurnFile && maxChurnFile.churn > totalChurn * 0.6 && records.length > 3) {
    return `${maxChurnFile.name} holds ${Math.round(maxChurnFile.churn / totalChurn * 100)}% of the churn — might be doing too much in one file`;
  }

  // Scattered with many vectors
  if (Object.keys(vectorCounts).length >= 4) {
    return "mixed change types in one session — consider splitting into focused commits";
  }

  // Gaps detected
  if (gaps >= 2) {
    return `${gaps} analysis gaps — some entities aren't connected, possible missing relationships`;
  }

  // Confidence drop vs recent
  if (refinement.confidenceDelta < -0.1) {
    return "confidence dropped vs your recent baseline — this diff may be harder to reason about";
  }

  // Expansion with tests — positive reinforcement
  if (topVector === "expansion" && hasTests) {
    return "new code with tests — solid session";
  }

  // Surgical precision
  if (topVector === "surgical" && records.length <= 3) {
    return "small, precise change — low risk";
  }

  // Default: gentle forward nudge
  if (conf >= 0.85) {
    return "clean session — good to commit";
  }

  return null; // no nudge if nothing stands out
}

// ============================================================================
// 7. SESSION COMPARISON — "how does today compare to my last 5?"
// ============================================================================

/**
 * Compare current trace against last N sessions in history.
 * Returns a compact comparison object and a one-line summary.
 *
 * @param {object} history - Accumulated history (must have confidenceTrend with shape data)
 * @param {object} trace   - Current run trace (enriched with session shape)
 * @param {number} [n=5]   - How many recent sessions to compare against
 * @returns {{ summary: string, details: object }}
 */
export function compareToRecent(history, trace, n = 5) {
  const recent = (history.confidenceTrend || []).slice(-(n + 1), -1); // exclude current
  if (recent.length < 1) return { summary: "", details: { hasHistory: false } };

  const details = {
    hasHistory: true,
    sessionsCompared: recent.length,
    size: "similar",
    spread: "similar",
    areas: "same",
    novelDirs: [],
  };

  const parts = [];

  // Size comparison: file count
  const avgFiles = avg(recent.map(r => r.files || 0));
  const ratio = avgFiles > 0 ? trace.fileCount / avgFiles : 1;
  if (ratio > 1.5) { details.size = "bigger"; parts.push(`${ratio.toFixed(1)}x bigger`); }
  else if (ratio < 0.6) { details.size = "smaller"; parts.push(`${(1 / ratio).toFixed(1)}x smaller`); }

  // Spread comparison: dir count
  const avgDirs = avg(recent.map(r => r.dirCount || 1));
  const dirRatio = avgDirs > 0 ? trace.dirCount / avgDirs : 1;
  if (dirRatio > 1.5) { details.spread = "wider"; parts.push("wider spread"); }
  else if (dirRatio < 0.6) { details.spread = "narrower"; parts.push("more focused"); }

  // Area novelty: are these the same dirs as recent sessions?
  const recentDirs = new Set();
  recent.forEach(r => (r.dirs || []).forEach(d => recentDirs.add(d)));
  const novelDirs = (trace.dirs || []).filter(d => !recentDirs.has(d));
  if (novelDirs.length > 0) {
    details.areas = "new";
    details.novelDirs = novelDirs;
    if (novelDirs.length <= 2) parts.push(`new: ${novelDirs.join(", ")}`);
    else parts.push(`${novelDirs.length} new areas`);
  }

  // Vector shift: is the dominant vector different from recent norm?
  const recentVectors = {};
  recent.forEach(r => {
    for (const [v, c] of Object.entries(r.vectorMix || {})) {
      recentVectors[v] = (recentVectors[v] || 0) + c;
    }
  });
  const recentTopVector = topKey(recentVectors);
  const currentTopVector = topKey(trace.vectorMix || {});
  if (recentTopVector && currentTopVector && recentTopVector !== currentTopVector) {
    parts.push(`shifted to ${currentTopVector}`);
  }

  // Confidence delta
  const avgConf = avg(recent.map(r => r.overall || 0));
  const confDelta = trace.confidence - avgConf;
  if (Math.abs(confDelta) > 0.05) {
    const arrow = confDelta > 0 ? "+" : "";
    parts.push(`${arrow}${(confDelta * 100).toFixed(0)}% confidence`);
  }

  const summary = parts.length > 0
    ? `vs last ${recent.length}: ${parts.join(", ")}`
    : `vs last ${recent.length}: similar session`;

  return { summary, details };
}

// ============================================================================
// Helpers
// ============================================================================

function buildVectorMix(records) {
  const mix = {};
  records.forEach(r => (r.vectors || []).forEach(v => { mix[v] = (mix[v] || 0) + 1; }));
  return mix;
}

function avg(arr) {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function topKey(obj) {
  let best = null, bestV = -1;
  for (const [k, v] of Object.entries(obj || {})) {
    if (v > bestV) { best = k; bestV = v; }
  }
  return best;
}

/**
 * PATH System — Condition-driven session analysis with weighted accumulation.
 *
 * Architecture:
 *   Grammar:  Weighted accumulation (since + since → thus)
 *   Priority: Historical signals (compared to what)
 *   Depth:    3-level stack: File → Directory → Project
 *
 * A PATH definition is a named rule with:
 *   - signals: array of { fn, args, weight } — each signal function
 *     evaluates one aspect and contributes weight if matched
 *   - threshold: minimum accumulated weight to activate the PATH
 *   - nudge: template string with {variable} interpolation
 *   - priority: tie-breaking when multiple PATHs activate (higher wins)
 *
 * Signal functions are organized in 3 layers + 2 supplements:
 *   Layer 1 — File-level history    (hot_file, cooling_file, churn_accelerating, ...)
 *   Layer 2 — Directory-level history (home_turf, new_territory, abandoned_zone, ...)
 *   Layer 3 — Project-level history  (deep_stint, project_hopping, returning_after_absence, ...)
 *   Shape   — Session shape signals  (is_deep, is_scattered, vector_dominant, ...)
 *   Risk    — Risk signals           (no_tests, high_concentration, low_confidence, ...)
 */

import { readFileSync, writeFileSync } from "node:fs";

// ============================================================================
// 1. SIGNAL FUNCTIONS — the atoms of PATH evaluation
// ============================================================================

/**
 * Each signal function receives:
 *   @param {object} ctx - Evaluation context
 *     ctx.records    - Current session file records
 *     ctx.result     - Pipeline output
 *     ctx.trace      - Current trace (enriched with session shape)
 *     ctx.history    - Accumulated history
 *     ctx.comparison - From compareToRecent
 *     ctx.refinement - From refineRun
 *   @param {object} args - Signal-specific arguments
 * Returns:
 *   { matched: boolean, value: any, reason: string }
 */

const SIGNAL_FUNCTIONS = new Map();

function registerSignal(name, layer, fn) {
  SIGNAL_FUNCTIONS.set(name, { name, layer, fn });
}

// ---------------------------------------------------------------------------
// Layer 1: File-level history
// ---------------------------------------------------------------------------

registerSignal("hot_file", "file", (ctx, args) => {
  const minAppearances = args.min_appearances || 3;
  const fileIndex = ctx.history?.fileIndex || {};
  const hotFiles = ctx.records.filter(r => {
    const idx = fileIndex[r.path];
    return idx && idx.appearances >= minAppearances;
  });
  return {
    matched: hotFiles.length > 0,
    value: hotFiles.length,
    reason: hotFiles.length > 0
      ? `${hotFiles.length} hot file${hotFiles.length > 1 ? "s" : ""} (${hotFiles.slice(0, 3).map(f => f.name).join(", ")})`
      : "no hot files in this session",
    payload: { files: hotFiles.map(f => f.name) },
  };
});

registerSignal("cooling_file", "file", (ctx, args) => {
  const maxAppearances = args.max_appearances || 1;
  const fileIndex = ctx.history?.fileIndex || {};
  const cooling = ctx.records.filter(r => {
    const idx = fileIndex[r.path];
    return idx && idx.appearances <= maxAppearances && idx.totalChurn > 0;
  });
  return {
    matched: cooling.length > 0,
    value: cooling.length,
    reason: cooling.length > 0
      ? `${cooling.length} file${cooling.length > 1 ? "s" : ""} cooling down (rarely touched)`
      : "no cooling files",
  };
});

registerSignal("churn_accelerating", "file", (ctx, args) => {
  const threshold = args.churn_ratio || 1.5;
  const fileIndex = ctx.history?.fileIndex || {};
  const accelerating = ctx.records.filter(r => {
    const idx = fileIndex[r.path];
    if (!idx || idx.appearances < 2) return false;
    const avgChurn = idx.totalChurn / idx.appearances;
    return r.churn > avgChurn * threshold;
  });
  return {
    matched: accelerating.length > 0,
    value: accelerating.length,
    reason: accelerating.length > 0
      ? `${accelerating.length} file${accelerating.length > 1 ? "s" : ""} with accelerating churn (${accelerating.slice(0, 2).map(f => f.name).join(", ")})`
      : "churn is stable across files",
    payload: { files: accelerating.map(f => f.name) },
  };
});

registerSignal("consecutive_file", "file", (ctx, args) => {
  const minConsecutive = args.min_consecutive || 3;
  const trend = ctx.history?.confidenceTrend || [];
  const recentN = trend.slice(-minConsecutive);
  if (recentN.length < minConsecutive) return { matched: false, value: 0, reason: "not enough history" };

  const currentFiles = new Set(ctx.records.map(r => r.path));
  const fileStreaks = {};
  for (const file of currentFiles) {
    let streak = 1;
    for (let i = recentN.length - 1; i >= 0; i--) {
      const sessionFiles = (recentN[i].files_list || []);
      if (sessionFiles.includes(file)) streak++;
      else break;
    }
    if (streak >= minConsecutive) fileStreaks[file] = streak;
  }

  const streakFiles = Object.keys(fileStreaks);
  return {
    matched: streakFiles.length > 0,
    value: streakFiles.length,
    reason: streakFiles.length > 0
      ? `${streakFiles.length} file${streakFiles.length > 1 ? "s" : ""} in ${Object.values(fileStreaks)[0]}+ consecutive sessions`
      : "no consecutive file streaks",
    payload: { streaks: fileStreaks },
  };
});

registerSignal("file_vector_shift", "file", (ctx, args) => {
  const fileIndex = ctx.history?.fileIndex || {};
  const shifted = ctx.records.filter(r => {
    const idx = fileIndex[r.path];
    if (!idx || !idx.vectors) return false;
    const historicalTop = topKey(idx.vectors);
    return historicalTop && r.vector && historicalTop !== r.vector;
  });
  return {
    matched: shifted.length > 0,
    value: shifted.length,
    reason: shifted.length > 0
      ? `${shifted.length} file${shifted.length > 1 ? "s" : ""} shifted vector (e.g. ${shifted[0]?.name}: was ${topKey(fileIndex[shifted[0]?.path]?.vectors)}, now ${shifted[0]?.vector})`
      : "file vectors are consistent with history",
    payload: { files: shifted.map(f => ({ name: f.name, current: f.vector, historical: topKey(fileIndex[f.path]?.vectors) })) },
  };
});

// ---------------------------------------------------------------------------
// Layer 2: Directory-level history
// ---------------------------------------------------------------------------

registerSignal("home_turf", "directory", (ctx, args) => {
  const minSessions = args.min_sessions || 5;
  const trend = ctx.history?.confidenceTrend || [];
  const dirCounts = {};
  trend.forEach(t => (t.dirs || []).forEach(d => { dirCounts[d] = (dirCounts[d] || 0) + 1; }));

  const currentDirs = [...new Set(ctx.records.map(r => r.directory))];
  const familiar = currentDirs.filter(d => (dirCounts[d] || 0) >= minSessions);
  return {
    matched: familiar.length > 0,
    value: familiar.length,
    reason: familiar.length > 0
      ? `${familiar.length} dir${familiar.length > 1 ? "s" : ""} are home turf (${familiar.slice(0, 3).join(", ")})`
      : "no familiar directories",
    payload: { dirs: familiar },
  };
});

registerSignal("new_territory", "directory", (ctx, args) => {
  const trend = ctx.history?.confidenceTrend || [];
  const allHistoricalDirs = new Set();
  trend.forEach(t => (t.dirs || []).forEach(d => allHistoricalDirs.add(d)));

  const currentDirs = [...new Set(ctx.records.map(r => r.directory))];
  const novel = currentDirs.filter(d => !allHistoricalDirs.has(d));
  return {
    matched: novel.length > 0,
    value: novel.length,
    reason: novel.length > 0
      ? `${novel.length} new area${novel.length > 1 ? "s" : ""} (${novel.slice(0, 3).join(", ")})`
      : "all areas previously visited",
    payload: { dirs: novel },
  };
});

registerSignal("abandoned_zone", "directory", (ctx, args) => {
  const staleThreshold = args.sessions_since || 10;
  const trend = ctx.history?.confidenceTrend || [];
  const currentDirs = [...new Set(ctx.records.map(r => r.directory))];

  const returning = currentDirs.filter(d => {
    let lastSeen = -1;
    for (let i = trend.length - 1; i >= 0; i--) {
      if ((trend[i].dirs || []).includes(d)) { lastSeen = trend.length - i; break; }
    }
    return lastSeen >= staleThreshold;
  });
  return {
    matched: returning.length > 0,
    value: returning.length,
    reason: returning.length > 0
      ? `returning to ${returning.length} abandoned area${returning.length > 1 ? "s" : ""} (${returning.join(", ")})`
      : "no abandoned zones revisited",
    payload: { dirs: returning },
  };
});

registerSignal("dir_vector_shift", "directory", (ctx, args) => {
  const trend = ctx.history?.confidenceTrend || [];
  const recentN = args.recent || 5;
  const recent = trend.slice(-recentN);

  const historicalDirVectors = {};
  recent.forEach(t => {
    for (const [v, c] of Object.entries(t.vectorMix || {})) {
      (t.dirs || []).forEach(d => {
        if (!historicalDirVectors[d]) historicalDirVectors[d] = {};
        historicalDirVectors[d][v] = (historicalDirVectors[d][v] || 0) + c;
      });
    }
  });

  const currentDirVectors = {};
  ctx.records.forEach(r => {
    if (!currentDirVectors[r.directory]) currentDirVectors[r.directory] = {};
    (r.vectors || []).forEach(v => {
      currentDirVectors[r.directory][v] = (currentDirVectors[r.directory][v] || 0) + 1;
    });
  });

  const shifted = Object.keys(currentDirVectors).filter(d => {
    const histTop = topKey(historicalDirVectors[d]);
    const currTop = topKey(currentDirVectors[d]);
    return histTop && currTop && histTop !== currTop;
  });

  return {
    matched: shifted.length > 0,
    value: shifted.length,
    reason: shifted.length > 0
      ? `${shifted.length} dir${shifted.length > 1 ? "s" : ""} shifted work type`
      : "directory work types are consistent",
  };
});

// ---------------------------------------------------------------------------
// Layer 3: Project-level history
// ---------------------------------------------------------------------------

registerSignal("deep_stint", "project", (ctx, args) => {
  const minConsecutive = args.min_consecutive || 3;
  const trend = ctx.history?.confidenceTrend || [];
  const recentN = trend.slice(-(minConsecutive + 1));

  // Infer project from dirs
  const currentProject = inferProject(ctx.records.map(r => r.directory));
  if (!currentProject) return { matched: false, value: 0, reason: "project could not be inferred" };

  let consecutiveInProject = 0;
  for (let i = recentN.length - 1; i >= 0; i--) {
    const sessionProject = inferProject(recentN[i].dirs || []);
    if (sessionProject === currentProject) consecutiveInProject++;
    else break;
  }

  return {
    matched: consecutiveInProject >= minConsecutive,
    value: consecutiveInProject,
    reason: consecutiveInProject >= minConsecutive
      ? `${consecutiveInProject + 1} consecutive sessions in ${currentProject}`
      : `session ${consecutiveInProject + 1} in ${currentProject}`,
    payload: { project: currentProject, consecutive: consecutiveInProject + 1 },
  };
});

registerSignal("project_hopping", "project", (ctx, args) => {
  const windowSize = args.window || 5;
  const minProjects = args.min_projects || 3;
  const trend = ctx.history?.confidenceTrend || [];
  const recentN = trend.slice(-windowSize);

  const projects = new Set();
  recentN.forEach(t => {
    const p = inferProject(t.dirs || []);
    if (p) projects.add(p);
  });
  const currentProject = inferProject(ctx.records.map(r => r.directory));
  if (currentProject) projects.add(currentProject);

  return {
    matched: projects.size >= minProjects,
    value: projects.size,
    reason: projects.size >= minProjects
      ? `${projects.size} different projects in last ${windowSize} sessions (${[...projects].join(", ")})`
      : `staying focused: ${projects.size} project${projects.size > 1 ? "s" : ""} in last ${windowSize} sessions`,
    payload: { projects: [...projects] },
  };
});

registerSignal("returning_after_absence", "project", (ctx, args) => {
  const minAbsence = args.min_absence || 5;
  const trend = ctx.history?.confidenceTrend || [];
  const currentProject = inferProject(ctx.records.map(r => r.directory));
  if (!currentProject) return { matched: false, value: 0, reason: "project could not be inferred" };

  let sessionsSinceLast = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    const p = inferProject(trend[i].dirs || []);
    if (p === currentProject) break;
    sessionsSinceLast++;
  }

  return {
    matched: sessionsSinceLast >= minAbsence,
    value: sessionsSinceLast,
    reason: sessionsSinceLast >= minAbsence
      ? `returning to ${currentProject} after ${sessionsSinceLast} sessions away`
      : `${currentProject} is recent (${sessionsSinceLast} sessions since last visit)`,
    payload: { project: currentProject, absence: sessionsSinceLast },
  };
});

// ---------------------------------------------------------------------------
// Shape signals (supplement)
// ---------------------------------------------------------------------------

registerSignal("is_deep", "shape", (ctx, args) => {
  const maxDirs = args.max_dirs || 2;
  const minFiles = args.min_files || 3;
  const dirs = [...new Set(ctx.records.map(r => r.directory))];
  const deep = dirs.length <= maxDirs && ctx.records.length >= minFiles;
  return {
    matched: deep,
    value: dirs.length,
    reason: deep ? `deep session: ${ctx.records.length} files in ${dirs.length} dir${dirs.length > 1 ? "s" : ""}` : "not a deep session",
  };
});

registerSignal("is_scattered", "shape", (ctx, args) => {
  const minDirs = args.min_dirs || 5;
  const dirs = [...new Set(ctx.records.map(r => r.directory))];
  return {
    matched: dirs.length >= minDirs,
    value: dirs.length,
    reason: dirs.length >= minDirs ? `scattered across ${dirs.length} directories` : `focused: ${dirs.length} directories`,
  };
});

registerSignal("vector_dominant", "shape", (ctx, args) => {
  const target = args.vector;
  const minRatio = args.min_ratio || 0.5;
  const vectorCounts = {};
  ctx.records.forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const total = Object.values(vectorCounts).reduce((s, v) => s + v, 0) || 1;
  const targetCount = vectorCounts[target] || 0;
  const ratio = targetCount / total;
  return {
    matched: ratio >= minRatio,
    value: ratio,
    reason: ratio >= minRatio ? `${target} is dominant (${(ratio * 100).toFixed(0)}% of vectors)` : `${target} is ${(ratio * 100).toFixed(0)}% of vectors`,
  };
});

registerSignal("session_size", "shape", (ctx, args) => {
  const op = args.op || "gte";
  const threshold = args.files || 10;
  const count = ctx.records.length;
  const matched = op === "gte" ? count >= threshold : op === "lte" ? count <= threshold : count === threshold;
  return {
    matched,
    value: count,
    reason: `${count} files (threshold: ${op} ${threshold})`,
  };
});

registerSignal("add_delete_ratio", "shape", (ctx, args) => {
  const op = args.op || "gte";
  const threshold = args.ratio || 3;
  const adds = ctx.records.reduce((s, r) => s + (r.additions || 0), 0);
  const dels = ctx.records.reduce((s, r) => s + (r.deletions || 0), 0) || 1;
  const ratio = adds / dels;
  const matched = op === "gte" ? ratio >= threshold : ratio <= threshold;
  return {
    matched,
    value: ratio,
    reason: `add/delete ratio: ${ratio.toFixed(1)} (${adds} adds, ${dels} dels)`,
  };
});

// ---------------------------------------------------------------------------
// Risk signals (supplement)
// ---------------------------------------------------------------------------

registerSignal("no_tests", "risk", (ctx) => {
  const hasTests = ctx.records.some(r => /test|spec/i.test(r.path));
  return {
    matched: !hasTests,
    value: !hasTests,
    reason: hasTests ? "tests present in diff" : "no test files in this diff",
  };
});

registerSignal("has_tests", "risk", (ctx) => {
  const hasTests = ctx.records.some(r => /test|spec/i.test(r.path));
  return {
    matched: hasTests,
    value: hasTests,
    reason: hasTests ? "tests present in diff" : "no test files in this diff",
  };
});

registerSignal("high_concentration", "risk", (ctx, args) => {
  const threshold = args.churn_pct || 0.6;
  const totalChurn = ctx.records.reduce((s, r) => s + (r.churn || 0), 0) || 1;
  const max = ctx.records.reduce((best, r) => r.churn > (best?.churn || 0) ? r : best, null);
  const ratio = max ? max.churn / totalChurn : 0;
  return {
    matched: ratio >= threshold && ctx.records.length > 3,
    value: ratio,
    reason: ratio >= threshold && ctx.records.length > 3
      ? `${max.name} holds ${(ratio * 100).toFixed(0)}% of total churn`
      : "churn is distributed",
    payload: max ? { file: max.name, ratio } : {},
  };
});

registerSignal("low_confidence", "risk", (ctx, args) => {
  const threshold = args.max_confidence || 0.7;
  const conf = ctx.result?.confidenceReport?.overallScore || 0;
  return {
    matched: conf < threshold,
    value: conf,
    reason: conf < threshold
      ? `confidence is low (${(conf * 100).toFixed(0)}%)`
      : `confidence is ${(conf * 100).toFixed(0)}%`,
  };
});

registerSignal("confidence_trending", "risk", (ctx, args) => {
  const direction = args.direction || "down";
  const delta = ctx.refinement?.confidenceDelta || 0;
  const matched = direction === "down" ? delta < -0.05 : delta > 0.05;
  return {
    matched,
    value: delta,
    reason: matched
      ? `confidence trending ${direction} (${(delta * 100).toFixed(1)}% vs baseline)`
      : `confidence is stable (${(delta * 100).toFixed(1)}% vs baseline)`,
  };
});

registerSignal("mixed_vectors", "risk", (ctx, args) => {
  const minTypes = args.min_types || 4;
  const vectorCounts = {};
  ctx.records.forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const types = Object.keys(vectorCounts).length;
  return {
    matched: types >= minTypes,
    value: types,
    reason: types >= minTypes
      ? `${types} different vector types — mixed session`
      : `${types} vector types`,
  };
});

registerSignal("config_blast", "risk", (ctx) => {
  // Only match files that ARE config files by extension, not source files named "config"
  const configExts = /\.(json|yaml|yml|toml|env|ini|cfg|conf)$/i;
  const configFiles = ctx.records.filter(r => configExts.test(r.path));
  const configRatio = configFiles.length / (ctx.records.length || 1);
  const isConfigDominated = configRatio >= 0.5 && configFiles.length >= 1;
  const smallSession = ctx.records.length <= 4;
  return {
    matched: isConfigDominated && smallSession,
    value: configFiles.length,
    reason: isConfigDominated && smallSession
      ? `config-dominated session (${configFiles.length}/${ctx.records.length} files are config)`
      : "not a config-dominated session",
    payload: { configFiles: configFiles.map(f => f.name), ratio: configRatio },
  };
});

// ============================================================================
// 2. PATH DEFINITION SCHEMA
// ============================================================================

/**
 * PATH definition:
 * {
 *   id:        string,         // unique identifier
 *   name:      string,         // human-readable name
 *   signals:   Array<{         // weighted signal evaluations
 *     fn:      string,         //   signal function name
 *     args:    object,         //   arguments to pass
 *     weight:  number,         //   weight if matched (+/-)
 *   }>,
 *   threshold: number,         // minimum accumulated weight to activate
 *   nudge:     string,         // template with {variable} interpolation
 *   priority:  number,         // tie-breaking (higher wins)
 * }
 */

// ============================================================================
// 3. PATH EVALUATOR — weighted accumulation engine
// ============================================================================

/**
 * Evaluate a single PATH definition against the current session context.
 *
 * @param {object} pathDef - PATH definition
 * @param {object} ctx     - Evaluation context
 * @returns {{ activated: boolean, score: number, evidence: Array, nudge: string }}
 */
export function evaluatePath(pathDef, ctx) {
  let totalWeight = 0;
  const evidence = [];
  const vars = {};

  for (const signal of pathDef.signals) {
    const fn = SIGNAL_FUNCTIONS.get(signal.fn);
    if (!fn) {
      evidence.push({ fn: signal.fn, matched: false, reason: `unknown signal: ${signal.fn}` });
      continue;
    }

    const result = fn.fn(ctx, signal.args || {});
    evidence.push({
      fn: signal.fn,
      layer: fn.layer,
      matched: result.matched,
      value: result.value,
      weight: result.matched ? signal.weight : 0,
      reason: result.reason,
    });

    if (result.matched) {
      totalWeight += signal.weight;
      // Collect template variables from payload and reason
      vars[signal.fn] = result.value;
      if (result.payload) {
        for (const [k, v] of Object.entries(result.payload)) {
          vars[`${signal.fn}_${k}`] = v;
        }
      }
      vars[`${signal.fn}_reason`] = result.reason;
    }
  }

  const activated = totalWeight >= pathDef.threshold;
  let nudge = "";
  if (activated) {
    nudge = interpolateNudge(pathDef.nudge, vars, ctx);
  }

  return { activated, score: totalWeight, evidence, nudge, pathId: pathDef.id };
}

/**
 * Evaluate ALL PATH definitions against the session context.
 * Returns the single best-matching PATH (highest score above threshold).
 *
 * @param {Array} paths - Array of PATH definitions
 * @param {object} ctx  - Evaluation context
 * @returns {{ winner: object|null, all: Array }}
 */
export function evaluateAllPaths(paths, ctx) {
  const results = paths.map(p => evaluatePath(p, ctx));
  const activated = results.filter(r => r.activated);

  // Sort by score descending, then priority descending
  activated.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    const pA = paths.find(p => p.id === a.pathId)?.priority || 0;
    const pB = paths.find(p => p.id === b.pathId)?.priority || 0;
    return pB - pA;
  });

  return {
    winner: activated[0] || null,
    all: results,
  };
}

// ============================================================================
// 4. BUILTIN PATH DEFINITIONS — converted from hardcoded nudge rules
// ============================================================================

export function getBuiltinPaths() {
  return [
    {
      id: "scattered-expansion-no-tests-novel",
      name: "Wide expansion into new untested areas",
      signals: [
        { fn: "is_scattered",      args: { min_dirs: 5 },        weight: 2 },
        { fn: "vector_dominant",   args: { vector: "expansion", min_ratio: 0.4 }, weight: 3 },
        { fn: "no_tests",          args: {},                      weight: 2 },
        { fn: "new_territory",     args: {},                      weight: 2 },
      ],
      threshold: 7,
      nudge: "wide expansion into {new_territory} new areas with no tests — integration risk is high",
      priority: 100,
    },
    {
      id: "heavy-expansion-no-tests",
      name: "Heavy expansion without tests",
      signals: [
        { fn: "vector_dominant",   args: { vector: "expansion", min_ratio: 0.4 }, weight: 3 },
        { fn: "add_delete_ratio",  args: { op: "gte", ratio: 3 }, weight: 2 },
        { fn: "no_tests",          args: {},                      weight: 3 },
      ],
      threshold: 6,
      nudge: "lots of new code, no tests in this diff — consider a test pass next",
      priority: 90,
    },
    {
      id: "scattered-low-confidence",
      name: "Scattered changes with low confidence",
      signals: [
        { fn: "is_scattered",      args: { min_dirs: 5 },        weight: 3 },
        { fn: "low_confidence",    args: { max_confidence: 0.7 }, weight: 3 },
      ],
      threshold: 5,
      nudge: "changes are spread thin and confidence is low — might be worth consolidating focus",
      priority: 85,
    },
    {
      id: "cleanup-removal",
      name: "Cleanup/removal session",
      signals: [
        { fn: "vector_dominant",   args: { vector: "removal", min_ratio: 0.5 }, weight: 3 },
        { fn: "add_delete_ratio",  args: { op: "lte", ratio: 0.33 }, weight: 3 },
      ],
      threshold: 5,
      nudge: "cleanup session — verify nothing downstream depends on what was removed",
      priority: 80,
    },
    {
      id: "deep-refactor",
      name: "Deep refactor in focused area",
      signals: [
        { fn: "is_deep",           args: { max_dirs: 2, min_files: 3 }, weight: 3 },
        { fn: "vector_dominant",   args: { vector: "refactor", min_ratio: 0.4 }, weight: 3 },
        { fn: "home_turf",         args: { min_sessions: 3 },    weight: 1 },
      ],
      threshold: 5,
      nudge: "deep refactor in familiar territory — run existing tests before moving on",
      priority: 75,
    },
    {
      id: "deep-refactor-hot-file",
      name: "Deep refactor with hot file churn accumulation",
      signals: [
        { fn: "is_deep",             args: { max_dirs: 2, min_files: 3 }, weight: 2 },
        { fn: "vector_dominant",     args: { vector: "refactor", min_ratio: 0.4 }, weight: 2 },
        { fn: "hot_file",            args: { min_appearances: 3 }, weight: 2 },
        { fn: "churn_accelerating",  args: { churn_ratio: 1.5 },  weight: 2 },
      ],
      threshold: 6,
      nudge: "sustained refactor with {hot_file} hot file(s) under accelerating churn — {churn_accelerating_reason}",
      priority: 78,
    },
    {
      id: "config-blast",
      name: "Config-only changes with blast radius",
      signals: [
        { fn: "config_blast",      args: {},                      weight: 4 },
        { fn: "no_tests",          args: {},                      weight: 2 },
      ],
      threshold: 4,
      nudge: "config changes can have wide blast radius — quick smoke test recommended",
      priority: 70,
    },
    {
      id: "novel-areas-stale-assumptions",
      name: "Working in novel or abandoned areas",
      signals: [
        { fn: "new_territory",     args: {},                      weight: 3 },
        { fn: "abandoned_zone",    args: { sessions_since: 8 },   weight: 3 },
      ],
      threshold: 3,
      nudge: "touching areas you haven't been in recently — check for stale assumptions",
      priority: 65,
    },
    {
      id: "returning-after-absence",
      name: "Returning to a project after absence",
      signals: [
        { fn: "returning_after_absence", args: { min_absence: 5 }, weight: 4 },
        { fn: "file_vector_shift",       args: {},                 weight: 2 },
      ],
      threshold: 4,
      nudge: "returning to {returning_after_absence_reason} — context may have drifted, review recent changes first",
      priority: 68,
    },
    {
      id: "high-churn-concentration",
      name: "Single file holds most of the churn",
      signals: [
        { fn: "high_concentration", args: { churn_pct: 0.6 },    weight: 4 },
        { fn: "session_size",       args: { op: "gte", files: 4 }, weight: 2 },
      ],
      threshold: 5,
      nudge: "{high_concentration_reason} — might be doing too much in one file",
      priority: 60,
    },
    {
      id: "mixed-vectors",
      name: "Mixed change types in one session",
      signals: [
        { fn: "mixed_vectors",     args: { min_types: 4 },       weight: 4 },
      ],
      threshold: 4,
      nudge: "mixed change types in one session — consider splitting into focused commits",
      priority: 55,
    },
    {
      id: "confidence-dropping",
      name: "Confidence dropping vs baseline",
      signals: [
        { fn: "confidence_trending", args: { direction: "down" }, weight: 4 },
      ],
      threshold: 4,
      nudge: "confidence dropped vs your recent baseline — this diff may be harder to reason about",
      priority: 50,
    },
    {
      id: "deep-stint-project",
      name: "Deep project stint",
      signals: [
        { fn: "deep_stint",        args: { min_consecutive: 4 },  weight: 2 },
        { fn: "has_tests",         args: {},                      weight: 2 },
        { fn: "home_turf",         args: { min_sessions: 5 },    weight: 1 },
      ],
      threshold: 4,
      nudge: "{deep_stint_reason} with tests — solid sustained work",
      priority: 45,
    },
    {
      id: "expansion-with-tests",
      name: "Expansion with tests — positive",
      signals: [
        { fn: "vector_dominant",   args: { vector: "expansion", min_ratio: 0.4 }, weight: 3 },
        { fn: "has_tests",         args: {},                      weight: 3 },
      ],
      threshold: 5,
      nudge: "new code with tests — solid session",
      priority: 40,
    },
    {
      id: "surgical-precision",
      name: "Small, precise surgical change",
      signals: [
        { fn: "vector_dominant",   args: { vector: "surgical", min_ratio: 0.5 }, weight: 3 },
        { fn: "session_size",       args: { op: "lte", files: 3 }, weight: 3 },
      ],
      threshold: 5,
      nudge: "small, precise change — low risk",
      priority: 35,
    },
    {
      id: "project-hopping",
      name: "Hopping between projects",
      signals: [
        { fn: "project_hopping",   args: { window: 5, min_projects: 3 }, weight: 4 },
      ],
      threshold: 4,
      nudge: "{project_hopping_reason} — context switching has a cost, consider deeper stints",
      priority: 48,
    },
    {
      id: "clean-session",
      name: "Clean session — good to commit",
      signals: [
        { fn: "low_confidence",    args: { max_confidence: 0.85 }, weight: -3 },
        { fn: "no_tests",          args: {},                      weight: -1 },
        { fn: "mixed_vectors",     args: { min_types: 4 },       weight: -2 },
      ],
      threshold: 0,
      nudge: "clean session — good to commit",
      priority: 10,
    },
  ];
}

// ============================================================================
// 5. PERSISTENCE — serialize/load PATH definitions
// ============================================================================

const DEFAULT_PATHS_FILE = ".glimpse-paths.json";

export function loadPaths(filePath) {
  const p = filePath || DEFAULT_PATHS_FILE;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function savePaths(paths, filePath) {
  const p = filePath || DEFAULT_PATHS_FILE;
  writeFileSync(p, JSON.stringify(paths, null, 2), "utf-8");
}

/**
 * Merge custom PATH definitions with builtins.
 * Custom paths override builtins with the same ID.
 */
export function mergePaths(builtins, custom) {
  const merged = new Map();
  for (const p of builtins) merged.set(p.id, p);
  for (const p of (custom || [])) merged.set(p.id, p);
  return [...merged.values()];
}

// ============================================================================
// 6. INTEGRATION — build evaluation context, run PATH system
// ============================================================================

/**
 * Build the evaluation context from pipeline data.
 * This is the single object passed to all signal functions.
 */
export function buildPathContext(records, result, trace, history, comparison, refinement) {
  return { records, result, trace, history, comparison, refinement };
}

/**
 * Run the full PATH evaluation: build context, load definitions, evaluate, return winner.
 *
 * @param {object} ctx         - From buildPathContext
 * @param {object} [opts]      - { pathsFile, customPaths }
 * @returns {{ nudge: string, pathId: string, score: number, evidence: Array, all: Array }}
 */
export function runPaths(ctx, opts = {}) {
  const builtins = getBuiltinPaths();
  const custom = opts.customPaths || loadPaths(opts.pathsFile) || [];
  const allPaths = mergePaths(builtins, custom);

  const { winner, all } = evaluateAllPaths(allPaths, ctx);

  return {
    nudge: winner?.nudge || null,
    pathId: winner?.pathId || null,
    score: winner?.score || 0,
    evidence: winner?.evidence || [],
    all,
  };
}

/**
 * Get the list of all registered signal functions and their layers.
 */
export function getSignalInventory() {
  return [...SIGNAL_FUNCTIONS.entries()].map(([name, { layer }]) => ({ name, layer }));
}

// ============================================================================
// Helpers
// ============================================================================

function topKey(obj) {
  let best = null, bestV = -1;
  for (const [k, v] of Object.entries(obj || {})) {
    if (v > bestV) { best = k; bestV = v; }
  }
  return best;
}

/**
 * Infer project name from a list of directories.
 * Maps directory prefixes to known project names.
 */
function inferProject(dirs) {
  const projectPrefixes = [
    { prefix: "glimpse-engine", project: "glimpse-engine" },
    { prefix: "apiguard", project: "apiguard" },
    { prefix: "GRID-main", project: "GRID-main" },
    { prefix: "afloat-server", project: "afloat-server" },
    { prefix: "echoes-server", project: "echoes-server" },
    { prefix: "grid-server", project: "grid-server" },
    { prefix: "lots-server", project: "lots-server" },
    { prefix: "maintain-server", project: "maintain-server" },
    { prefix: "pulse-server", project: "pulse-server" },
    { prefix: "seeds-server", project: "seeds-server" },
    { prefix: "mcp-tool-experiment", project: "mcp-tool-experiment" },
    { prefix: "glimpse-artifact", project: "glimpse-artifact" },
    { prefix: "shared-types", project: "shared-types" },
  ];

  const counts = {};
  for (const d of dirs) {
    for (const { prefix, project } of projectPrefixes) {
      if (d === prefix || d.startsWith(prefix + "/") || d.startsWith(prefix + "\\")) {
        counts[project] = (counts[project] || 0) + 1;
      }
    }
  }

  return topKey(counts) || (dirs.length > 0 ? "workspace-root" : null);
}

/**
 * Interpolate a nudge template with variables from signal evaluation.
 * {variable_name} is replaced with the value from vars map.
 */
function interpolateNudge(template, vars, ctx) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (vars[key] !== undefined) {
      const v = vars[key];
      return Array.isArray(v) ? v.join(", ") : String(v);
    }
    return match; // leave unreplaced if not found
  });
}

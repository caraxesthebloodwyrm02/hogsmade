// core/runner.js — the orchestrator
// Takes data + config → runs the full glimpse flow → returns everything.
// This is the single function that every entry point calls.

import {
  runContextPipeline,
  learnFromRun,
  buildSessionRecap,
  runPaths,
  buildPathContext,
  assessCalibrationNeed,
  selectQuestions,
  scoreInterview,
  parseCSV
} from './engine.js';

/**
 * Run a complete glimpse session.
 *
 * @param {object} params
 * @param {Array|string} params.data - Raw data (JSON array or CSV string)
 * @param {string} params.format - 'json' or 'csv'
 * @param {object} params.config - Pipeline config (lenses, rules, etc.)
 * @param {object} params.meta - Session metadata { source, trigger }
 * @param {object} [params.opts] - Options { historyPath, tracePath, interview, answers }
 * @returns {object} Complete session result
 */
export function runGlimpse(params) {
  const { data, format = 'json', config, meta = {}, opts = {} } = params;

  // Parse CSV if needed
  const records = format === 'csv' && typeof data === 'string'
    ? parseCSV(data)
    : data;

  // 1. Run core pipeline
  const result = runContextPipeline(records, format, config);

  // 2. Learning cycle
  const learning = learnFromRun(records, result, config, {
    source: meta.source || 'glimpse',
    trigger: meta.trigger || 'manual'
  }, {
    historyPath: opts.historyPath || null,
    tracesPath: opts.tracesPath || null
  });

  // 3. PATH evaluation
  // Normalize records for PATH system — it expects { path, directory, vectors, ... }
  // but scenario data may have different shapes
  const pathRecords = records.map(r => ({
    path: r.path || r.name || r.task || r.person || r.activity || 'unknown',
    name: r.name || r.task || r.person || r.activity || r.path || 'unknown',
    directory: r.directory || r.domain || r.category || r.type || 'root',
    vectors: r.vectors || (r.tags ? [r.status || r.mood || r.priority || 'data'].filter(Boolean) : []),
    churn: r.churn || 0,
    additions: r.additions || 0,
    deletions: r.deletions || 0,
    ...r
  }));

  const pathCtx = buildPathContext(
    pathRecords, result, learning.trace, learning.history,
    learning.comparison, learning.refinement
  );

  let pathResult;
  try {
    pathResult = runPaths(pathCtx);
  } catch {
    // PATH system may fail on non-code data — degrade gracefully
    pathResult = { nudge: null, pathId: null, score: 0, evidence: [], all: [] };
  }

  // 4. Session recap
  const recap = buildSessionRecap(
    records, result, learning.refinement,
    { source: meta.source || 'glimpse', trigger: meta.trigger || 'manual' },
    learning.comparison, pathResult
  );

  // 5. Calibration check
  const calibration = assessCalibrationNeed(pathResult, pathCtx);

  // 6. Interview (if requested and calibration suggests it)
  let interview = null;
  if (opts.interview) {
    const questions = selectQuestions(
      calibration.suggested ? calibration.questionCount : 3,
      pathCtx
    );

    if (opts.answers) {
      // Non-interactive: answers provided programmatically
      const scored = scoreInterview(opts.answers, questions);
      interview = { questions, result: scored };
    } else {
      // Interactive: return questions for external handling
      interview = { questions, result: null };
    }
  }

  return {
    // Input
    records,
    format,
    config,
    meta,

    // Pipeline
    result,

    // Learning
    learning,

    // PATH
    pathResult,
    pathCtx,

    // Session
    recap,
    calibration,

    // Interview
    interview,

    // Timing
    timestamp: new Date().toISOString()
  };
}

/**
 * Auto-detect config from data shape.
 * When no config is provided, glimpse inspects the data
 * and generates reasonable lenses + settings.
 *
 * @param {Array} records - Input records
 * @returns {object} Auto-generated config
 */
export function autoConfig(records) {
  if (!records || records.length === 0) {
    return defaultConfig();
  }

  // Collect all field names across records
  const allFields = new Set();
  records.forEach(r => Object.keys(r).forEach(k => allFields.add(k)));
  const fields = [...allFields];

  // Detect lens-worthy fields
  const lenses = [];
  const lensHints = {
    // Mood/energy/wellness fields
    mood: { id: 'wellness', label: 'Wellness', weight: 1.0 },
    energy: { id: 'energy', label: 'Energy', weight: 1.0 },
    clarity: { id: 'clarity', label: 'Clarity', weight: 1.0 },

    // Work/project fields
    status: { id: 'status', label: 'Status', weight: 1.0 },
    health: { id: 'health', label: 'Health', weight: 1.0 },
    priority: { id: 'priority', label: 'Priority', weight: 1.2 },

    // Risk/decision fields
    risk: { id: 'risk', label: 'Risk', weight: 1.1 },
    impact: { id: 'impact', label: 'Impact', weight: 1.0 },
    urgency: { id: 'urgency', label: 'Urgency', weight: 1.2 },
    effort: { id: 'effort', label: 'Effort', weight: 0.9 },

    // Financial
    revenue: { id: 'revenue', label: 'Revenue', weight: 1.0 },
    amount: { id: 'financial', label: 'Financial', weight: 1.1 },

    // Relationships
    relationship: { id: 'relationship', label: 'Relationship', weight: 0.8 },

    // Tags/categories
    category: { id: 'category', label: 'Category', weight: 0.8 },
    domain: { id: 'domain', label: 'Domain', weight: 0.8 },
    type: { id: 'type', label: 'Type', weight: 0.8 },
  };

  const seen = new Set();
  fields.forEach(f => {
    const lower = f.toLowerCase();
    for (const [hint, lens] of Object.entries(lensHints)) {
      if (lower.includes(hint) && !seen.has(lens.id)) {
        lenses.push(lens);
        seen.add(lens.id);
      }
    }
  });

  // If no lenses detected, add generic ones
  if (lenses.length === 0) {
    lenses.push(
      { id: 'structure', label: 'Structure', weight: 1.0 },
      { id: 'patterns', label: 'Patterns', weight: 1.0 },
      { id: 'connections', label: 'Connections', weight: 1.0 }
    );
  }

  return {
    functions: {},
    rules: [],
    lenses,
    views: [],
    taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  };
}

/**
 * Default config when nothing can be inferred.
 */
function defaultConfig() {
  return {
    functions: {},
    rules: [],
    lenses: [
      { id: 'structure', label: 'Structure', weight: 1.0 },
      { id: 'patterns', label: 'Patterns', weight: 1.0 },
      { id: 'connections', label: 'Connections', weight: 1.0 }
    ],
    views: [],
    taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  };
}

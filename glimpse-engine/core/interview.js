/**
 * Decisional Interview — the calibration stage.
 *
 * Sits on top of the PATH system's weighted accumulation.
 * Fires domain-displaced, structurally isomorphic questions
 * scored against session context — not textbook correctness.
 *
 * Architecture:
 *   - Manual trigger only (system suggests when useful, never forces)
 *   - Variable length: 3 questions for mild, 5 for critical calibration need
 *   - Questions are metaphorical: different domain, same structural mechanics
 *   - Scoring: context-dependent (refactor → narrowing, expansion → broadening)
 *   - Output: modulation vector that adjusts PATH weights and nudge direction
 *
 * The interview answers reveal the user's REASONING POSTURE:
 *   - Narrowing (refactor, trim, contrast, perception)
 *   - Broadening (expand, synthesize, additive, definition)
 *   - Stabilizing (maintain, reinforce, steady, grounding)
 *   - Pivoting (redirect, abandon, restart, reframe)
 */

// ============================================================================
// 1. REASONING POSTURES — the output vocabulary
// ============================================================================

export const POSTURES = {
  narrowing:   { id: "narrowing",   label: "Narrow & Trim",     vector: "refactor",   weight: 1.5 },
  broadening:  { id: "broadening",  label: "Expand & Synthesize", vector: "expansion", weight: 1.3 },
  stabilizing: { id: "stabilizing", label: "Reinforce & Ground", vector: "surgical",   weight: 1.0 },
  pivoting:    { id: "pivoting",    label: "Redirect & Reframe", vector: "pivot",      weight: 0.8 },
};

// ============================================================================
// 2. CALIBRATION DETECTOR — when to suggest an interview
// ============================================================================

/**
 * Analyze the session context and determine if an interview would be useful.
 * Returns a calibration assessment — the system SUGGESTS but never forces.
 *
 * @param {object} pathResult  - From runPaths
 * @param {object} ctx         - PATH evaluation context
 * @returns {{ suggested: boolean, severity: "mild"|"moderate"|"critical", reason: string, questionCount: number }}
 */
export function assessCalibrationNeed(pathResult, ctx) {
  const signals = [];
  let severity = 0;

  // Signal 1: Declining confidence trend (last 3+ sessions)
  const trend = ctx.history?.confidenceTrend || [];
  if (trend.length >= 3) {
    const recent = trend.slice(-3);
    const declining = recent.every((t, i) => i === 0 || t.overall < recent[i - 1].overall);
    if (declining) {
      severity += 2;
      signals.push("confidence declining for 3+ sessions");
    }
  }

  // Signal 2: Conflicting PATH activations (multiple high-scoring paths)
  // Only counts as ambiguity when paths give CONTRADICTORY advice
  // (risk-warning vs positive-reinforcement), not when multiple positive paths agree
  const activated = (pathResult?.all || []).filter(r => r.activated);
  const riskPathIds = new Set([
    "scattered-expansion-no-tests-novel", "heavy-expansion-no-tests", "scattered-low-confidence",
    "config-blast", "high-churn-concentration", "mixed-vectors", "confidence-dropping",
  ]);
  const hasRisk = activated.some(a => riskPathIds.has(a.pathId));
  const hasPositive = activated.some(a => !riskPathIds.has(a.pathId) && a.score >= 4);
  if (hasRisk && hasPositive) {
    severity += 2;
    signals.push("conflicting PATH activations — risk and positive signals both firing");
  }
  if (activated.length >= 5) {
    severity += 1;
    signals.push(`${activated.length} competing PATH activations`);
  }

  // Signal 3: Make/break proximity — high churn in critical files
  const hotFiles = (pathResult?.evidence || []).filter(e => e.fn === "hot_file" && e.matched);
  const churnAccel = (pathResult?.evidence || []).filter(e => e.fn === "churn_accelerating" && e.matched);
  if (hotFiles.length > 0 && churnAccel.length > 0) {
    severity += 2;
    signals.push("hot files under accelerating churn — make/break proximity");
  }

  // Signal 4: Mixed vectors without clear dominant
  const vectorCounts = {};
  (ctx.records || []).forEach(r => (r.vectors || []).forEach(v => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));
  const total = Object.values(vectorCounts).reduce((s, v) => s + v, 0) || 1;
  const topVector = Math.max(...Object.values(vectorCounts), 0);
  if (topVector / total < 0.4 && Object.keys(vectorCounts).length >= 3) {
    severity += 1;
    signals.push("no dominant vector — ambiguous session type");
  }

  // Signal 5: Low confidence on current session
  const conf = ctx.result?.confidenceReport?.overallScore || 0;
  if (conf < 0.65) {
    severity += 2;
    signals.push(`low session confidence (${Math.round(conf * 100)}%)`);
  }

  // Signal 6: Long stint without tests
  if (trend.length >= 4) {
    const recentSessions = trend.slice(-4);
    // Check if we can detect test absence across recent sessions
    const noTestsInWinner = pathResult?.evidence?.some(e => e.fn === "no_tests" && e.matched);
    if (noTestsInWinner) {
      severity += 1;
      signals.push("sustained work without tests");
    }
  }

  // Determine severity level and question count
  let level, questionCount;
  if (severity >= 5) {
    level = "critical";
    questionCount = 5;
  } else if (severity >= 3) {
    level = "moderate";
    questionCount = 4;
  } else if (severity >= 1) {
    level = "mild";
    questionCount = 3;
  } else {
    return { suggested: false, severity: "none", reason: "session is clean — no calibration needed", questionCount: 0 };
  }

  return {
    suggested: true,
    severity: level,
    reason: signals.join("; "),
    questionCount,
    rawSeverity: severity,
  };
}

// ============================================================================
// 3. QUESTION BANK — domain-displaced, structurally isomorphic
// ============================================================================

/**
 * Each question has:
 *   - text: the question (domain-displaced metaphor)
 *   - options: 4 choices, each mapped to a posture
 *   - contextScoring: a function(sessionContext) → { [posture]: weight }
 *     that determines which answer is "correct" for THIS session
 *   - domain: the displaced domain (physics, music, architecture, etc.)
 *   - mechanic: the underlying engineering mechanic being probed
 */

const QUESTION_BANK = [
  // --- FUNDAMENTAL MECHANICS ---
  {
    id: "relativity",
    domain: "physics",
    mechanic: "scope_resolution",
    text: "What does the theory of general relativity fundamentally deal with?",
    options: [
      { label: "A", text: "Time",                     posture: "stabilizing" },
      { label: "B", text: "Space",                     posture: "broadening" },
      { label: "C", text: "Spacetime (hybrid A & B)",  posture: "broadening" },
      { label: "D", text: "Perception",                posture: "narrowing" },
    ],
    contextScoring: (ctx) => {
      // Refactor scope → D (perception = comparison/contrast, dual, narrowing)
      // Expansion scope → C (synthesis of dimensions, broadening)
      // Surgical scope → A (time = precision, single variable)
      // Mixed/pivot → B (space = open, undirected)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor" || dominant === "contraction") return { narrowing: 3, stabilizing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion" || dominant === "creation")  return { broadening: 3, stabilizing: 1, narrowing: 0, pivoting: 0 };
      if (dominant === "surgical")                               return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 2, broadening: 1, narrowing: 1, stabilizing: 0 };
    },
  },
  {
    id: "architecture_load",
    domain: "architecture",
    mechanic: "load_distribution",
    text: "In structural engineering, a flying buttress exists primarily to:",
    options: [
      { label: "A", text: "Add visual complexity",                      posture: "broadening" },
      { label: "B", text: "Transfer lateral load to the ground",        posture: "narrowing" },
      { label: "C", text: "Allow thinner walls and larger windows",     posture: "stabilizing" },
      { label: "D", text: "Signal that the building is important",      posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Refactor → B (redirect/transfer force = refactoring responsibility)
      // Expansion → C (enable more capability = thinner walls, bigger windows)
      // Surgical → B (precise load path)
      // Mixed → A (adding structure without resolving core)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor" || dominant === "surgical") return { narrowing: 3, stabilizing: 2, broadening: 0, pivoting: 0 };
      if (dominant === "expansion")                           return { stabilizing: 3, broadening: 1, narrowing: 0, pivoting: 0 };
      return { broadening: 1, pivoting: 2, narrowing: 1, stabilizing: 0 };
    },
  },
  {
    id: "music_resolution",
    domain: "music",
    mechanic: "tension_resolution",
    text: "In music theory, a dominant seventh chord resolves to the tonic because:",
    options: [
      { label: "A", text: "It's the rule — tradition dictates it",        posture: "stabilizing" },
      { label: "B", text: "The tritone interval creates instability",      posture: "narrowing" },
      { label: "C", text: "The listener expects it",                       posture: "pivoting" },
      { label: "D", text: "It completes the harmonic cycle",               posture: "broadening" },
    ],
    contextScoring: (ctx) => {
      // Refactor → B (instability drives resolution = tension in code drives refactor)
      // Expansion → D (completing a cycle = building toward wholeness)
      // Stabilizing → A (convention = following established patterns)
      // Pivot → C (expectation = user/context driven, not code driven)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor") return { narrowing: 3, broadening: 1, stabilizing: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, narrowing: 0, stabilizing: 1, pivoting: 0 };
      if (dominant === "surgical") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 2, narrowing: 1, broadening: 1, stabilizing: 0 };
    },
  },
  {
    id: "cooking_reduction",
    domain: "cooking",
    mechanic: "concentration",
    text: "A chef reduces a sauce by simmering. What is actually happening?",
    options: [
      { label: "A", text: "Removing water to intensify flavor",          posture: "narrowing" },
      { label: "B", text: "Cooking the ingredients longer",               posture: "stabilizing" },
      { label: "C", text: "Blending flavors through heat exposure",       posture: "broadening" },
      { label: "D", text: "Changing the sauce into something new",        posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Refactor → A (reduction = removing to concentrate = trimming code)
      // Expansion → C (blending = integrating new elements)
      // Surgical → A (precision removal)
      // Pivot → D (transformation)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor" || dominant === "contraction" || dominant === "removal") return { narrowing: 3, stabilizing: 0, broadening: 0, pivoting: 1 };
      if (dominant === "expansion") return { broadening: 3, narrowing: 0, stabilizing: 1, pivoting: 0 };
      if (dominant === "surgical") return { narrowing: 2, stabilizing: 2, broadening: 0, pivoting: 0 };
      return { pivoting: 3, narrowing: 1, broadening: 0, stabilizing: 0 };
    },
  },
  {
    id: "chess_sacrifice",
    domain: "chess",
    mechanic: "strategic_trade",
    text: "A chess sacrifice (giving up material) is justified when:",
    options: [
      { label: "A", text: "It opens lines for an attack",                posture: "broadening" },
      { label: "B", text: "The opponent's position becomes worse",        posture: "narrowing" },
      { label: "C", text: "It simplifies the position into a won endgame", posture: "stabilizing" },
      { label: "D", text: "It creates chaos the opponent can't handle",   posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Refactor → B (degrading opponent = making codebase simpler by strategic removal)
      // Expansion → A (open lines = create new capability paths)
      // Surgical → C (simplify to winning position = precise targeted change)
      // Pivot → D (chaos = break current pattern for new one)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor") return { narrowing: 3, stabilizing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, pivoting: 1, narrowing: 0, stabilizing: 0 };
      if (dominant === "surgical") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 3, broadening: 1, narrowing: 0, stabilizing: 0 };
    },
  },
  {
    id: "ecology_keystone",
    domain: "ecology",
    mechanic: "dependency_impact",
    text: "A keystone species is removed from an ecosystem. What matters most?",
    options: [
      { label: "A", text: "How many other species depended on it",        posture: "broadening" },
      { label: "B", text: "Whether a substitute can fill the same role",  posture: "stabilizing" },
      { label: "C", text: "The cascade effect on the food web",           posture: "narrowing" },
      { label: "D", text: "Whether the ecosystem was already stressed",   posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Removal → C (cascade = understanding downstream dependencies)
      // Refactor → C (cascade = what breaks when you change things)
      // Expansion → A (breadth of impact = how much new code touches)
      // Pivot → D (existing stress = when to abandon vs fix)
      const dominant = detectDominantVector(ctx);
      if (dominant === "removal" || dominant === "refactor" || dominant === "contraction") return { narrowing: 3, pivoting: 1, broadening: 0, stabilizing: 0 };
      if (dominant === "expansion") return { broadening: 3, stabilizing: 1, narrowing: 0, pivoting: 0 };
      if (dominant === "surgical") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 3, narrowing: 1, broadening: 0, stabilizing: 0 };
    },
  },
  {
    id: "navigation_fog",
    domain: "navigation",
    mechanic: "uncertainty_handling",
    text: "You're sailing in dense fog with a compass and a chart. The compass shows a bearing that contradicts your expected position. You should:",
    options: [
      { label: "A", text: "Trust the compass — instruments don't lie",     posture: "stabilizing" },
      { label: "B", text: "Stop and take multiple readings to triangulate", posture: "narrowing" },
      { label: "C", text: "Adjust the chart — the map might be wrong",     posture: "pivoting" },
      { label: "D", text: "Continue cautiously, looking for landmarks",     posture: "broadening" },
    ],
    contextScoring: (ctx) => {
      // Low confidence → B (stop and measure = add tests, verify)
      // High confidence + drift → C (adjust mental model)
      // Stable → A (trust current trajectory)
      // Exploratory → D (cautious advance)
      const conf = ctx.result?.confidenceReport?.overallScore || 0;
      const dominant = detectDominantVector(ctx);
      if (conf < 0.7) return { narrowing: 3, stabilizing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, narrowing: 1, stabilizing: 0, pivoting: 0 };
      if (dominant === "refactor") return { narrowing: 2, pivoting: 2, stabilizing: 0, broadening: 0 };
      return { stabilizing: 2, broadening: 2, narrowing: 0, pivoting: 0 };
    },
  },
  {
    id: "photography_exposure",
    domain: "photography",
    mechanic: "trade_off_balance",
    text: "The exposure triangle (aperture, shutter speed, ISO) forces trade-offs. When you open the aperture wider, you gain:",
    options: [
      { label: "A", text: "More light but less depth of field",           posture: "narrowing" },
      { label: "B", text: "Faster capture speed",                         posture: "stabilizing" },
      { label: "C", text: "More creative control over bokeh",             posture: "broadening" },
      { label: "D", text: "The ability to shoot in worse conditions",     posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Refactor → A (trade-off awareness = gaining focus at cost of breadth)
      // Expansion → C (creative control = opening new possibilities)
      // Surgical → B (speed/efficiency = quick precise work)
      // Mixed → D (adaptability = handling adverse conditions)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor" || dominant === "contraction") return { narrowing: 3, stabilizing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, narrowing: 0, stabilizing: 1, pivoting: 0 };
      if (dominant === "surgical") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 3, broadening: 1, narrowing: 0, stabilizing: 0 };
    },
  },
  {
    id: "gardening_prune",
    domain: "gardening",
    mechanic: "strategic_removal",
    text: "Pruning a tree in winter serves what primary purpose?",
    options: [
      { label: "A", text: "Removing dead wood to prevent disease",        posture: "narrowing" },
      { label: "B", text: "Shaping future growth direction",              posture: "stabilizing" },
      { label: "C", text: "Allowing more light to reach inner branches",  posture: "broadening" },
      { label: "D", text: "Reducing the tree's energy expenditure",       posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Removal → A (remove dead = trim dead code)
      // Refactor → B (shape future = restructure for growth)
      // Expansion → C (more light = open paths for new code)
      // Contraction → D (reduce energy = simplify)
      const dominant = detectDominantVector(ctx);
      if (dominant === "removal") return { narrowing: 3, pivoting: 1, broadening: 0, stabilizing: 0 };
      if (dominant === "refactor") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, stabilizing: 1, narrowing: 0, pivoting: 0 };
      return { pivoting: 3, narrowing: 1, broadening: 0, stabilizing: 0 };
    },
  },
  {
    id: "language_translation",
    domain: "linguistics",
    mechanic: "context_preservation",
    text: "The hardest part of translating poetry between languages is preserving:",
    options: [
      { label: "A", text: "The literal meaning of each word",             posture: "stabilizing" },
      { label: "B", text: "The rhythm and sound pattern",                  posture: "narrowing" },
      { label: "C", text: "The emotional resonance",                       posture: "broadening" },
      { label: "D", text: "The cultural context that gives it weight",     posture: "pivoting" },
    ],
    contextScoring: (ctx) => {
      // Refactor → B (structure/rhythm = code structure, not content)
      // Expansion → C (emotional resonance = intent, purpose, why)
      // Surgical → A (literal precision)
      // Pivot → D (context = when the whole frame of reference shifts)
      const dominant = detectDominantVector(ctx);
      if (dominant === "refactor") return { narrowing: 3, stabilizing: 1, broadening: 0, pivoting: 0 };
      if (dominant === "expansion") return { broadening: 3, pivoting: 1, narrowing: 0, stabilizing: 0 };
      if (dominant === "surgical") return { stabilizing: 3, narrowing: 1, broadening: 0, pivoting: 0 };
      return { pivoting: 3, broadening: 1, narrowing: 0, stabilizing: 0 };
    },
  },
];

// ============================================================================
// 4. QUESTION SELECTION — pick the right questions for this context
// ============================================================================

/**
 * Select questions for an interview burst.
 * Picks questions whose `mechanic` is most relevant to current session signals.
 *
 * @param {number} count   - How many questions to select
 * @param {object} ctx     - PATH evaluation context
 * @param {object} [opts]  - { exclude: string[] } — question IDs to skip
 * @returns {Array} Selected questions with contextScoring pre-evaluated
 */
export function selectQuestions(count, ctx, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const available = QUESTION_BANK.filter(q => !exclude.has(q.id));

  // Score each question's relevance to current session
  const scored = available.map(q => {
    let relevance = 0;

    // Mechanic relevance
    const dominant = detectDominantVector(ctx);
    const vectorMechanics = {
      refactor: ["scope_resolution", "tension_resolution", "concentration", "strategic_removal", "context_preservation"],
      expansion: ["load_distribution", "strategic_trade", "dependency_impact", "trade_off_balance"],
      surgical: ["scope_resolution", "uncertainty_handling", "trade_off_balance"],
      removal: ["concentration", "strategic_removal", "dependency_impact"],
      creation: ["load_distribution", "strategic_trade"],
    };
    const relevantMechanics = vectorMechanics[dominant] || [];
    if (relevantMechanics.includes(q.mechanic)) relevance += 3;

    // Confidence relevance
    const conf = ctx.result?.confidenceReport?.overallScore || 0;
    if (conf < 0.7 && q.mechanic === "uncertainty_handling") relevance += 2;

    // Add some randomness to avoid predictability
    relevance += Math.random() * 1.5;

    return { ...q, relevance };
  });

  // Sort by relevance and take top N
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, count).map(q => ({
    id: q.id,
    domain: q.domain,
    mechanic: q.mechanic,
    text: q.text,
    options: q.options,
    _contextScoring: q.contextScoring(ctx),
  }));
}

// ============================================================================
// 5. SCORING ENGINE — score answers against session context
// ============================================================================

/**
 * Score a set of interview answers against the session context.
 *
 * @param {Array} answers  - Array of { questionId, selectedLabel }
 * @param {Array} questions - The questions with _contextScoring
 * @returns {{ posture: string, postureLabel: string, scores: object, confidence: number, modulation: object }}
 */
export function scoreInterview(answers, questions) {
  const postureScores = { narrowing: 0, broadening: 0, stabilizing: 0, pivoting: 0 };
  let maxPossible = 0;
  let earned = 0;

  for (const answer of answers) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    const selected = question.options.find(o => o.label === answer.selectedLabel);
    if (!selected) continue;

    const contextWeights = question._contextScoring;
    const selectedPosture = selected.posture;
    const answerScore = contextWeights[selectedPosture] || 0;

    // Accumulate posture scores
    postureScores[selectedPosture] += answerScore;

    // Track max possible score for confidence calculation
    const bestScore = Math.max(...Object.values(contextWeights));
    maxPossible += bestScore;
    earned += answerScore;
  }

  // Determine dominant posture
  const sorted = Object.entries(postureScores).sort((a, b) => b[1] - a[1]);
  const dominantPosture = sorted[0][0];
  const postureDef = POSTURES[dominantPosture];

  // Interview confidence: how aligned are the answers with the context?
  const confidence = maxPossible > 0 ? earned / maxPossible : 0.5;

  // Build modulation vector
  const modulation = buildModulation(dominantPosture, confidence, postureScores);

  return {
    posture: dominantPosture,
    postureLabel: postureDef.label,
    scores: postureScores,
    confidence,
    modulation,
    raw: { earned, maxPossible },
  };
}

// ============================================================================
// 6. MODULATION — how the interview adjusts PATH output
// ============================================================================

/**
 * Build a modulation vector from interview results.
 * This vector adjusts the PATH system's nudge direction.
 *
 * @param {string} posture     - Dominant reasoning posture
 * @param {number} confidence  - Interview confidence (0-1)
 * @param {object} scores      - All posture scores
 * @returns {{ direction: string, boost: number, nudgeSuffix: string, pathBias: object }}
 */
function buildModulation(posture, confidence, scores) {
  const postureDef = POSTURES[posture];
  const total = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
  const dominance = scores[posture] / total;

  // Strong alignment (dominance > 0.6): confident modulation
  // Weak alignment (dominance < 0.4): tentative, mixed signal
  const boost = confidence >= 0.7 ? 1.5 : confidence >= 0.5 ? 1.0 : 0.7;

  // Build path bias: boost paths whose vector matches the posture
  const pathBias = {
    matchVector: postureDef.vector,
    boostFactor: boost,
    confidence,
    dominance,
  };

  // Generate a nudge suffix based on posture
  const suffixes = {
    narrowing:   "consider trimming scope — sharpen before widening",
    broadening:  "the direction is right — keep building out",
    stabilizing: "solidify what exists before adding more",
    pivoting:    "this approach may need a different angle",
  };

  // Modulate suffix by confidence
  let nudgeSuffix;
  if (confidence >= 0.7) {
    nudgeSuffix = suffixes[posture];
  } else if (confidence >= 0.4) {
    nudgeSuffix = `leaning toward: ${suffixes[posture].split("—")[0].trim()}`;
  } else {
    nudgeSuffix = "mixed signals — proceed with intention";
  }

  return {
    direction: posture,
    boost,
    nudgeSuffix,
    pathBias,
  };
}

// ============================================================================
// 7. FULL INTERVIEW FLOW — end-to-end orchestration
// ============================================================================

/**
 * Run a complete interview: assess need, select questions, return interview object.
 * The actual Q&A happens externally (CLI, IDE, etc.) — this prepares and scores.
 *
 * @param {object} pathResult - From runPaths
 * @param {object} ctx        - PATH evaluation context
 * @returns {{ assessment: object, questions: Array, score: function }}
 */
export function prepareInterview(pathResult, ctx) {
  const assessment = assessCalibrationNeed(pathResult, ctx);

  if (!assessment.suggested) {
    return {
      assessment,
      questions: [],
      score: () => null,
    };
  }

  const questions = selectQuestions(assessment.questionCount, ctx);

  return {
    assessment,
    questions,
    /**
     * Score answers after user completes the interview.
     * @param {Array} answers - Array of { questionId, selectedLabel }
     * @returns {object} Interview result with modulation vector
     */
    score: (answers) => scoreInterview(answers, questions),
  };
}

/**
 * Apply interview modulation to a PATH result.
 * Adjusts the nudge by appending the modulation suffix.
 *
 * @param {object} pathResult    - Original PATH result
 * @param {object} interviewResult - From scoreInterview
 * @returns {object} Modified pathResult with modulated nudge
 */
export function applyInterviewModulation(pathResult, interviewResult) {
  if (!interviewResult || !interviewResult.modulation) return pathResult;

  const mod = interviewResult.modulation;
  const originalNudge = pathResult.nudge || "";

  return {
    ...pathResult,
    nudge: originalNudge
      ? `${originalNudge} — ${mod.nudgeSuffix}`
      : mod.nudgeSuffix,
    interview: {
      posture: interviewResult.posture,
      postureLabel: interviewResult.postureLabel,
      confidence: interviewResult.confidence,
      modulation: mod,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function detectDominantVector(ctx) {
  // Normalize related vectors into posture-aligned groups
  const aliases = { creation: "expansion", contraction: "refactor", removal: "refactor" };
  const vectorCounts = {};
  (ctx.records || []).forEach(r =>
    (r.vectors || []).forEach(v => {
      const key = aliases[v] || v;
      vectorCounts[key] = (vectorCounts[key] || 0) + 1;
    })
  );
  let best = null, bestV = 0;
  for (const [k, v] of Object.entries(vectorCounts)) {
    if (v > bestV) { best = k; bestV = v; }
  }
  return best || "mixed";
}

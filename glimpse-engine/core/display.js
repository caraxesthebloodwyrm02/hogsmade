// core/display.js — the voice of glimpse
// Unified output formatting: fast, visual, human-first.
// Every output should be glanceable — if you have to read it twice, it failed.

// ============================================================================
// 1. FRAME — the container for all glimpse output
// ============================================================================

/**
 * Print the opening frame for a glimpse session.
 * @param {string} title - Session title
 * @param {object} [opts] - { quiet: boolean }
 */
export function openFrame(title, opts = {}) {
  if (opts.quiet) return;
  const padded = ` ${title} `;
  const width = Math.max(padded.length + 4, 38);
  const border = '─'.repeat(width - 2);
  console.log('');
  console.log(`  ┌${border}┐`);
  console.log(`  │${padded.padEnd(width - 2)}│`);
  console.log(`  └${border}┘`);
  console.log('');
}

/**
 * Print a section header.
 */
export function section(label, opts = {}) {
  if (opts.quiet) return;
  console.log(`  ${label}`);
  console.log(`  ${'─'.repeat(label.length)}`);
}

/**
 * Print a blank line.
 */
export function gap(opts = {}) {
  if (opts.quiet) return;
  console.log('');
}

// ============================================================================
// 2. DATA VIEWS — visual representations of data
// ============================================================================

/**
 * Render a bar: █████░░░░░ 62%
 * @param {number} value - 0 to 1
 * @param {number} [width=10] - bar width in chars
 * @returns {string}
 */
export function bar(value, width = 10) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Render a labeled row with icon.
 * @param {string} icon - single char icon
 * @param {string} label - left-aligned label
 * @param {string} value - right-aligned value
 * @param {object} [opts]
 */
export function row(icon, label, value, opts = {}) {
  if (opts.quiet) return;
  console.log(`  ${icon} ${label.padEnd(opts.padLabel || 16)} ${value}`);
}

/**
 * Render a key-value pair.
 */
export function kv(key, value, opts = {}) {
  if (opts.quiet) return;
  console.log(`  ${key}: ${value}`);
}

/**
 * Render a factor with bar visualization.
 * @param {object} factor - { label, score, detail, weight }
 */
export function factor(f, opts = {}) {
  if (opts.quiet) return;
  const pct = `${(f.score * 100).toFixed(0)}%`;
  const detail = f.detail ? ` — ${f.detail}` : '';
  const weightTag = f.weight ? ` [${f.weight}]` : '';
  console.log(`  ${bar(f.score)} ${pct.padStart(4)}  ${f.label}${detail}${weightTag}`);
}

/**
 * Render a list of items with a prefix.
 */
export function list(items, prefix = '·', opts = {}) {
  if (opts.quiet) return;
  items.forEach(item => console.log(`  ${prefix} ${item}`));
}

/**
 * Render a flagged notice.
 */
export function flag(message, opts = {}) {
  if (opts.quiet) return;
  console.log(`  ⚑ ${message}`);
}

/**
 * Render a recommendation / signal line.
 */
export function signal(message, opts = {}) {
  if (opts.quiet) return;
  console.log(`  → ${message}`);
}

// ============================================================================
// 3. MOOD ICONS — visual shorthand for state
// ============================================================================

const MOOD_ICONS = {
  // Energy/wellness
  peaceful: '◎', focused: '◉', drained: '▽', recovering: '○',
  creative: '◆', scattered: '◇', contemplative: '◎', energized: '▲',
  thinking: '○', frustrated: '▽', cautious: '◇',
  // Health
  excellent: '●', strong: '◉', stable: '○', growing: '▲',
  'at-risk': '▽', complete: '✓',
  // Priority
  critical: '◉', high: '▲', medium: '○', low: '◇',
  // Default
  default: '·'
};

/**
 * Get the icon for a mood/state string.
 */
export function icon(mood) {
  return MOOD_ICONS[mood] || MOOD_ICONS.default;
}

// ============================================================================
// 4. ENGINE SUMMARY — standard pipeline result display
// ============================================================================

/**
 * Render the standard engine summary block.
 * @param {object} result - Pipeline result
 * @param {object} [opts]
 */
export function engineSummary(result, opts = {}) {
  if (opts.quiet) return;
  gap();
  section('Engine', opts);
  kv('Complexity', result.complexity?.level || 'n/a', opts);
  kv('Confidence', `${(result.confidenceReport?.overallScore * 100 || 0).toFixed(0)}%`, opts);
  kv('Entities', result.entities?.length || 0, opts);
  kv('Relations', result.relations?.length || 0, opts);

  if (result.invariantPatterns?.length > 0 && !opts.brief) {
    gap();
    section('Patterns', opts);
    result.invariantPatterns.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.text} (density: ${p.densityScore?.toFixed(3) || 'n/a'})`);
    });
  }
}

/**
 * Render session recap lines.
 * @param {string[]} recap - Lines from buildSessionRecap
 * @param {object} [opts]
 */
export function sessionRecap(recap, opts = {}) {
  if (opts.quiet) return;
  gap();
  section('Session', opts);
  recap.forEach(line => console.log(`  ${line}`));
}

/**
 * Render calibration suggestion if needed.
 * @param {object} calibration - From assessCalibrationNeed
 * @param {object} [opts]
 */
export function calibrationNotice(calibration, opts = {}) {
  if (!calibration?.suggested) return;
  if (opts.quiet) {
    console.log(`  ⚑ calibration: ${calibration.severity}`);
    return;
  }
  gap();
  flag(`calibration available (${calibration.severity}) — rerun with --interview`);
}

// ============================================================================
// 5. INTERVIEW DISPLAY — for the decisional interview flow
// ============================================================================

/**
 * Render a single interview question.
 * @param {object} question - { text, options, domain }
 * @param {number} index - question number (1-based)
 */
export function interviewQuestion(question, index) {
  gap();
  console.log(`  Q${index}. [${question.domain}] ${question.text}`);
  question.options.forEach(opt => {
    console.log(`      ${opt.label}) ${opt.text}`);
  });
}

/**
 * Render interview results.
 * @param {object} result - From scoreInterview
 */
export function interviewResult(result) {
  gap();
  section('Interview Result');
  kv('Posture', `${result.postureLabel} (${result.posture})`);
  kv('Alignment', `${(result.confidence * 100).toFixed(0)}%`);
  gap();
  signal(result.modulation.nudgeSuffix);
}

// ============================================================================
// 6. COMPOSITE VIEWS — pre-built layouts for common scenarios
// ============================================================================

/**
 * Render a decision view with weighted factors and a recommendation.
 * @param {object} params
 * @param {string} params.title - What's being decided
 * @param {Array}  params.factors - Array of { label, score, detail, weight }
 * @param {number} params.overallScore - 0-1
 * @param {string} params.recommendation - The recommendation text
 * @param {object} [opts]
 */
export function decisionView({ title, factors, overallScore, recommendation }, opts = {}) {
  if (title) {
    gap(opts);
    section(title, opts);
  }

  factors.forEach(f => factor(f, opts));

  gap(opts);
  kv('Overall signal', `${(overallScore * 100).toFixed(0)}%`, opts);
  signal(recommendation, opts);
}

/**
 * Render a timeline view (energy, activity, etc.).
 * @param {Array} entries - Array of { time, label, value, maxValue, mood }
 * @param {object} [opts]
 */
export function timelineView(entries, opts = {}) {
  const maxVal = opts.maxValue || 10;
  entries.forEach(entry => {
    const barStr = bar(entry.value / maxVal);
    const mood = entry.mood ? ` ${icon(entry.mood)}` : '';
    console.log(`  ${entry.time} ${barStr} ${entry.value}/${maxVal}${mood}  ${entry.label}`);
  });
}

/**
 * Render a table of items with status.
 * @param {Array} items - Array of { icon, name, status, detail }
 * @param {object} [opts]
 */
export function statusTable(items, opts = {}) {
  const maxName = Math.max(...items.map(i => (i.name || '').length), 10);
  items.forEach(item => {
    const ico = item.icon || icon(item.status || item.health || item.mood);
    const detail = item.detail ? ` ${item.detail}` : '';
    console.log(`  ${ico} ${(item.name || '').padEnd(maxName + 2)} ${(item.status || '').padEnd(14)} ${item.health || ''}${detail}`);
  });
}

// ============================================================================
// 7. CLOSING
// ============================================================================

/**
 * Close the output with a trailing blank line.
 */
export function close() {
  console.log('');
}

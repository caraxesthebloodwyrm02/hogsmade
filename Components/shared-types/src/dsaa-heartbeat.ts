/**
 * DSAA Heartbeat — the rhythmic core of Design System Architecture Automation.
 *
 * Musical metaphor: a 4/4 bar with swing. Each complete cycle has four phases —
 *   intake → process → emit → rest
 *
 * Swing displaces the `process` beat slightly behind the strict metric grid, the
 * way a jazz drummer sits behind the kick — creating organic, non-mechanical feel.
 * Signal heat (derived from real work: diffs, iterations, session age) is the
 * tempo engine: low activity = slow breathing; full heat = driving pulse.
 *
 * The `progression()` function is the primary API. It returns the current arc:
 * where the cycle came from, where it is going, and how much swing is bending
 * the midpoint. Agents and renderers consume Progressions, not raw time.
 *
 * Analogy in music: the chord change. The harmony doesn't snap — it resolves
 * with a feel that carries the phrase forward.
 */

// ── Phase ────────────────────────────────────────────────────────────────────

/**
 * The four phases of one DSAA cycle.
 *
 * intake  — system reads signals, listens. Downbeat: strong, attentive.
 * process — transforms and weighs the intake. Offbeat: where swing lives.
 * emit    — output fires into the field. Upbeat: energised, decisive.
 * rest    — decay before the next cycle. Weak beat: compresses under heat.
 */
export type Phase = "intake" | "process" | "emit" | "rest";

export const PHASE_SEQUENCE: readonly Phase[] = ["intake", "process", "emit", "rest"] as const;

/** Index type for the four phases (0–3). */
export type BeatIndex = 0 | 1 | 2 | 3;

/**
 * Base weight of each phase within one cycle (sum = 1.0).
 * At zero heat: process carries the most weight; rest breathes long.
 * Under heat: rest compresses via rest_compression; process drives.
 */
export const PHASE_BASE_WEIGHTS: Record<Phase, number> = {
  intake: 0.15,
  process: 0.35,
  emit: 0.2,
  rest: 0.3,
};

// ── SwingProfile ──────────────────────────────────────────────────────────────

/**
 * SwingProfile — parameterises the rhythmic feel.
 *
 * swing_ratio:   0.0 = mechanical straight (1:1 pairs)
 *                1.0 = maximum swing (2:1 long:short)
 *                Classic jazz feel: 0.55–0.67. DSAA default: 0.62.
 *
 * groove_bias:  "process" — analysis step sits behind the beat (laid-back).
 *               "emit"    — output step is pushed, aggressive.
 *
 * subdivision:  "eighth"   — pairs at the eighth-note level (straighter).
 *               "triplet"  — swing triplet feel (rounder, loopier).
 */
export interface SwingProfile {
  swing_ratio: number;
  groove_bias: "process" | "emit";
  subdivision: "eighth" | "triplet";
}

export const DEFAULT_SWING: SwingProfile = {
  swing_ratio: 0.62,
  groove_bias: "process",
  subdivision: "triplet",
};

// ── HeartbeatConfig ───────────────────────────────────────────────────────────

/**
 * HeartbeatConfig — controls tempo range, phase compression, and swing feel.
 *
 * base_tempo:        cycles/minute at signal heat = 0 (idle breathing).
 * peak_tempo:        cycles/minute at signal heat = 1.0 (full drive).
 * rest_compression:  0 = rest phase is rigid; 1 = rest collapses to near-zero
 *                    under max heat. Models the system leaning into work.
 */
export interface HeartbeatConfig {
  base_tempo: number;
  peak_tempo: number;
  rest_compression: number;
  swing: SwingProfile;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  // 18 cpm at idle ≈ one cycle every 3.3 s — slow breathing
  // 72 cpm at peak ≈ one cycle every 0.83 s — active development pace
  base_tempo: 18,
  peak_tempo: 72,
  rest_compression: 0.8,
  swing: DEFAULT_SWING,
};

// ── Pulse ─────────────────────────────────────────────────────────────────────

/**
 * Pulse — instantaneous snapshot of the heartbeat's position in the cycle.
 *
 * beat_index:    which of the four phases is active (0 = intake … 3 = rest).
 * phase:         name of the active phase.
 * beat_position: 0.0–1.0, how far through the current phase.
 * swing_offset:  sinusoidal swing displacement at this beat_position.
 *                Positive = lagging (laid-back). Negative = pushed. Range −0.5…+0.5.
 * tempo:         effective cycles/minute derived from current heat.
 * cycle:         total complete cycles since heartbeat start.
 * heat:          signal heat feeding this pulse (0.0–1.0).
 */
export interface Pulse {
  beat_index: BeatIndex;
  phase: Phase;
  beat_position: number;
  swing_offset: number;
  tempo: number;
  cycle: number;
  heat: number;
}

// ── Progression ───────────────────────────────────────────────────────────────

/**
 * Progression — the current arc between two consecutive phases.
 *
 * Agents and renderers consume Progressions. A Progression answers:
 *   "Where did the cycle come from, where is it going, and how much swing
 *    is bending this transition?"
 *
 * from:               the phase we are leaving.
 * to:                 the phase we are entering.
 * progress:           0.0 = start of from-phase, 1.0 = fully into to-phase.
 * swing_displacement: how much the swing has bent the midpoint (−0.5…+0.5).
 *                     Positive = transition feels late/laid-back.
 *                     Negative = transition feels pushed/early.
 * pulse:              the Pulse at the moment this Progression was computed.
 */
export interface Progression {
  from: Phase;
  to: Phase;
  progress: number;
  swing_displacement: number;
  pulse: Pulse;
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * effectiveTempo — derive cycles/minute from signal heat and config.
 *
 * Linear interpolation between base_tempo (heat = 0) and peak_tempo (heat = 1).
 */
export function effectiveTempo(heat: number, config: HeartbeatConfig): number {
  return config.base_tempo + heat * (config.peak_tempo - config.base_tempo);
}

/**
 * phaseDurations — compute the actual millisecond duration of each phase for
 * one complete cycle, given the current heat.
 *
 * Rest phase compresses proportionally to heat * rest_compression, modelling
 * how a working system spends less time idle when load is high.
 */
export function phaseDurations(heat: number, config: HeartbeatConfig): Record<Phase, number> {
  const cycleDurationMs = 60_000 / effectiveTempo(heat, config);
  const restWeight = PHASE_BASE_WEIGHTS.rest * (1 - heat * config.rest_compression);
  const totalWeight =
    PHASE_BASE_WEIGHTS.intake + PHASE_BASE_WEIGHTS.process + PHASE_BASE_WEIGHTS.emit + restWeight;
  const scale = cycleDurationMs / totalWeight;
  return {
    intake: PHASE_BASE_WEIGHTS.intake * scale,
    process: PHASE_BASE_WEIGHTS.process * scale,
    emit: PHASE_BASE_WEIGHTS.emit * scale,
    rest: restWeight * scale,
  };
}

/**
 * swingDisplacement — compute the swing bend at a specific position within a phase.
 *
 * Only the groove_bias phase is bent. All other phases return 0.
 *
 * Swing in music stretches the first note of each pair and compresses the second
 * (2:1 for full triplet swing). Here this is modelled as a sinusoidal envelope
 * peaked at the midpoint of the biased phase — the system "sits behind the beat"
 * most when it is halfway through analysis.
 *
 * stretch = swing_ratio × (triplet_ratio − 0.5)
 *   triplet: ratio = 0.667 → stretch peak ≈ +0.104 at swing_ratio 0.62
 *   eighth:  ratio = 0.5   → stretch = 0 (no displacement at 0.5 reference)
 *
 * Returns a value in the range [−0.5, +0.5].
 */
export function swingDisplacement(phase: Phase, beatPosition: number, swing: SwingProfile): number {
  if (phase !== swing.groove_bias) return 0;
  const referenceRatio = swing.subdivision === "triplet" ? 0.667 : 0.5;
  const stretch = swing.swing_ratio * (referenceRatio - 0.5);
  // Sinusoidal envelope: peaks at midpoint, fades to zero at edges
  const envelope = Math.sin(Math.PI * beatPosition);
  return stretch * envelope;
}

/**
 * progression — compute the Progression arc from the given Pulse.
 *
 * This is the primary DSAA API surface. Given any Pulse, it returns:
 * - the phase we are in (from)
 * - the phase we are heading into (to)
 * - how far through the transition we are (progress = beat_position)
 * - how much swing has displaced the midpoint
 *
 * Cyclical: `to` wraps from "rest" back to "intake" (PHASE_SEQUENCE modular).
 */
export function progression(pulse: Pulse, config: HeartbeatConfig): Progression {
  const nextIndex = ((pulse.beat_index + 1) % 4) as BeatIndex;
  const displacement = swingDisplacement(pulse.phase, pulse.beat_position, config.swing);
  return {
    from: pulse.phase,
    to: PHASE_SEQUENCE[nextIndex],
    progress: pulse.beat_position,
    swing_displacement: displacement,
    pulse,
  };
}

/**
 * nextPhase — utility: return the phase that follows the given phase in the cycle.
 */
export function nextPhase(phase: Phase): Phase {
  const idx = PHASE_SEQUENCE.indexOf(phase);
  return PHASE_SEQUENCE[(idx + 1) % 4];
}

/**
 * phaseWeight — return the normalised base weight (0–1) for a given phase,
 * accounting for heat-induced rest compression.
 */
export function phaseWeight(phase: Phase, heat: number, config: HeartbeatConfig): number {
  const durations = phaseDurations(heat, config);
  const total = Object.values(durations).reduce((a, b) => a + b, 0);
  return durations[phase] / total;
}

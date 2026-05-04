/**
 * DSAAHeartbeat — live renderer implementation of the DSAA rhythmic core.
 *
 * This class drives the Glass field's temporal awareness. It advances via
 * tick(dt, heat) calls from the render loop and exposes:
 *
 *   pulse()        — instantaneous position snapshot
 *   progression()  — the current from→to arc with swing displacement
 *   sync(pulse)    — lock to an externally emitted Pulse (agent bridge sync)
 *   onProgression  — subscribe to every progression event
 *
 * All foundational types and pure functions are defined inline here so the
 * renderer remains self-contained (no @cascade/shared-types dependency in the
 * renderer compilation boundary). The shared-types version is the server-side
 * mirror used by glass-server tooling.
 */

// ── Phase ─────────────────────────────────────────────────────────────────────

export type Phase = "intake" | "process" | "emit" | "rest";
export type BeatIndex = 0 | 1 | 2 | 3;

export const PHASE_SEQUENCE: readonly Phase[] = ["intake", "process", "emit", "rest"] as const;

/**
 * Base weight of each phase (sum = 1.0).
 * process carries the most; rest breathes long and compresses under heat.
 */
export const PHASE_BASE_WEIGHTS: Record<Phase, number> = {
  intake: 0.15,
  process: 0.35,
  emit: 0.2,
  rest: 0.3,
};

// ── SwingProfile ──────────────────────────────────────────────────────────────

/**
 * Parameterises the rhythmic feel.
 *
 * swing_ratio:  0 = mechanical; 1 = max swing. Default 0.62 (classic triplet feel).
 * groove_bias:  which phase sits behind the beat.
 * subdivision:  "triplet" produces a rounder, loopier feel.
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
 * Controls tempo range, phase compression, and swing feel.
 *
 * base_tempo:       cpm at heat = 0 (18 ≈ one cycle every 3.3 s — idle breathing)
 * peak_tempo:       cpm at heat = 1 (72 ≈ one cycle every 0.83 s — full drive)
 * rest_compression: how aggressively rest collapses under heat (0 = rigid, 1 = max)
 */
export interface HeartbeatConfig {
  base_tempo: number;
  peak_tempo: number;
  rest_compression: number;
  swing: SwingProfile;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  base_tempo: 18,
  peak_tempo: 72,
  rest_compression: 0.8,
  swing: DEFAULT_SWING,
};

// ── Pulse ─────────────────────────────────────────────────────────────────────

/**
 * Instantaneous snapshot of the heartbeat's position.
 *
 * beat_index:    0–3 (which phase).
 * phase:         name of the active phase.
 * beat_position: 0.0–1.0, progress within the current phase.
 * swing_offset:  sinusoidal displacement at this position (−0.5…+0.5).
 *                Positive = lagging (laid-back). Negative = pushed.
 * tempo:         current effective cpm.
 * cycle:         total complete cycles since start.
 * heat:          signal heat driving this pulse (0.0–1.0).
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
 * The current arc between two consecutive phases — the primary DSAA API surface.
 *
 * Answers: where did we come from, where are we going, how much swing is
 * bending this transition, and what is the pulse underneath it?
 *
 * progress = 1.0 means the `from` phase is complete and `to` is fully entered.
 * The cycle wraps: after "rest" comes "intake" again, carrying heat forward.
 */
export interface Progression {
  from: Phase;
  to: Phase;
  /** 0.0 = entering `from`, 1.0 = `to` phase fully entered. */
  progress: number;
  /**
   * Swing displacement at this beat_position (−0.5…+0.5).
   * Positive = transition feels late/laid-back (process groove_bias default).
   * Negative = transition feels pushed/early.
   */
  swing_displacement: number;
  /** The Pulse at the moment this Progression was computed. */
  pulse: Pulse;
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * effectiveTempo — linear interpolation between base and peak, driven by heat.
 */
export function effectiveTempo(heat: number, config: HeartbeatConfig): number {
  return config.base_tempo + heat * (config.peak_tempo - config.base_tempo);
}

/**
 * phaseDurations — compute millisecond duration of each phase for one cycle.
 *
 * Rest compresses proportionally to heat × rest_compression, so the system
 * breathes shorter rests when under load — it leans into the work.
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
 * swingDisplacement — the sinusoidal swing bend at a position within a phase.
 *
 * Only the groove_bias phase is displaced. The bend peaks at the midpoint
 * (beatPosition = 0.5) and fades to zero at phase entry and exit — the
 * system sits most "behind the beat" when it is deepest into analysis.
 *
 * Triplet swing: referenceRatio = 0.667 → stretch ≈ +0.104 at ratio 0.62.
 * Eighth swing:  referenceRatio = 0.5   → no displacement (symmetric pairs).
 */
export function swingDisplacement(phase: Phase, beatPosition: number, swing: SwingProfile): number {
  if (phase !== swing.groove_bias) return 0;
  const referenceRatio = swing.subdivision === "triplet" ? 0.667 : 0.5;
  const stretch = swing.swing_ratio * (referenceRatio - 0.5);
  return stretch * Math.sin(Math.PI * beatPosition);
}

/**
 * progression — compute the Progression arc from a Pulse.
 *
 * Cyclical: "rest" wraps back to "intake". The cycle carries heat forward.
 */
export function progression(pulse: Pulse, config: HeartbeatConfig): Progression {
  const nextIndex = ((pulse.beat_index + 1) % 4) as BeatIndex;
  return {
    from: pulse.phase,
    to: PHASE_SEQUENCE[nextIndex],
    progress: pulse.beat_position,
    swing_displacement: swingDisplacement(pulse.phase, pulse.beat_position, config.swing),
    pulse,
  };
}

/**
 * nextPhase — return the phase that follows in the cycle.
 */
export function nextPhase(phase: Phase): Phase {
  return PHASE_SEQUENCE[(PHASE_SEQUENCE.indexOf(phase) + 1) % 4];
}

// ── DSAAHeartbeat ─────────────────────────────────────────────────────────────

/**
 * DSAAHeartbeat — the live renderer-side heartbeat driver.
 *
 * Wired into the Glass render loop via Field.ts. Advance with tick(dt, heat)
 * on every animation frame. Heat comes from the ModulationEngine's signal bus
 * (already normalised by computeSignalHeat in signal-heat.ts).
 *
 * Usage:
 *   const hb = new DSAAHeartbeat();
 *   const unsub = hb.onProgression(prog => renderHBOverlay(prog));
 *   // in render loop:
 *   const prog = hb.tick(dt, signalHeat);
 *
 * Sync with an agent-emitted Pulse (from bridge field):
 *   hb.sync(bridgeState.heartbeat_pulse);
 */
export class DSAAHeartbeat {
  private config: HeartbeatConfig;
  private heat = 0;
  private elapsed = 0;
  private beatIndex: BeatIndex = 0;
  private cycleCount = 0;
  private durations: Record<Phase, number>;
  private listeners: Array<(p: Progression) => void> = [];

  constructor(config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG) {
    this.config = config;
    this.durations = phaseDurations(0, config);
  }

  /**
   * tick — advance the heartbeat by dt milliseconds at the given signal heat.
   *
   * Recomputes phase durations when heat changes. Advances beat_index when the
   * current phase duration is exhausted. Fires all onProgression listeners.
   * Returns the Progression for this tick.
   */
  tick(dt: number, heat: number): Progression {
    if (heat !== this.heat) {
      this.heat = heat;
      this.durations = phaseDurations(heat, this.config);
    }

    this.elapsed += dt;
    const currentPhase = PHASE_SEQUENCE[this.beatIndex];
    const currentDuration = this.durations[currentPhase];

    if (this.elapsed >= currentDuration) {
      this.elapsed -= currentDuration;
      this.beatIndex = ((this.beatIndex + 1) % 4) as BeatIndex;
      if (this.beatIndex === 0) this.cycleCount++;
      // Recompute durations for the new phase's heat context
      this.durations = phaseDurations(this.heat, this.config);
    }

    const prog = progression(this.pulse(), this.config);
    this.listeners.forEach((cb) => cb(prog));
    return prog;
  }

  /**
   * pulse — current instantaneous Pulse without advancing time.
   */
  pulse(): Pulse {
    const phase = PHASE_SEQUENCE[this.beatIndex];
    const duration = this.durations[phase];
    const beat_position = duration > 0 ? Math.min(1, this.elapsed / duration) : 0;
    return {
      beat_index: this.beatIndex,
      phase,
      beat_position,
      swing_offset: swingDisplacement(phase, beat_position, this.config.swing),
      tempo: effectiveTempo(this.heat, this.config),
      cycle: this.cycleCount,
      heat: this.heat,
    };
  }

  /**
   * progression — current Progression arc without advancing time.
   *
   * Identical to the pure `progression()` function applied to the current pulse.
   */
  progression(): Progression {
    return progression(this.pulse(), this.config);
  }

  /**
   * sync — lock the heartbeat to an externally emitted Pulse.
   *
   * Called when the bridge delivers a Pulse from the agent's session, so the
   * field's rhythm stays phase-aligned with the agent's actual work cadence.
   */
  sync(external: Pulse): void {
    this.beatIndex = external.beat_index;
    this.heat = external.heat;
    this.cycleCount = external.cycle;
    this.durations = phaseDurations(this.heat, this.config);
    this.elapsed = external.beat_position * this.durations[external.phase];
  }

  /**
   * onProgression — subscribe to progression events fired on every tick.
   *
   * Returns an unsubscribe function. Clean up in field teardown.
   *
   * Example:
   *   const unsub = heartbeat.onProgression(p => {
   *     if (p.from === "emit" && p.to === "rest") triggerBlockFadeOut();
   *   });
   */
  onProgression(cb: (p: Progression) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }

  /**
   * reset — return to cycle zero. Used on session re-init.
   */
  reset(): void {
    this.heat = 0;
    this.elapsed = 0;
    this.beatIndex = 0;
    this.cycleCount = 0;
    this.durations = phaseDurations(0, this.config);
  }
}

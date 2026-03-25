#version 300 es
precision highp float;

// ── Vertex Attributes (per-candidate) ───────────────────────────────
// Source: eligibility-server/src/pipeline.ts, evolution.ts

in vec2 a_position;           // x=overall score, y=dominant dimension score (pipeline.ts:219-256)
in float a_weightRaw;         // AnalogWeight.weightRaw avg per candidate (pipeline.ts:167-171)
in float a_runtimeInfluence;  // AnalogWeight.runtimeInfluence (pipeline.ts:166)
in float a_weightBand;        // WeightBand encoded: trace=0, steady=1, elevated=2, dominant=3 (pipeline.ts:116-121)
in float a_conditionSeverity; // ConditionSeverity: info=0, watch=1, priority=2 (pipeline.ts:269-325)
in float a_promotionPassed;   // PromotionGateResult.passed (0.0 or 1.0) (evolution.ts:599-664)
in float a_fnvNoise;          // stableFraction(seed, candidateId) via fnv1a (pipeline.ts:79-89)
in vec4 a_dimensionScores;    // [governance, usability, integration, observability] (pipeline.ts:191-217)
in float a_opFitScore;        // operational_fit dimension score (pipeline.ts:191-217)

// ── Uniforms (global state) ─────────────────────────────────────────

uniform float u_time;           // requestAnimationFrame elapsed seconds
uniform int u_beat;             // CycleBeat: map=0, balance=1, tighten=2, verify=3 (types.ts:190)
uniform float u_sidewalkDrift;  // MomentumFrame.sidewalkDrift (evolution.ts:397-403)
uniform float u_momentum;       // MomentumFrame.momentum (evolution.ts:389-395)
uniform float u_acceleration;   // MomentumFrame.acceleration (evolution.ts:379-386)
uniform int u_cbState;          // CircuitState: CLOSED=0, OPEN=1, HALF_OPEN=2
uniform vec2 u_resolution;      // Canvas width/height
uniform vec4 u_argBiases;       // [governance, usability, integration, observability] args (pipeline.ts:74-77)
uniform float u_opFitBias;      // args.operationalFit (pipeline.ts:75)

// ── Varyings ────────────────────────────────────────────────────────

out float v_weightRaw;
out float v_weightBand;
out float v_conditionSeverity;
out float v_promotionPassed;
out float v_fnvNoise;
out vec4 v_dimensionScores;
out float v_opFitScore;
out float v_runtimeInfluence;

// ── FNV1a hash (pipeline.ts:79-86) ─────────────────────────────────
// Constants: offset_basis = 2166136261, prime = 16777619

uint fnv1a_hash(uint seed, uint salt) {
  uint hash = 2166136261u;
  hash ^= seed & 0xFFu;
  hash *= 16777619u;
  hash ^= (seed >> 8u) & 0xFFu;
  hash *= 16777619u;
  hash ^= salt & 0xFFu;
  hash *= 16777619u;
  hash ^= (salt >> 8u) & 0xFFu;
  hash *= 16777619u;
  return hash;
}

void main() {
  // Pass attributes to fragment shader
  v_weightRaw = a_weightRaw;
  v_weightBand = a_weightBand;
  v_conditionSeverity = a_conditionSeverity;
  v_promotionPassed = a_promotionPassed;
  v_fnvNoise = a_fnvNoise;
  v_dimensionScores = a_dimensionScores;
  v_opFitScore = a_opFitScore;
  v_runtimeInfluence = a_runtimeInfluence;

  // ── Power-law weighting (pipeline.ts:231) ─────────────────────────
  // score * pow(argBias, 1.35) — same exponent as rankOverallSlices
  float govWeight = a_dimensionScores.x * pow(u_argBiases.x, 1.35);
  float usaWeight = a_dimensionScores.y * pow(u_argBiases.y, 1.35);
  float intWeight = a_dimensionScores.z * pow(u_argBiases.z, 1.35);
  float obsWeight = a_dimensionScores.w * pow(u_argBiases.w, 1.35);
  float opfWeight = a_opFitScore * pow(u_opFitBias, 1.35);
  float totalBias = pow(u_argBiases.x, 1.35) + pow(u_argBiases.y, 1.35)
                  + pow(u_argBiases.z, 1.35) + pow(u_argBiases.w, 1.35)
                  + pow(u_opFitBias, 1.35);
  float weightedOverall = (govWeight + usaWeight + intWeight + obsWeight + opfWeight) / max(totalBias, 0.001);

  // ── Base position from score data ─────────────────────────────────
  float x = a_position.x * 2.0 - 1.0;  // overall score → NDC
  float y = a_position.y * 2.0 - 1.0;  // dominant dimension score → NDC

  // ── Beat-driven layout ────────────────────────────────────────────
  // u_beat alters vertex spread: map=wide scatter, balance=clustered, tighten=compressed, verify=grid
  float scatter = 1.0;
  if (u_beat == 0) {
    // map: wide scatter — exploration phase
    scatter = 0.85;
    x += a_fnvNoise * 0.3 - 0.15;
    y += fract(a_fnvNoise * 7.31) * 0.3 - 0.15;
  } else if (u_beat == 1) {
    // balance: clustered around weighted center
    scatter = 0.65;
    x = mix(x, weightedOverall * 2.0 - 1.0, 0.3);
    y = mix(y, 0.0, 0.2);
  } else if (u_beat == 2) {
    // tighten: compressed band
    scatter = 0.45;
    x = mix(x, weightedOverall * 2.0 - 1.0, 0.5);
    y *= 0.5;
  } else if (u_beat == 3) {
    // verify: grid arrangement
    scatter = 0.35;
    float gridId = a_fnvNoise * 16.0;
    float col = mod(floor(gridId), 4.0);
    float row = floor(gridId / 4.0);
    x = mix(x, (col / 3.0) * 2.0 - 1.0, 0.6);
    y = mix(y, (row / 3.0) * 2.0 - 1.0, 0.6);
  }

  // ── Sidewalk drift (evolution.ts:397-403) ─────────────────────────
  // Applied as lateral displacement proportional to drift magnitude
  x += u_sidewalkDrift * 0.15 * sin(u_time * 1.5 + a_fnvNoise * 6.28);

  // ── Momentum oscillation (evolution.ts:389-395) ───────────────────
  // sin(u_time * u_acceleration) modulates vertex oscillation amplitude
  float oscillation = sin(u_time * max(u_acceleration, 0.1) * 3.0) * u_momentum * 0.08;
  y += oscillation;

  // Scale to fit canvas with padding
  x *= scatter * 0.8;
  y *= scatter * 0.8;

  gl_Position = vec4(x, y, 0.0, 1.0);

  // ── gl_PointSize: scaled by runtimeInfluence (range 8.0–32.0) ─────
  float baseSize = mix(8.0, 32.0, clamp(a_runtimeInfluence - 0.5, 0.0, 1.0));
  float bandBoost = a_weightBand * 2.0;
  gl_PointSize = clamp(baseSize + bandBoost, 8.0, 32.0);
}

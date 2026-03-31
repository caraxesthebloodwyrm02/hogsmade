#version 300 es
precision highp float;

// ── Varyings from vertex shader ─────────────────────────────────────

in float v_weightRaw;
in float v_weightBand;
in float v_conditionSeverity;
in float v_promotionPassed;
in float v_fnvNoise;
in vec4 v_dimensionScores;
in float v_opFitScore;
in float v_runtimeInfluence;

// ── Uniforms ────────────────────────────────────────────────────────

uniform float u_time;
uniform int u_beat;
uniform int u_cbState;        // CircuitState: CLOSED=0, OPEN=1, HALF_OPEN=2
uniform vec2 u_resolution;
uniform sampler2D u_residueTex;  // 8x1 RGBA texture encoding ResidueStack deposits
uniform vec4 u_promotionThresholds; // [overall=0.68, governance=0.62, integration=0.64, drift=0.35]

out vec4 fragColor;

// ── WeightBand luminance gradient (pipeline.ts:116-121) ─────────────
// 4-stop color: trace=dark, steady=mid, elevated=bright, dominant=gold
// trace < 0.35, steady 0.35-0.6, elevated 0.6-0.8, dominant >= 0.8

vec3 bandColor(float band) {
  // trace=0: deep indigo (low luminance 0.15)
  vec3 traceColor = vec3(0.12, 0.08, 0.22);
  // steady=1: teal-blue (luminance 0.42-0.65)
  vec3 steadyColor = vec3(0.15, 0.55, 0.58);
  // elevated=2: warm amber (luminance 0.72-0.55)
  vec3 elevatedColor = vec3(0.78, 0.56, 0.18);
  // dominant=3: bright gold (luminance 1.0-0.3)
  vec3 dominantColor = vec3(1.0, 0.85, 0.3);

  if (band < 0.5) return traceColor;
  if (band < 1.5) return mix(traceColor, steadyColor, band);
  if (band < 2.5) return mix(steadyColor, elevatedColor, band - 1.0);
  return mix(elevatedColor, dominantColor, clamp(band - 2.0, 0.0, 1.0));
}

// ── Residue texture sampling ────────────────────────────────────────
// texture(u_residueTex, vec2(passIndex/8.0, 0.5)) modulates brightness per-pass
// Uses the red channel as brightness multiplier (0..1)

float residueBrightness() {
  float totalBrightness = 0.0;
  for (int i = 0; i < 8; i++) {
    float u = (float(i) + 0.5) / 8.0;
    vec4 sample_ = texture(u_residueTex, vec2(u, 0.5));
    totalBrightness += sample_.r;
  }
  return clamp(totalBrightness / 8.0, 0.2, 1.0);
}

void main() {
  // ── Point-space circular mask ───────────────────────────────────────
  // Discard fragments outside radius for clean point rendering
  vec2 pointCoord = gl_PointCoord * 2.0 - 1.0;
  float dist = length(pointCoord);
  if (dist > 1.0) discard;

  // ── Base color from weight band ───────────────────────────────────
  vec3 color = bandColor(v_weightBand);

  // ── Residue modulation ────────────────────────────────────────────
  float resBright = residueBrightness();
  color *= mix(0.7, 1.0, resBright);

  // ── Runtime influence brightness boost ────────────────────────────
  color *= mix(0.8, 1.2, clamp(v_runtimeInfluence - 0.5, 0.0, 1.0));

  // ── Soft circular falloff ─────────────────────────────────────────
  float alpha = 1.0 - smoothstep(0.6, 1.0, dist);

  // ── Condition severity halos (pipeline.ts:269-325) ────────────────
  // governance < 0.58 → priority halo (red pulse, sin(u_time * 6.0))
  // usability < 0.58 → watch halo (amber pulse, sin(u_time * 3.0))
  // observability < 0.6 → watch halo
  // overall >= 0.74 → info bloom

  if (v_conditionSeverity > 1.5) {
    // priority: red pulse ring
    float pulse = 0.5 + 0.5 * sin(u_time * 6.0);
    float ring = smoothstep(0.55, 0.65, dist) * (1.0 - smoothstep(0.85, 1.0, dist));
    color = mix(color, vec3(0.9, 0.15, 0.15), ring * pulse);
    alpha = max(alpha, ring * pulse * 0.8);
  } else if (v_conditionSeverity > 0.5) {
    // watch: amber pulse ring
    float pulse = 0.5 + 0.5 * sin(u_time * 3.0);
    float ring = smoothstep(0.6, 0.7, dist) * (1.0 - smoothstep(0.85, 1.0, dist));
    color = mix(color, vec3(0.95, 0.7, 0.1), ring * pulse);
    alpha = max(alpha, ring * pulse * 0.6);
  }

  // ── Overall score info bloom (pipeline.ts:312) ────────────────────
  // overall >= 0.74 → soft bright bloom
  float overallScore = (v_dimensionScores.x + v_dimensionScores.y + v_dimensionScores.z + v_dimensionScores.w + v_opFitScore) / 5.0;
  if (overallScore >= 0.74) {
    float bloom = 0.3 + 0.15 * sin(u_time * 2.0);
    color += bloom * vec3(0.2, 0.35, 0.25);
  }

  // ── Specific dimension threshold checks (pipeline.ts:279, 290, 301)
  // governance < 0.58 → priority tint on core
  if (v_dimensionScores.x < 0.58) {
    color = mix(color, vec3(0.85, 0.2, 0.15), 0.15 * (1.0 - dist));
  }
  // usability < 0.58 → watch tint
  if (v_dimensionScores.y < 0.58) {
    color = mix(color, vec3(0.9, 0.65, 0.1), 0.1 * (1.0 - dist));
  }
  // observability < 0.6 → watch tint
  if (v_dimensionScores.w < 0.6) {
    color = mix(color, vec3(0.7, 0.5, 0.1), 0.08 * (1.0 - dist));
  }

  // ── Promotion bloom/invert (evolution.ts:644) ─────────────────────
  if (v_promotionPassed > 0.5) {
    // Passed: high-luminance rim bloom
    float rim = smoothstep(0.5, 0.8, dist) * (1.0 - smoothstep(0.9, 1.0, dist));
    color += rim * vec3(0.3, 0.8, 0.4);
    alpha = max(alpha, rim * 0.7);
  } else if (v_promotionPassed < -0.5) {
    // Explicitly denied: hue invert (1.0 - rgb)
    color = 1.0 - color;
  }

  // ── Circuit breaker overlay ───────────────────────────────────────
  // CB OPEN (1) → red overlay forces fragment toward vec3(0.8, 0.1, 0.1)
  // CB HALF_OPEN (2) → dithered checkerboard pattern
  if (u_cbState == 1) {
    // OPEN: hard red overlay
    color = mix(color, vec3(0.8, 0.1, 0.1), 0.7);
    alpha *= 0.85;
  } else if (u_cbState == 2) {
    // HALF_OPEN: dithered checkerboard via mod(gl_FragCoord.x + gl_FragCoord.y, 2.0)
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    if (checker < 0.5) {
      alpha *= 0.4;
    }
    color = mix(color, vec3(0.9, 0.6, 0.1), 0.3);
  }

  // ── FNV noise subtle variation ────────────────────────────────────
  color += (v_fnvNoise - 0.5) * 0.06;

  // Clamp final color
  color = clamp(color, 0.0, 1.0);

  fragColor = vec4(color, alpha);
}

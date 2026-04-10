/**
 * Atlas Token Bridge
 *
 * Connects eligibility-server domain types to the Atlas token vocabulary.
 * Follows the existing memo pattern: ConditionNote (struggle vectors) +
 * ObservationNote (surface hints) + MomentumFrame (growth trajectory).
 *
 * Token source: canopy/echoes/docs/atlas-theme-tokens.json (8 groups)
 * Transport codemap: eligibility-server/6_transport_dimensions.md (6 traces)
 * Memo pattern: pipeline.ts deriveConditions/deriveObservations, evolution.ts buildMomentum
 */

import type { WeightBand, CycleStatus, EndpointStatus, ConditionSeverity } from "./types.js";

// ── Token group identifiers ──

export type AtlasTokenGroup =
  | "cool"
  | "mood"
  | "state"
  | "mirror"
  | "trace"
  | "memory"
  | "ref-terminal"
  | "consent-presets";

// ── Derived mapping types ──

export type TraceOpacityIndex = 0 | 1 | 2 | 3 | 4;
export type AtlasStateKey = "active" | "dormant" | "transitioning" | "sealed";
export type CoolScaleStep = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type AtlasMoodKey =
  | "enthusiastic"
  | "curious"
  | "supportive"
  | "playful"
  | "focused"
  | "calm"
  | "creative";
export type MemoryRecency = "fresh" | "recent" | "dated" | "aged";
export type ConsentPack = "exploratory" | "restricted";

export type PromotionGateDecision =
  | "allow_promotion"
  | "hold_for_tighten"
  | "return_to_balance"
  | "deny_promotion";

// ── Resolved token ──

export interface ResolvedToken {
  cssVar: string;
  value: string;
  group: AtlasTokenGroup;
}

// ── Token values (from atlas-theme-tokens.json) ──

const MOOD_TOKENS: Record<AtlasMoodKey, ResolvedToken> = {
  enthusiastic: { cssVar: "--atlas-mood-enthusiastic", value: "#c2956b", group: "mood" },
  curious: { cssVar: "--atlas-mood-curious", value: "#a4b5c8", group: "mood" },
  supportive: { cssVar: "--atlas-mood-supportive", value: "#c9ad8e", group: "mood" },
  playful: { cssVar: "--atlas-mood-playful", value: "#d4a87e", group: "mood" },
  focused: { cssVar: "--atlas-mood-focused", value: "#6d7f96", group: "mood" },
  calm: { cssVar: "--atlas-mood-calm", value: "#8a9bb0", group: "mood" },
  creative: { cssVar: "--atlas-mood-creative", value: "#a8886a", group: "mood" },
};

const COOL_SCALE: Record<CoolScaleStep, string> = {
  100: "#e8eef5",
  200: "#c8d4e0",
  300: "#a4b5c8",
  400: "#8a9bb0",
  500: "#6d7f96",
  600: "#526073",
  700: "#3d4b5a",
  800: "#2a3540",
  900: "#1a2430",
};

const TRACE_OPACITY: Record<TraceOpacityIndex, number> = {
  0: 1,
  1: 0.75,
  2: 0.55,
  3: 0.35,
  4: 0.18,
};

const MEMORY_COLORS: Record<MemoryRecency, string> = {
  fresh: "#c8d4e0",
  recent: "#8a9bb0",
  dated: "#526073",
  aged: "#3d4b5a",
};

// ── Bridge implementation ──

export function weightBandToOpacity(band: WeightBand): TraceOpacityIndex {
  switch (band) {
    case "dominant":
      return 0;
    case "elevated":
      return 1;
    case "steady":
      return 3;
    case "trace":
      return 4;
  }
}

export function cycleStatusToState(status: CycleStatus): AtlasStateKey {
  switch (status) {
    case "active":
      return "active";
    case "promotion_pending":
      return "transitioning";
    case "promoted":
      return "sealed";
    case "returned":
      return "dormant";
    case "archived":
      return "dormant";
  }
}

export function gateDecisionToCool(decision: PromotionGateDecision): CoolScaleStep {
  switch (decision) {
    case "allow_promotion":
      return 100;
    case "hold_for_tighten":
      return 400;
    case "return_to_balance":
      return 600;
    case "deny_promotion":
      return 900;
  }
}

export function moodToToken(mood: AtlasMoodKey): ResolvedToken {
  return MOOD_TOKENS[mood];
}

export function timestampToRecency(timestamp: string, now?: string): MemoryRecency {
  const ts = new Date(timestamp).getTime();
  const ref = now ? new Date(now).getTime() : Date.now();
  const hoursAgo = (ref - ts) / (1000 * 60 * 60);
  if (hoursAgo < 1) return "fresh";
  if (hoursAgo < 24) return "recent";
  if (hoursAgo < 168) return "dated";
  return "aged";
}

export function endpointStatusToConsent(status: EndpointStatus): ConsentPack {
  return status === "ready" || status === "verified" ? "exploratory" : "restricted";
}

// ── Memo-pattern bridge: condition severity → trace opacity ──

export function conditionSeverityToOpacity(severity: ConditionSeverity): TraceOpacityIndex {
  switch (severity) {
    case "priority":
      return 0;
    case "watch":
      return 2;
    case "info":
      return 4;
  }
}

// ── Momentum → state: sidewalkDrift determines visual urgency ──

export function momentumDriftToState(sidewalkDrift: number): AtlasStateKey {
  if (sidewalkDrift >= 0.55) return "sealed";
  if (sidewalkDrift >= 0.35) return "transitioning";
  if (sidewalkDrift >= 0.15) return "active";
  return "dormant";
}

// ── Resolve helpers ──

export function resolveCoolStep(step: CoolScaleStep): ResolvedToken {
  return {
    cssVar: `--atlas-cool-${step}`,
    value: COOL_SCALE[step],
    group: "cool",
  };
}

export function resolveTraceOpacity(index: TraceOpacityIndex): ResolvedToken {
  return {
    cssVar: `--atlas-trace-opacity-${index}`,
    value: String(TRACE_OPACITY[index]),
    group: "trace",
  };
}

export function resolveMemoryRecency(recency: MemoryRecency): ResolvedToken {
  return {
    cssVar: `--atlas-memory-${recency}`,
    value: MEMORY_COLORS[recency],
    group: "memory",
  };
}

// ── Angular attention ─────────────────────────────────────────────────────────
//
// Transformer-inspired geometric sort. Each attention head (preset) defines
// an angular tolerance window. Entities within the window "attend" to each
// other — closer in θ = stronger attention score.
//
// Query = entity being evaluated
// Key   = sibling entities in the angular map
// Value = (G, score, layer) coordinates
// Head  = preset with angular tolerance (local attention window)

export const LAYER_LABELS: Record<number, string> = {
  0: "collective",
  1: "context",
  2: "agentic",
  3: "hierarchy",
};

export interface EntityPoint {
  entityId: string;
  g: number;
  score: number;
  layer: number;
}

export interface ArcSlice {
  layer: number;
  label: string;
  points: EntityPoint[];
  thetaMin: number;
  thetaMax: number;
  arcWidth: number;
  description: string;
}

export interface AttentionHead {
  name: string;
  depth: number;
  angularTolerance: number;
  distanceRadius: number;
}

export const ATTENTION_HEADS: Record<string, AttentionHead> = {
  sentinel: { name: "sentinel", depth: 1, angularTolerance: 5, distanceRadius: 0.1 },
  watchman: { name: "watchman", depth: 2, angularTolerance: 15, distanceRadius: 0.35 },
  explorer: { name: "explorer", depth: 3, angularTolerance: 30, distanceRadius: 0.6 },
  open: { name: "open", depth: 5, angularTolerance: 90, distanceRadius: 1.0 },
};

// ── Angular computation ──

export function theta(p: EntityPoint): number {
  return (Math.atan2(p.score, p.g) * 180) / Math.PI;
}

export function radius(p: EntityPoint): number {
  return Math.hypot(p.g, p.score);
}

export function angularDistance(a: EntityPoint, b: EntityPoint): number {
  return Math.abs(theta(a) - theta(b));
}

export function pythagoreanDistance(a: EntityPoint, b: EntityPoint): number {
  return Math.hypot(a.g - b.g, a.score - b.score);
}

// ── Sort + cluster ──

export function sortByAngle(points: EntityPoint[]): EntityPoint[] {
  return [...points].sort((a, b) => theta(a) - theta(b));
}

export function clusterByRadius(points: EntityPoint[], r: number): EntityPoint[][] {
  const sorted = sortByAngle(points);
  const assigned = new Set<string>();
  const clusters: EntityPoint[][] = [];

  for (const anchor of sorted) {
    if (assigned.has(anchor.entityId)) continue;
    const group: EntityPoint[] = [anchor];
    assigned.add(anchor.entityId);
    for (const candidate of sorted) {
      if (assigned.has(candidate.entityId)) continue;
      if (pythagoreanDistance(anchor, candidate) <= r) {
        group.push(candidate);
        assigned.add(candidate.entityId);
      }
    }
    clusters.push(group);
  }

  return clusters;
}

export function arcsPerLayer(points: EntityPoint[]): ArcSlice[] {
  const byLayer = new Map<number, EntityPoint[]>();
  for (const p of points) {
    const arr = byLayer.get(p.layer) ?? [];
    arr.push(p);
    byLayer.set(p.layer, arr);
  }

  const arcs: ArcSlice[] = [];
  for (const [layerIdx, layerPoints] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = sortByAngle(layerPoints);
    const thetas = sorted.map(theta);
    const thetaMin = Math.min(...thetas);
    const thetaMax = Math.max(...thetas);
    const arcWidth = thetaMax - thetaMin;
    const dominant = sorted.reduce((best, p) => (radius(p) > radius(best) ? p : best));
    const label = LAYER_LABELS[layerIdx] ?? `layer-${layerIdx}`;

    arcs.push({
      layer: layerIdx,
      label,
      points: sorted,
      thetaMin,
      thetaMax,
      arcWidth,
      description:
        `${sorted.length} entities, ${arcWidth.toFixed(1)}° arc, ` +
        `dominant: ${dominant.entityId} (r=${radius(dominant).toFixed(3)})`,
    });
  }

  return arcs;
}

// ── Attention ──

export function attentionScore(query: EntityPoint, key: EntityPoint, head: AttentionHead): number {
  const dist = angularDistance(query, key);
  if (dist >= head.angularTolerance) return 0;
  return 1 - dist / head.angularTolerance;
}

export function attend(
  query: EntityPoint,
  keys: EntityPoint[],
  head: AttentionHead,
): { point: EntityPoint; score: number }[] {
  return keys
    .map((key) => ({ point: key, score: attentionScore(query, key, head) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

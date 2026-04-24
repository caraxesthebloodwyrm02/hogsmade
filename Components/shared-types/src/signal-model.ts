/**
 * Signal Model — Canonical token weights, zone multipliers, and compute functions.
 * This is the "Seven Wonders" anchor for the Mangrove ecosystem.
 */

export type TokenType =
  | "transistor"
  | "decorated_var"
  | "ambient"
  | "anomaly"
  | "gate_armed"
  | "gate_unarmed";

export const TOKEN_TYPE_WEIGHTS: Record<TokenType, number> = {
  transistor: 1.0,
  gate_armed: 0.9,
  decorated_var: 0.72,
  ambient: 0.45,
  anomaly: 0.15,
  gate_unarmed: 0.1,
};

export type QuantizationZone = "buildup" | "silence" | "drop";

// silence kills all signal; drop fires at full intensity; buildup is step-ramped (0.1→0.7)
export const ZONE_MULTIPLIERS: Partial<Record<QuantizationZone, number>> = {
  silence: 0.0,
  drop: 1.0,
};

/**
 * Calculate the zone multiplier for a specific step in the cycle.
 * Buildup: linear ramp from 0.1 at step 0 to 0.7 at step 43.
 */
export function zoneMultiplierForStep(zone: QuantizationZone, cycleIndex: number): number {
  if (zone === "silence") return 0.0;
  if (zone === "drop") return 1.0;
  // buildup: linear ramp from 0.1 at step 0 to 0.7 at step 43
  return 0.1 + (Math.min(cycleIndex, 43) / 43) * 0.6;
}

export type StabilityClassification = "HIGH" | "MED" | "LOW";

/**
 * Classify signal stability based on strength thresholds.
 */
export function classifyStability(signalStrength: number): StabilityClassification {
  if (signalStrength > 0.6) return "HIGH";
  if (signalStrength > 0.3) return "MED";
  return "LOW";
}

export interface SignalComputeInput {
  activeTokenTypes: TokenType[];
  momentum: number;
  score: number;
  zoneMultiplier: number;
  anomalyDrift: number;
}

export interface SignalComputeResult {
  totalWeight: number;
  tokenCount: number;
  dominantTokenType: TokenType;
  signalStrength: number;
  transformRate: number;
  stability: StabilityClassification;
}

/**
 * The canonical signal strength formula.
 * strength = (avgWeight) * momentum * score * zoneMultiplier * (1 - anomalyDrift * 0.5)
 */
export function computeSignalStrength(input: SignalComputeInput): SignalComputeResult {
  const { activeTokenTypes, momentum, score, zoneMultiplier, anomalyDrift } = input;
  const tokenCount = activeTokenTypes.length || 1;
  const totalWeight = activeTokenTypes.reduce((sum, t) => sum + TOKEN_TYPE_WEIGHTS[t], 0);

  const dominantTokenType =
    activeTokenTypes.reduce(
      (best, t) => (TOKEN_TYPE_WEIGHTS[t] > TOKEN_TYPE_WEIGHTS[best] ? t : best),
      activeTokenTypes[0] ?? "ambient",
    ) ?? "ambient";

  const signalStrength = Math.min(
    1,
    (totalWeight / tokenCount) * momentum * score * zoneMultiplier * (1 - anomalyDrift * 0.5),
  );

  const transformRate = momentum * score * (1 - anomalyDrift);
  const stability = classifyStability(signalStrength);

  return {
    totalWeight,
    tokenCount,
    dominantTokenType,
    signalStrength,
    transformRate,
    stability,
  };
}

/**
 * Compute the barter exchange rate between two token types.
 */
export function computeBarterRate(
  targetType: TokenType,
  dominantType: TokenType,
  transformRate: number,
): number {
  return (TOKEN_TYPE_WEIGHTS[targetType] / TOKEN_TYPE_WEIGHTS[dominantType]) * transformRate;
}

export interface BarterRecord {
  timestamp: string;
  entityId?: string;
  scenarioId?: string;
  dominantTokenType: TokenType;
  targetTokenType: TokenType;
  dominantWeight: number;
  targetWeight: number;
  transformRate: number;
  barterExchangeRate: number;
  signalStrength: number;
  stability: StabilityClassification;
  anomalyDrift: number;
  zoneMultiplier: number;
}

/**
 * Build a BarterRecord for the ledger.
 */
export function buildBarterRecord(
  result: SignalComputeResult,
  targetType: TokenType,
  zoneMultiplier: number,
  anomalyDrift: number,
  opts?: { entityId?: string; scenarioId?: string },
): BarterRecord {
  const barterExchangeRate = computeBarterRate(
    targetType,
    result.dominantTokenType,
    result.transformRate,
  );

  return {
    timestamp: new Date().toISOString(),
    entityId: opts?.entityId,
    scenarioId: opts?.scenarioId,
    dominantTokenType: result.dominantTokenType,
    targetTokenType: targetType,
    dominantWeight: TOKEN_TYPE_WEIGHTS[result.dominantTokenType],
    targetWeight: TOKEN_TYPE_WEIGHTS[targetType],
    transformRate: result.transformRate,
    barterExchangeRate,
    signalStrength: result.signalStrength,
    stability: result.stability,
    anomalyDrift,
    zoneMultiplier,
  };
}

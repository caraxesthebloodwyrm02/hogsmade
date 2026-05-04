import type { BridgeSignals, BridgeHotThreshold } from "../../../bridge/schema";

export function computeSignalHeat(signals: BridgeSignals, ht: BridgeHotThreshold): number {
  const normIter = Math.min(1, (signals.iteration_count ?? 0) / ht.iteration_count);
  const normDiff = Math.min(1, (signals.git_diff_lines ?? 0) / ht.git_diff_lines);
  const normAge = Math.min(1, (signals.session_age_minutes ?? 0) / ht.session_age_minutes);
  return Math.max(normIter, normDiff, normAge);
}

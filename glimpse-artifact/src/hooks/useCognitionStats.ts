import type { CognitionPattern } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

export interface UseCognitionStatsResult {
  patterns: CognitionPattern[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MOCK_PATTERNS: CognitionPattern[] = [
  { name: "Flow", activation: 0.82, recentQueries: 47 },
  { name: "Spatial", activation: 0.65, recentQueries: 31 },
  { name: "Rhythm", activation: 0.48, recentQueries: 22 },
  { name: "Color", activation: 0.33, recentQueries: 15 },
  { name: "Repetition", activation: 0.71, recentQueries: 38 },
  { name: "Deviation", activation: 0.56, recentQueries: 26 },
  { name: "Cause", activation: 0.89, recentQueries: 52 },
  { name: "Time", activation: 0.74, recentQueries: 41 },
  { name: "Combination", activation: 0.42, recentQueries: 19 },
];

export function useCognitionStats(): UseCognitionStatsResult {
  // TODO(K1): Replace `mock` with `fetcher` calling GRID Mothership /cognition/stats
  const { data: patterns, loading, error, retry } = useDataSource<CognitionPattern[]>({
    mock: MOCK_PATTERNS,
  });

  return { patterns, loading, error, retry };
}

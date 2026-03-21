import type { Experiment } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

interface UseExperimentsResult {
  experiments: Experiment[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MOCK_EXPERIMENTS: Experiment[] = [
  {
    id: "exp-1",
    name: "Adaptive briefing tone",
    status: "completed",
    metric: "User engagement score",
    baselineValue: 6.2,
    currentValue: 7.8,
    startedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    completedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "exp-2",
    name: "Health threshold tuning",
    status: "running",
    metric: "False alert rate",
    baselineValue: 12.5,
    currentValue: 8.1,
    startedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "exp-3",
    name: "Audit deduplication",
    status: "queued",
    metric: "Duplicate event ratio",
    baselineValue: 4.3,
    currentValue: 4.3,
    startedAt: new Date().toISOString(),
  },
];

export function useExperiments(): UseExperimentsResult {
  // TODO(D3): Replace `mock` with `fetcher` calling lots-server
  const { data: experiments, loading, error, retry } = useDataSource<Experiment[]>({
    mock: MOCK_EXPERIMENTS,
  });

  return { experiments, loading, error, retry };
}

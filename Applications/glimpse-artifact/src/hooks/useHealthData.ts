import type { HealthScore } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

interface UseHealthDataResult {
  data: HealthScore[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MOCK_HEALTH: HealthScore[] = [
  { repoName: "GRID-main", score: 92, label: "Healthy", trend: "up" },
  { repoName: "glimpse-artifact", score: 78, label: "Good", trend: "stable" },
  { repoName: "afloat-server", score: 85, label: "Healthy", trend: "up" },
  { repoName: "echoes-server", score: 88, label: "Healthy", trend: "stable" },
  { repoName: "pulse-server", score: 90, label: "Healthy", trend: "up" },
  {
    repoName: "seeds-server",
    score: 72,
    label: "Needs attention",
    trend: "down",
  },
];

export function useHealthData(): UseHealthDataResult {
  const { data, loading, error, retry } = useDataSource<HealthScore[]>({
    fetcher: async (signal) => {
      const res = await fetch("/api/health/ecosystem", { signal });
      if (!res.ok) throw new Error(`Health fetch failed (${res.status})`);
      return res.json();
    },
    mock: MOCK_HEALTH,
    pollMs: 60_000,
  });

  return { data, loading, error, retry };
}

import type { Experiment } from "@/components/phase4/types";
import { useEffect, useState } from "react";

interface UseExperimentsResult {
  experiments: Experiment[];
  loading: boolean;
  error: string | null;
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
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExperiments(MOCK_EXPERIMENTS);
      setLoading(false);
    }, 200); // Reduced from 700ms for better UX
    return () => clearTimeout(timer);
  }, []);

  return { experiments, loading, error };
}

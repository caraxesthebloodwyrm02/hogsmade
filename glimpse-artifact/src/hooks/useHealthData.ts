import type { HealthScore } from "@/components/phase4/types";
import { useEffect, useState } from "react";

interface UseHealthDataResult {
  data: HealthScore[];
  loading: boolean;
  error: string | null;
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
  const [data, setData] = useState<HealthScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_HEALTH);
      setLoading(false);
    }, 200); // Reduced from 600ms for better UX
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, error };
}

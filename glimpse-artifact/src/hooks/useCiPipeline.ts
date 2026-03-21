import type { PipelinePR } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

export interface UseCiPipelineResult {
  prs: PipelinePR[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MOCK_PRS: PipelinePR[] = [
  {
    id: "pr-101",
    title: "chore(deps): bump vite from 5.0.8 to 5.4.19",
    author: "dependabot[bot]",
    source: "dependabot",
    status: "merged",
    labels: ["dependencies", "auto-merge"],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 43200000).toISOString(),
  },
];

export function useCiPipeline(): UseCiPipelineResult {
  const { data: prs, loading, error, retry } = useDataSource<PipelinePR[]>({
    fetcher: async (signal) => {
      const res = await fetch("/api/pipeline/prs", { signal });
      if (!res.ok) throw new Error(`Pipeline API error: ${res.status}`);
      return (await res.json()) as PipelinePR[];
    },
    mock: MOCK_PRS,
    pollMs: 120_000,
  });

  return { prs, loading, error, retry };
}

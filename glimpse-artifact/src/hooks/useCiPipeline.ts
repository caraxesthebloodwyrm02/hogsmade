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
  {
    id: "pr-102",
    title: "fix(grid-server): GATE nonce expiry edge case",
    author: "caraxes",
    source: "human",
    status: "building",
    labels: ["bug"],
    runnerType: "github",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "pr-103",
    title: "chore(deps): bump @types/node from 20.10.0 to 22.15.21",
    author: "dependabot[bot]",
    source: "dependabot",
    status: "scanning",
    labels: ["dependencies"],
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: "pr-104",
    title: "feat(echoes-server): SSE audit stream endpoint",
    author: "caraxes",
    source: "human",
    status: "fix-queue",
    labels: ["enhancement", "agent:fix"],
    runnerType: "self-hosted",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: "pr-105",
    title: "chore(deps): bump eslint from 8.55.0 to 9.28.0",
    author: "dependabot[bot]",
    source: "dependabot",
    status: "pending",
    labels: ["dependencies"],
    createdAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "pr-106",
    title: "feat(pulse-server): briefing template v2",
    author: "caraxes",
    source: "human",
    status: "merged",
    labels: ["enhancement"],
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

export function useCiPipeline(): UseCiPipelineResult {
  // TODO(P1): Replace `mock` with `fetcher` calling GitHub Actions API (server-side proxy)
  const { data: prs, loading, error, retry } = useDataSource<PipelinePR[]>({
    mock: MOCK_PRS,
  });

  return { prs, loading, error, retry };
}

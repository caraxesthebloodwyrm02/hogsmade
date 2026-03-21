import type { WorkflowRun } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

interface UseFocusSessionResult {
  session: WorkflowRun | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MOCK_SESSION: WorkflowRun = {
  id: "focus-1",
  workflowName: "Phase 4 — Build components",
  status: "running",
  steps: [
    { name: "Design tokens", status: "done", durationMs: 1200000 },
    { name: "Health gauge", status: "done", durationMs: 900000 },
    { name: "Audit timeline", status: "done", durationMs: 1100000 },
    { name: "Experiment card", status: "running" },
    { name: "Canvas scaffold", status: "pending" },
  ],
  startedAt: new Date(Date.now() - 5400000).toISOString(),
  elapsedMs: 5400000,
};

export function useFocusSession(): UseFocusSessionResult {
  // TODO(D4): Replace `mock` with `fetcher` calling pulse-server
  const { data: session, loading, error, retry } = useDataSource<WorkflowRun | null>({
    mock: MOCK_SESSION,
  });

  return { session, loading, error, retry };
}

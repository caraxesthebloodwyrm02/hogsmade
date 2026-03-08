import type { WorkflowRun } from "@/components/phase4/types";
import { useEffect, useState } from "react";

interface UseFocusSessionResult {
  session: WorkflowRun | null;
  loading: boolean;
  error: string | null;
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
  const [session, setSession] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSession(MOCK_SESSION);
      setLoading(false);
    }, 200); // Reduced from 500ms for better UX
    return () => clearTimeout(timer);
  }, []);

  return { session, loading, error };
}

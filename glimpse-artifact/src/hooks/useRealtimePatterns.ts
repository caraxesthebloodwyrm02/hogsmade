import type {
  HybridPatternResult,
  PatternChangeEvent,
  RealtimeAnomaly,
  RealtimePatternState,
} from "@/components/phase4/types";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Configuration for the realtime patterns hook.
 */
export interface RealtimePatternsConfig {
  /** API endpoint for pattern detection (default: /api/patterns/realtime). */
  endpoint?: string;
  /** Polling interval in ms (default: 5000). Set 0 to disable polling. */
  pollMs?: number;
  /** Max anomalies to retain (default: 20). */
  maxAnomalies?: number;
  /** If true, use mock data instead of live API. */
  mock?: boolean;
}

export interface UseRealtimePatternsResult {
  state: RealtimePatternState;
  loading: boolean;
  error: string | null;
  /** Manually trigger a detection cycle. */
  refresh: () => void;
  /** Ingest new records into the realtime pipeline. */
  ingest: (records: Record<string, unknown>[]) => void;
  /** Reset all state (window, patterns, anomalies). */
  reset: () => void;
  /** Whether the pipeline is actively polling. */
  active: boolean;
}

// ─── Mock Data ─────────────────────────────────────────────────────

const MOCK_PATTERNS: HybridPatternResult = {
  statisticalPatterns: ["INCREASING_CONFIDENCE", "DECREASING_GAPCOUNT"],
  syntacticPatterns: ["SYNTACTIC_CAUSAL", "TOPOLOGY_INFLUENCE_DOMINANT"],
  neuralPatterns: ["NEURAL_PATTERN_0"],
  combinedPatterns: [
    "INCREASING_CONFIDENCE",
    "DECREASING_GAPCOUNT",
    "SYNTACTIC_CAUSAL",
    "TOPOLOGY_INFLUENCE_DOMINANT",
    "NEURAL_PATTERN_0",
  ],
  overallConfidence: 0.73,
  confidenceScores: { statistical: 0.78, syntactic: 0.72, neural: 0.69 },
};

const MOCK_STATE: RealtimePatternState = {
  tick: 42,
  windowSize: 50,
  totalIngested: 127,
  patterns: MOCK_PATTERNS,
  lastChange: {
    added: ["INCREASING_CONFIDENCE"],
    removed: [],
    stable: ["SYNTACTIC_CAUSAL", "TOPOLOGY_INFLUENCE_DOMINANT", "NEURAL_PATTERN_0"],
    allPatterns: MOCK_PATTERNS.combinedPatterns,
  },
  anomalies: [],
};

// ─── Hook ──────────────────────────────────────────────────────────

export function useRealtimePatterns(
  config: RealtimePatternsConfig = {},
): UseRealtimePatternsResult {
  const {
    endpoint = "/api/patterns/realtime",
    pollMs = 5_000,
    maxAnomalies = 20,
    mock = false,
  } = config;

  const [state, setState] = useState<RealtimePatternState>({
    tick: 0,
    windowSize: 0,
    totalIngested: 0,
    patterns: null,
    lastChange: null,
    anomalies: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch from realtime API ────────────────────────────────────

  const fetchPatterns = useCallback(async () => {
    if (mock) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      const res = await fetch(endpoint, { signal: controller.signal });
      if (!res.ok) throw new Error(`Pattern API error: ${res.status}`);

      const data = (await res.json()) as {
        tick: number;
        windowSize: number;
        totalIngested: number;
        hybrid: HybridPatternResult;
        change: PatternChangeEvent;
        anomalies?: RealtimeAnomaly[];
      };

      if (!controller.signal.aborted) {
        setState((prev) => ({
          tick: data.tick,
          windowSize: data.windowSize,
          totalIngested: data.totalIngested,
          patterns: data.hybrid,
          lastChange: data.change,
          anomalies: [
            ...(data.anomalies ?? []),
            ...prev.anomalies,
          ].slice(0, maxAnomalies),
        }));
        setError(null);
        setLoading(false);
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      // Fallback to mock on API failure
      setState(MOCK_STATE);
      setError(null);
      setLoading(false);
    }
  }, [endpoint, mock, maxAnomalies]);

  // ── Ingest records (POST to API) ──────────────────────────────

  const ingest = useCallback(
    async (records: Record<string, unknown>[]) => {
      if (mock) {
        // Simulate ingestion with mock data
        setState((prev) => ({
          ...prev,
          tick: prev.tick + 1,
          totalIngested: prev.totalIngested + records.length,
          windowSize: Math.min(prev.windowSize + records.length, 100),
        }));
        return;
      }

      try {
        const res = await fetch(`${endpoint}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
        });
        if (!res.ok) throw new Error(`Ingest error: ${res.status}`);
        // Fetch updated state after ingestion
        await fetchPatterns();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Ingest failed");
      }
    },
    [endpoint, mock, fetchPatterns],
  );

  // ── Reset ─────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState({
      tick: 0,
      windowSize: 0,
      totalIngested: 0,
      patterns: null,
      lastChange: null,
      anomalies: [],
    });
    setError(null);
  }, []);

  // ── Lifecycle: initial fetch + polling ─────────────────────────

  useEffect(() => {
    if (mock) {
      const timer = setTimeout(() => {
        setState(MOCK_STATE);
        setLoading(false);
        setActive(true);
      }, 200);
      return () => clearTimeout(timer);
    }

    fetchPatterns();
    setActive(true);

    if (pollMs > 0) {
      intervalRef.current = setInterval(fetchPatterns, pollMs);
    }

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setActive(false);
    };
  }, [mock, pollMs, fetchPatterns]);

  return {
    state,
    loading,
    error,
    refresh: fetchPatterns,
    ingest,
    reset,
    active,
  };
}

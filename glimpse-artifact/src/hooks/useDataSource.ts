import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared data-fetching primitive for all glimpse-artifact hooks.
 *
 * Supports:
 * - One-shot fetch or interval polling
 * - Abort on unmount / re-fetch
 * - Mock fallback (returns mock data when fetcher is not provided)
 * - Manual retry
 */

export interface DataSourceConfig<T> {
    /** Async function that returns fresh data. Receives an AbortSignal. */
    fetcher?: (signal: AbortSignal) => Promise<T>;
    /** Mock data used when `fetcher` is not provided. */
    mock?: T;
    /** Polling interval in ms. 0 = no polling (default). */
    pollMs?: number;
    /** Simulated loading delay for mock data in ms (default: 200). */
    mockDelayMs?: number;
}

export interface DataSourceResult<T> {
    data: T;
    loading: boolean;
    error: string | null;
    /** Trigger a manual re-fetch. No-op when using mock data. */
    retry: () => void;
}

export function useDataSource<T>(config: DataSourceConfig<T>): DataSourceResult<T> {
    const { fetcher, mock, pollMs = 0, mockDelayMs = 200 } = config;
    const isMock = !fetcher;

    const [data, setData] = useState<T>(() => mock ?? ([] as unknown as T));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Keep a stable ref to the latest fetcher so it doesn't trigger effect re-runs
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const doFetch = useCallback(() => {
        const fn = fetcherRef.current;
        if (!fn) return;

        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        fn(controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) {
                    setData(result);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                const message = err instanceof Error ? err.message : "Unknown error";
                setError(message);
                setLoading(false);
            });
    }, []);

    // Initial fetch (real) or mock simulation
    useEffect(() => {
        if (isMock) {
            const timer = setTimeout(() => {
                if (mock !== undefined) setData(mock);
                setLoading(false);
            }, mockDelayMs);
            return () => clearTimeout(timer);
        }

        doFetch();

        // Set up polling
        if (pollMs > 0) {
            intervalRef.current = setInterval(doFetch, pollMs);
        }

        return () => {
            abortRef.current?.abort();
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isMock, mock, mockDelayMs, doFetch, pollMs]);

    const retry = useCallback(() => {
        if (!isMock) doFetch();
    }, [isMock, doFetch]);

    return { data, loading, error, retry };
}

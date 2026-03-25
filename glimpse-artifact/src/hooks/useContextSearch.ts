import { useCallback, useRef, useState } from "react";
import type { ContextSearchResult } from "@/components/phase4/types";

export interface ContextSearchInput {
    scenarioText: string;
    optionalContext: string;
    optionalProblemFrame: string;
    maxKeywords: number;
    provider: "deterministic" | "openai" | "ollama";
}

export interface UseContextSearchResult {
    result: ContextSearchResult | null;
    loading: boolean;
    error: string | null;
    runSearch: (input: ContextSearchInput) => Promise<void>;
    reset: () => void;
}

export function createDefaultContextSearchInput(): ContextSearchInput {
    return {
        scenarioText: "",
        optionalContext: "",
        optionalProblemFrame: "",
        maxKeywords: 8,
        provider: "deterministic",
    };
}

export function useContextSearch(): UseContextSearchResult {
    const [result, setResult] = useState<ContextSearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const runSearch = useCallback(async (input: ContextSearchInput) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/context-search/interview", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
                signal: controller.signal,
            });

            const payload = await res.json() as ContextSearchResult | { error?: string };
            if (!res.ok) {
                throw new Error("error" in payload && payload.error ? payload.error : `Context search failed (${res.status})`);
            }

            setResult(payload as ContextSearchResult);
        } catch (err) {
            if (controller.signal.aborted) return;
            setError(err instanceof Error ? err.message : "Unknown context search failure");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, []);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setResult(null);
        setLoading(false);
        setError(null);
    }, []);

    return { result, loading, error, runSearch, reset };
}

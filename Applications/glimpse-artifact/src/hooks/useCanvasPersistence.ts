import { useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "glimpse-canvas-state";
const DEBOUNCE_MS = 500;

export interface CanvasPersistedState {
    seeds: unknown[];
    branches: unknown[];
    snapshots: unknown[];
    annotations: unknown[];
    nodes: unknown[];
    edges: unknown[];
    idCounter: number;
}

/**
 * Read saved canvas state from localStorage. Returns null if missing or corrupt.
 */
export function loadCanvasState(): CanvasPersistedState | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Minimal shape check — must have the arrays we expect
        if (
            !Array.isArray(parsed.seeds) ||
            !Array.isArray(parsed.nodes) ||
            typeof parsed.idCounter !== "number"
        ) {
            return null;
        }
        return parsed as CanvasPersistedState;
    } catch {
        return null;
    }
}

/**
 * Debounced auto-save of canvas state to localStorage.
 * Call `save(state)` on every state change — writes are debounced internally.
 */
export function useCanvasPersistence() {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const save = useCallback((state: CanvasPersistedState) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch {
                // Storage full or disabled — silently skip
            }
        }, DEBOUNCE_MS);
    }, []);

    const clear = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    // Flush pending timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return { save, clear };
}

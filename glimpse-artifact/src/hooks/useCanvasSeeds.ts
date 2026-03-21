import type { ScenarioSeed } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

interface RawSeed {
    id: string;
    title: string;
    description: string;
}

const FALLBACK_SEEDS: ScenarioSeed[] = [
    {
        id: "seed-1",
        title: "The letter arrives",
        description:
            "A forgotten letter surfaces in an attic box. The handwriting belongs to someone the protagonist believed dead for twenty years.",
        createdAt: new Date().toISOString(),
    },
    {
        id: "seed-2",
        title: "The storm breaks",
        description:
            "A coastal village loses power during the worst storm in a century. Two strangers shelter in the same lighthouse.",
        createdAt: new Date().toISOString(),
    },
    {
        id: "seed-3",
        title: "The offer",
        description:
            "An anonymous patron offers to fund the protagonist's art exhibition — but only if they destroy their most personal piece.",
        createdAt: new Date().toISOString(),
    },
];

interface UseCanvasSeedsResult {
    seeds: ScenarioSeed[];
    loading: boolean;
    error: string | null;
}

export function useCanvasSeeds(): UseCanvasSeedsResult {
    const { data, loading, error } = useDataSource<ScenarioSeed[]>({
        fetcher: async (signal) => {
            const res = await fetch("/data/seed-templates.json", { signal });
            if (!res.ok) throw new Error(`Seed templates fetch failed (${res.status})`);
            const raw: RawSeed[] = await res.json();
            return raw.map((s) => ({
                ...s,
                createdAt: new Date().toISOString(),
            }));
        },
        mock: FALLBACK_SEEDS,
    });

    return { seeds: data, loading, error };
}

import { useDataSource } from "./useDataSource";

// ── Types ──

export type EcosystemMood = "thriving" | "steady" | "drifting" | "recovering" | "quiet";
export type PulseColor = "teal" | "amber" | "coral";

export interface TrustRelationship {
  observer: string;
  subject: string;
  confidence: number | null;
  basis: { signal: string; weight: number; sentiment: string }[];
}

export interface SessionEntryData {
  /** Overall ecosystem health 0-100 */
  ecosystemScore: number | null;
  /** Trajectory direction */
  direction: "improving" | "stable" | "degrading" | "unknown";
  /** Relational trust narrative */
  trustNarrative: string;
  /** Trust relationships */
  trustRelationships: TrustRelationship[];
  /** Narrative summary (2-3 sentences) */
  narrative: string;
  /** Pulse color for the gradient */
  pulseColor: PulseColor;
  /** Energy reference — song/vibe tag */
  energyTag: string;
  /** Ecosystem mood classification */
  mood: EcosystemMood;
  /** Last position — file/function/thought */
  lastPosition: string | null;
  /** History whisper — one line from the past */
  historyWhisper: string | null;
  /** Cluster summaries */
  clusters: ClusterSummary[];
  /** Drift item count */
  driftCount: number;
  /** Drift severity */
  driftSeverity: string;
}

export interface ClusterSummary {
  id: string;
  label: string;
  health: number;
  trustConfidence: number | null;
  issueCount: number;
}

// ── Energy Palette ──

const ENERGY_MAP: Record<EcosystemMood, string> = {
  thriving: 'Kx5 — "Alive" energy',
  steady: 'deadmau5 — "Strobe" energy',
  drifting: 'Bonobo — "Kerala" energy',
  recovering: "Rezz — deep focus energy",
  quiet: "ambient — lo-fi drift",
};

// ── Mood Derivation ──

function deriveMood(score: number | null, direction: string, driftSeverity: string): EcosystemMood {
  if (score === null) return "quiet";
  if (score >= 80 && direction === "improving") return "thriving";
  if (score >= 70 && driftSeverity === "none") return "steady";
  if (driftSeverity === "high") return "recovering";
  if (direction === "degrading") return "drifting";
  if (score >= 60) return "steady";
  return "recovering";
}

function derivePulseColor(mood: EcosystemMood): PulseColor {
  switch (mood) {
    case "thriving":
    case "steady":
      return "teal";
    case "drifting":
    case "quiet":
      return "amber";
    case "recovering":
      return "coral";
  }
}

// ── Narrative Generation ──

function generateNarrative(
  score: number | null,
  direction: string,
  trustNarrative: string,
  driftCount: number,
): string {
  const parts: string[] = [];

  if (score !== null) {
    if (direction === "improving") {
      parts.push(`Ecosystem rising — score at ${score}.`);
    } else if (direction === "degrading") {
      parts.push(`Ecosystem drifting — score at ${score}.`);
    } else {
      parts.push(`Ecosystem holding at ${score}.`);
    }
  } else {
    parts.push("Ecosystem state unclear — limited data available.");
  }

  if (trustNarrative) {
    parts.push(trustNarrative);
  }

  if (driftCount > 0) {
    parts.push(
      `${driftCount} item${driftCount === 1 ? "" : "s"} need${
        driftCount === 1 ? "s" : ""
      } tending.`,
    );
  }

  return parts.join(" ");
}

// ── Mock Data ──

const MOCK_SESSION_ENTRY: SessionEntryData = {
  ecosystemScore: 82,
  direction: "stable",
  trustNarrative:
    "Grid family is solid at 85% confidence. MCP infrastructure is holding at 72%. The ecosystem is watching itself heal.",
  trustRelationships: [
    { observer: "builder", subject: "grid-family", confidence: 0.85, basis: [] },
    { observer: "builder", subject: "mcp-infrastructure", confidence: 0.72, basis: [] },
    { observer: "builder", subject: "canopy-apps", confidence: 0.78, basis: [] },
    { observer: "ecosystem", subject: "self", confidence: 0.71, basis: [] },
    { observer: "newcomer", subject: "ecosystem", confidence: 0.68, basis: [] },
  ],
  narrative:
    "Ecosystem holding at 82. Grid family is solid at 85% confidence. MCP infrastructure is holding at 72%. 2 items need tending.",
  pulseColor: "teal",
  energyTag: ENERGY_MAP.steady,
  mood: "steady",
  lastPosition: "overview-server/src/trust.ts — relational trust computation",
  historyWhisper:
    "3 weeks ago you wrote the admission gate. Today its fallback caught its first profit-mask signal.",
  clusters: [
    { id: "grid-family", label: "GRID Family", health: 90, trustConfidence: 0.85, issueCount: 0 },
    {
      id: "mcp-infrastructure",
      label: "MCP Infrastructure",
      health: 80,
      trustConfidence: 0.72,
      issueCount: 1,
    },
    { id: "canopy-apps", label: "Canopy Apps", health: 78, trustConfidence: 0.78, issueCount: 0 },
    {
      id: "glimpse-family",
      label: "Glimpse Family",
      health: 75,
      trustConfidence: 0.65,
      issueCount: 0,
    },
    {
      id: "deployment-pipeline",
      label: "Deployment Pipeline",
      health: 60,
      trustConfidence: 0.55,
      issueCount: 2,
    },
    {
      id: "seed-archive",
      label: "Seed & Archive",
      health: 85,
      trustConfidence: 0.8,
      issueCount: 0,
    },
  ],
  driftCount: 2,
  driftSeverity: "moderate",
};

// ── Hook ──

export interface UseSessionEntryResult {
  data: SessionEntryData;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useSessionEntry(): UseSessionEntryResult {
  const { data, loading, error, retry } = useDataSource<SessionEntryData>({
    fetcher: async (signal) => {
      const res = await fetch("/api/session-entry", { signal });
      if (!res.ok) throw new Error(`Session entry fetch failed (${res.status})`);
      const checkpoint = await res.json();
      return transformCheckpoint(checkpoint);
    },
    mock: MOCK_SESSION_ENTRY,
    pollMs: 120_000, // refresh every 2 minutes
  });

  return { data, loading, error, retry };
}

// ── Transform checkpoint response into session entry data ──

function transformCheckpoint(cp: Record<string, unknown>): SessionEntryData {
  const trajectory = cp.trajectory as Record<string, unknown> | undefined;
  const trust = cp.trust as Record<string, unknown> | undefined;
  const drift = cp.drift as Record<string, unknown> | undefined;
  const clusters = (cp.clusters ?? []) as Record<string, unknown>[];

  const ecosystemScore = (trajectory?.ecosystemScore as number) ?? null;
  const direction = (trajectory?.direction as SessionEntryData["direction"]) ?? "unknown";
  const driftCount = (drift?.totalDriftItems as number) ?? 0;
  const driftSeverity = (drift?.severity as string) ?? "none";

  const trustNarrative = (trust?.narrative as string) ?? "";
  const trustRelationships = (trust?.relationships ?? []) as TrustRelationship[];

  const mood = deriveMood(ecosystemScore, direction, driftSeverity);
  const pulseColor = derivePulseColor(mood);
  const energyTag = ENERGY_MAP[mood];

  const clusterSummaries: ClusterSummary[] = clusters.map((c) => {
    const id = c.id as string;
    const builderTrust = trustRelationships.find(
      (r) => r.observer === "builder" && r.subject === id,
    );
    return {
      id,
      label: (c.label as string) ?? id,
      health: (c.clusterHealth as number) ?? 0,
      trustConfidence: builderTrust?.confidence ?? null,
      issueCount: (c.issueCount as number) ?? 0,
    };
  });

  const narrative = generateNarrative(ecosystemScore, direction, trustNarrative, driftCount);

  return {
    ecosystemScore,
    direction,
    trustNarrative,
    trustRelationships,
    narrative,
    pulseColor,
    energyTag,
    mood,
    lastPosition: (cp.lastPosition as string) ?? null,
    historyWhisper: (cp.historyWhisper as string) ?? null,
    clusters: clusterSummaries,
    driftCount,
    driftSeverity,
  };
}

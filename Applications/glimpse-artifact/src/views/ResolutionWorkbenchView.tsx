import { useMemo, useState } from "react";
import { BrainCircuit, Network, Radar, ShieldAlert, Sparkles } from "lucide-react";

import { DataError } from "@/components/phase4/DataError";
import { cn } from "@/lib/utils";

type ResolutionMode =
  | "recognition"
  | "reward"
  | "review"
  | "restriction"
  | "penalty";

interface KeywordTerm {
  canonicalTerm: string;
}

interface ResolutionCandidate {
  id: string;
  label: string;
  endpointType: "mcp_tool" | "http_route" | "file_surface";
  cluster: string;
  filePath: string;
  route?: string;
  score: number;
  confidence: number;
  matchedTerms: string[];
  reasons: string[];
  evidenceRefs: string[];
  recommendedAction: string;
}

interface ResolutionQuestion {
  id: string;
  kind: "focused" | "random";
  question: string;
  rationale: string;
  affects: string[];
}

interface ResolutionNode {
  id: string;
  label: string;
  type: "cluster" | "endpoint";
  cluster?: string;
  score: number;
}

interface ResolutionEdge {
  source: string;
  target: string;
  type: "belongs_to" | "transfer";
  weight: number;
  label?: string;
}

interface ResolutionCluster {
  id: string;
  label: string;
  score: number;
  candidateIds: string[];
  matchedTerms: string[];
}

interface ResolutionHeatmapCell {
  keyword: string;
  clusterId: string;
  score: number;
}

interface ResolutionArtifact {
  id: string;
  title: string;
  kind: "summary" | "candidate_ladder" | "question_queue" | "action_checklist";
  content: string;
  evidenceRefs: string[];
}

interface ResolutionTurn {
  id: string;
  speaker: "planner" | "retriever" | "skeptic" | "synthesizer";
  text: string;
  evidenceRefs: string[];
}

interface ResolutionWorkbenchResult {
  definition: {
    id: string;
    title: string;
    whatItIs: string;
    stageOrder: string[];
  };
  observation: {
    confidenceScore: number;
    confidenceSummary: string;
    ambiguitySummary: string;
    dominantCluster: string | null;
    dominantCandidate: string | null;
    recommendedNextStep: string;
    warnings: string[];
  };
  keywords: {
    accepted: KeywordTerm[];
    unknownTerms: string[];
    rejectedTerms: string[];
  };
  candidates: ResolutionCandidate[];
  graph: {
    nodes: ResolutionNode[];
    edges: ResolutionEdge[];
  };
  clusters: ResolutionCluster[];
  heatmap: ResolutionHeatmapCell[];
  questions: ResolutionQuestion[];
  artifacts: ResolutionArtifact[];
  transcript: ResolutionTurn[];
}

interface GraphLayoutNode extends ResolutionNode {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function layoutGraph(nodes: ResolutionNode[]): GraphLayoutNode[] {
  const clusters = nodes.filter((node) => node.type === "cluster");
  const endpoints = nodes.filter((node) => node.type === "endpoint");
  const width = 820;
  const clusterGap = width / Math.max(clusters.length, 1);
  const laidOut: GraphLayoutNode[] = [];

  clusters.forEach((cluster, index) => {
    laidOut.push({
      ...cluster,
      x: clusterGap * index + clusterGap / 2,
      y: 78,
    });
  });

  const counts = new Map<string, number>();
  for (const endpoint of endpoints) {
    const clusterIndex = Math.max(
      0,
      clusters.findIndex((cluster) => cluster.label === endpoint.cluster),
    );
    const clusterX = clusterGap * clusterIndex + clusterGap / 2;
    const key = endpoint.cluster ?? "root";
    const offset = counts.get(key) ?? 0;
    counts.set(key, offset + 1);

    const direction = offset % 2 === 0 ? -1 : 1;
    const spread = 42 + Math.floor(offset / 2) * 42;

    laidOut.push({
      ...endpoint,
      x: clamp(clusterX + direction * spread, 46, width - 46),
      y: 208 + (offset % 3) * 56,
    });
  }

  return laidOut;
}

function GraphPanel({
  nodes,
  edges,
}: {
  nodes: ResolutionNode[];
  edges: ResolutionEdge[];
}) {
  const layout = useMemo(() => layoutGraph(nodes), [nodes]);
  const nodeMap = useMemo(() => new Map(layout.map((node) => [node.id, node])), [layout]);

  return (
    <svg viewBox="0 0 820 360" className="w-full h-auto" role="img" aria-label="Resolution graph">
      {edges.map((edge, index) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;

        const stroke = edge.type === "transfer" ? "var(--amber-400)" : "var(--teal-500)";
        const dash = edge.type === "transfer" ? "7 4" : undefined;

        return (
          <g key={`${edge.source}-${edge.target}-${index}`}>
            <line
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={stroke}
              strokeOpacity={0.7}
              strokeWidth={edge.type === "belongs_to" ? 1.6 : 1.2}
              strokeDasharray={dash}
            />
            {edge.label ? (
              <text
                x={(source.x + target.x) / 2}
                y={(source.y + target.y) / 2 - 6}
                textAnchor="middle"
                className="fill-ink-muted text-[9px] font-mono"
              >
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {layout.map((node) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.type === "cluster" ? 24 : 14}
            fill={node.type === "cluster" ? "rgba(212, 162, 74, 0.12)" : "rgba(20, 184, 166, 0.12)"}
            stroke={node.type === "cluster" ? "var(--amber-400)" : "var(--teal-500)"}
            strokeWidth={1.5}
          />
          <text
            x={node.x}
            y={node.y + (node.type === "cluster" ? 4 : 3)}
            textAnchor="middle"
            className={cn(
              "fill-ink font-mono",
              node.type === "cluster" ? "text-[10px]" : "text-[9px]",
            )}
          >
            {Math.round(node.score)}
          </text>
          <text
            x={node.x}
            y={node.y + (node.type === "cluster" ? 40 : 28)}
            textAnchor="middle"
            className="fill-ink-muted text-[10px] font-body"
          >
            {node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function HeatmapPanel({
  heatmap,
  clusters,
}: {
  heatmap: ResolutionHeatmapCell[];
  clusters: ResolutionCluster[];
}) {
  const keywords = [...new Set(heatmap.map((cell) => cell.keyword))];
  const maxScore = Math.max(...heatmap.map((cell) => cell.score), 0);

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border-color">
            <th className="text-left py-2 pr-3 font-body text-ink-muted uppercase text-[10px] tracking-[0.08em]">
              Keyword
            </th>
            {clusters.map((cluster) => (
              <th
                key={cluster.id}
                className="text-left py-2 px-2 font-body text-ink-muted uppercase text-[10px] tracking-[0.08em]"
              >
                {cluster.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((keyword) => (
            <tr key={keyword} className="border-b border-border-color/40">
              <td className="py-2 pr-3 font-mono text-ink">{keyword}</td>
              {clusters.map((cluster) => {
                const cell = heatmap.find((entry) => entry.keyword === keyword && entry.clusterId === cluster.id);
                const score = cell?.score ?? 0;
                const intensity = maxScore > 0 ? clamp(score / maxScore, 0, 1) : 0;
                return (
                  <td key={`${keyword}-${cluster.id}`} className="py-2 px-2">
                    <div
                      className="rounded-md px-2 py-1 font-mono text-[11px] text-ink"
                      style={{
                        backgroundColor: `rgba(20, 184, 166, ${0.08 + intensity * 0.35})`,
                      }}
                    >
                      {score > 0 ? score.toFixed(score >= 10 ? 1 : 2) : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DEFAULT_MODE: ResolutionMode = "review";

export function ResolutionWorkbenchView() {
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<ResolutionMode>(DEFAULT_MODE);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResolutionWorkbenchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runResolution(nextAnswers: Record<string, string>) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/resolution-workbench/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          context,
          mode,
          answers: Object.entries(nextAnswers)
            .map(([questionId, answer]) => ({ questionId, answer }))
            .filter((entry) => entry.answer.trim().length > 0),
        }),
      });

      const payload = await res.json() as ResolutionWorkbenchResult | { error?: string };
      if (!res.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : `Resolution failed (${res.status})`);
      }

      setResult(payload as ResolutionWorkbenchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown resolution failure");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <Radar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight" style={{ letterSpacing: "-0.02em" }}>
              Resolution Workbench
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">◎</span> Stream-thread planning, endpoint ranking, and question-driven sharpening.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section className="glass-panel p-5 space-y-4 card-glow animate-fade-slide-up">
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
            <div className="space-y-3">
              <label className="block">
                <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Prompt
                </span>
                <textarea
                  className="mt-2 w-full min-h-[140px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-teal-500"
                  placeholder="Describe the event flow, hidden contribution, corruption signal, or planning problem."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Optional Context
                </span>
                <textarea
                  className="mt-2 w-full min-h-[96px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-teal-500"
                  placeholder="Add stream names, route hints, actor hints, or why this case matters."
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Mode
                </span>
                <select
                  className="mt-2 w-full rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-teal-500"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ResolutionMode)}
                >
                  <option value="recognition">recognition</option>
                  <option value="reward">reward</option>
                  <option value="review">review</option>
                  <option value="restriction">restriction</option>
                  <option value="penalty">penalty</option>
                </select>
              </label>

              <div className="rounded-2xl border border-amber-400/30 bg-[rgba(212,162,74,0.08)] p-4 space-y-2">
                <p className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">How it behaves</p>
                <p className="text-sm text-ink-muted leading-6">
                  The workbench stays evidence-first. It grounds the prompt, ranks endpoint candidates,
                  shows the graph and cluster field, then asks focused questions before recommending a next move.
                </p>
              </div>

              <button
                type="button"
                onClick={() => runResolution(answers)}
                disabled={loading || prompt.trim().length === 0}
                className="w-full rounded-xl bg-teal-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Resolving..." : "Run Resolution"}
              </button>
            </div>
          </div>
        </section>

        {error ? <DataError message={error} onRetry={() => runResolution(answers)} /> : null}

        {result ? (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-slide-up">
              <article className="glass-panel p-4 space-y-2">
                <div className="flex items-center gap-2 text-teal-500">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">Confidence</span>
                </div>
                <p className="font-heading text-2xl text-ink">{formatPercent(result.observation.confidenceScore)}</p>
                <p className="text-sm text-ink-muted leading-6">{result.observation.confidenceSummary}</p>
              </article>
              <article className="glass-panel p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400">
                  <Network className="w-4 h-4" />
                  <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">Dominant Cluster</span>
                </div>
                <p className="font-heading text-xl text-ink">{result.observation.dominantCluster ?? "none"}</p>
                <p className="text-sm text-ink-muted leading-6">{result.observation.ambiguitySummary}</p>
              </article>
              <article className="glass-panel p-4 space-y-2">
                <div className="flex items-center gap-2 text-teal-500">
                  <BrainCircuit className="w-4 h-4" />
                  <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">Top Endpoint</span>
                </div>
                <p className="font-heading text-xl text-ink">{result.observation.dominantCandidate ?? "none"}</p>
                <p className="text-sm text-ink-muted leading-6">{result.candidates[0]?.recommendedAction ?? "No action yet."}</p>
              </article>
              <article className="glass-panel p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-500">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">Next Step</span>
                </div>
                <p className="text-sm text-ink leading-6">{result.observation.recommendedNextStep}</p>
                {result.observation.warnings.length > 0 ? (
                  <p className="text-xs text-amber-500">{result.observation.warnings[0]}</p>
                ) : null}
              </article>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6 animate-fade-slide-up">
              <div className="glass-panel p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-teal-500" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Stream-thread graph
                  </h2>
                </div>
                <GraphPanel nodes={result.graph.nodes} edges={result.graph.edges} />
              </div>

              <div className="glass-panel p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-teal-500" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Ranked endpoints
                  </h2>
                </div>
                <div className="space-y-3">
                  {result.candidates.map((candidate, index) => (
                    <article key={candidate.id} className="rounded-2xl border border-border-color/60 bg-surface-raised p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-body text-sm font-medium text-ink">{index + 1}. {candidate.label}</p>
                          <p className="font-mono text-[11px] text-ink-muted">
                            {candidate.endpointType} · {candidate.cluster}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] text-teal-600">
                          {candidate.score.toFixed(candidate.score >= 10 ? 1 : 2)} / {formatPercent(candidate.confidence)}
                        </span>
                      </div>
                      <p className="text-sm text-ink-muted leading-6">{candidate.recommendedAction}</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.matchedTerms.map((term) => (
                          <span key={term} className="rounded-full bg-teal-500/10 px-2 py-1 text-[11px] font-mono text-teal-600">
                            {term}
                          </span>
                        ))}
                      </div>
                      <ul className="space-y-1 text-[12px] text-ink-muted">
                        {candidate.reasons.map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                      <p className="font-mono text-[11px] text-ink-muted">{candidate.filePath}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-6 animate-fade-slide-up">
              <div className="glass-panel p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Radar className="w-5 h-5 text-amber-400" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Question queue
                  </h2>
                </div>
                <div className="space-y-4">
                  {result.questions.map((question) => (
                    <article key={question.id} className="rounded-2xl border border-border-color/60 bg-surface-raised p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-body text-sm font-medium text-ink">{question.question}</p>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">{question.kind}</span>
                      </div>
                      <p className="text-sm text-ink-muted leading-6">{question.rationale}</p>
                      <textarea
                        className="w-full min-h-[88px] rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
                        placeholder="Answer this to sharpen the endpoint field..."
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => runResolution(answers)}
                  disabled={loading || result.questions.length === 0}
                  className="w-full rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-600 transition hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Re-run with Answers
                </button>
              </div>

              <div className="space-y-6">
                <div className="glass-panel p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                      Cluster heatmap
                    </h2>
                  </div>
                  <HeatmapPanel heatmap={result.heatmap} clusters={result.clusters} />
                </div>

                <div className="glass-panel p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-teal-500" />
                    <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                      Artifacts
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.artifacts.map((artifact) => (
                      <article key={artifact.id} className="rounded-2xl border border-border-color/60 bg-surface-raised p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-body text-sm font-medium text-ink">{artifact.title}</p>
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">{artifact.kind}</span>
                        </div>
                        <p className="text-sm text-ink-muted leading-6">{artifact.content}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="glass-panel p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-teal-500" />
                    <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                      Transcript
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {result.transcript.map((turn) => (
                      <article key={turn.id} className="rounded-2xl border border-border-color/60 bg-surface-raised p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-body text-sm font-medium text-ink">{turn.speaker}</p>
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                            {turn.evidenceRefs.length} refs
                          </span>
                        </div>
                        <p className="text-sm text-ink leading-6">{turn.text}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

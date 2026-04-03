import { DataError } from "@/components/phase4/DataError";
import type {
  ArtifactCard,
  ClusterVisibility,
  ContextSearchObservation,
  ContextSearchStageResult,
  ContextSearchWorkflowDefinition,
  HeatmapCell,
  InterviewSpeaker,
  InterviewTurn,
  ReferenceGraphEdge,
  ReferenceGraphNode,
} from "@/components/phase4/types";
import { createDefaultContextSearchInput, useContextSearch } from "@/hooks/useContextSearch";
import { cn } from "@/lib/utils";
import { BrainCircuit, Download, FileSearch, GitBranch, MessagesSquare, Tags } from "lucide-react";
import { useMemo, useState } from "react";

interface GraphLayoutNode extends ReferenceGraphNode {
  x: number;
  y: number;
}

function formatScore(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function layoutGraph(nodes: ReferenceGraphNode[]): GraphLayoutNode[] {
  const clusters = nodes.filter((node) => node.type === "cluster");
  const files = nodes.filter((node) => node.type === "file");
  const width = 760;
  const clusterGap = width / Math.max(clusters.length, 1);
  const laidOut: GraphLayoutNode[] = [];

  clusters.forEach((cluster, index) => {
    laidOut.push({
      ...cluster,
      x: clusterGap * index + clusterGap / 2,
      y: 70,
    });
  });

  const fileOffsets = new Map<string, number>();
  for (const file of files) {
    const clusterIndex = Math.max(
      0,
      clusters.findIndex((cluster) => cluster.label === file.cluster),
    );
    const clusterX = clusterGap * clusterIndex + clusterGap / 2;
    const offset = fileOffsets.get(file.cluster ?? "") ?? 0;
    fileOffsets.set(file.cluster ?? "", offset + 1);

    const direction = offset % 2 === 0 ? -1 : 1;
    const spread = 32 + Math.floor(offset / 2) * 36;

    laidOut.push({
      ...file,
      x: clusterX + direction * spread,
      y: 190 + (offset % 3) * 42,
    });
  }

  return laidOut;
}

function GraphPanel({
  nodes,
  edges,
}: {
  nodes: ReferenceGraphNode[];
  edges: ReferenceGraphEdge[];
}) {
  const layout = useMemo(() => layoutGraph(nodes), [nodes]);
  const nodeMap = useMemo(() => new Map(layout.map((node) => [node.id, node])), [layout]);

  return (
    <svg viewBox="0 0 760 320" className="w-full h-auto" role="img" aria-label="Reference graph">
      {edges.map((edge, index) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;

        const stroke =
          edge.type === "transfer"
            ? "var(--amber-400)"
            : edge.type === "references"
              ? "var(--teal-500)"
              : "var(--border-color)";
        const dash = edge.type === "transfer" ? "7 4" : undefined;

        return (
          <g key={`${edge.source}-${edge.target}-${index}`}>
            <line
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={stroke}
              strokeOpacity={0.65}
              strokeWidth={edge.type === "belongs_to" ? 1 : 1.8}
              strokeDasharray={dash}
            />
            {edge.label ? (
              <text
                x={(source.x + target.x) / 2}
                y={(source.y + target.y) / 2 - 4}
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
            r={node.type === "cluster" ? 22 : 14}
            fill={node.type === "cluster" ? "rgba(212, 162, 74, 0.14)" : "rgba(20, 184, 166, 0.14)"}
            stroke={node.type === "cluster" ? "var(--amber-400)" : "var(--teal-500)"}
            strokeWidth={1.5}
          />
          <text
            x={node.x}
            y={node.y + (node.type === "cluster" ? 4 : 3)}
            textAnchor="middle"
            className={cn(
              "font-mono fill-ink",
              node.type === "cluster" ? "text-[10px]" : "text-[9px]",
            )}
          >
            {node.type === "cluster" ? Math.round(node.score) : Math.round(node.score * 10) / 10}
          </text>
          <text
            x={node.x}
            y={node.y + (node.type === "cluster" ? 40 : 28)}
            textAnchor="middle"
            className="fill-ink-muted text-[10px] font-body"
          >
            {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function HeatmapTable({
  heatmap,
  clusters,
}: {
  heatmap: HeatmapCell[];
  clusters: ClusterVisibility[];
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
                const cell = heatmap.find(
                  (entry) => entry.keyword === keyword && entry.clusterId === cluster.id,
                );
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
                      {score > 0 ? formatScore(score) : "—"}
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

function ArtifactPanel({ artifacts }: { artifacts: ArtifactCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {artifacts.map((artifact) => (
        <article key={artifact.id} className="glass-panel p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-body text-sm font-medium text-ink">{artifact.title}</h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
              {artifact.type}
            </span>
          </div>
          <p className="text-sm text-ink-muted leading-6">{artifact.content}</p>
          <p className="font-mono text-[11px] text-teal-600">
            refs: {artifact.evidenceRefs.join(", ") || "none"}
          </p>
        </article>
      ))}
    </div>
  );
}

function InterviewPanel({
  speakers,
  turns,
}: {
  speakers: InterviewSpeaker[];
  turns: InterviewTurn[];
}) {
  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  return (
    <div className="space-y-4">
      {turns.map((turn) => {
        const speaker = speakerMap.get(turn.speakerId);
        return (
          <article key={turn.id} className="glass-panel p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-body text-sm font-medium text-ink">
                  {speaker?.label ?? turn.speakerId}
                </p>
                <p className="font-body text-xs text-ink-muted">{speaker?.role}</p>
              </div>
              <span className="font-mono text-[11px] text-teal-600">
                {Math.round(turn.confidence * 100)}%
              </span>
            </div>
            <p className="text-sm text-ink leading-6">{turn.text}</p>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-ink-muted">
              <span>evidence: {turn.evidenceRefs.join(", ") || "none"}</span>
              <span>artifacts: {turn.artifactRefs.join(", ") || "none"}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DefinitionPanel({ definition }: { definition: ContextSearchWorkflowDefinition }) {
  return (
    <article className="rounded-2xl border border-amber-400/30 bg-[rgba(212,162,74,0.08)] p-5 space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-700">
          Reference Contract
        </p>
        <h2 className="font-body text-lg font-medium text-ink">{definition.title}</h2>
      </div>

      <p className="text-sm text-ink leading-6">{definition.whatItIs}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">authority order</p>
          {definition.authorityOrder.map((entry) => (
            <p key={entry} className="text-ink-muted leading-6">
              {entry}
            </p>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">contract notes</p>
          {definition.contractNotes.map((entry) => (
            <p key={entry} className="text-ink-muted leading-6">
              {entry}
            </p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl bg-white/40 p-4 border border-amber-400/20">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">
            implemented runtime
          </p>
          {definition.implementedRuntime.map((entry) => (
            <p key={entry} className="text-ink-muted leading-6">
              {entry}
            </p>
          ))}
        </div>

        <div className="rounded-xl bg-white/40 p-4 border border-amber-400/20">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">
            adjacent influence
          </p>
          {definition.adjacentInfluence.map((entry) => (
            <p key={entry} className="text-ink-muted leading-6">
              {entry}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white/40 p-4 border border-amber-400/20">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">token-dense form</p>
        <p className="font-mono text-[11px] text-ink-muted">{definition.tokenDenseForm}</p>
      </div>
    </article>
  );
}

function ObservationPanel({ observation }: { observation: ContextSearchObservation }) {
  return (
    <article className="rounded-2xl border border-border-color/60 bg-surface p-5 space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal-600">
          Mechanical Observation
        </p>
        <h2 className="font-body text-lg font-medium text-ink">Runtime study</h2>
      </div>

      <p className="text-sm text-ink leading-6">{observation.confidenceSummary}</p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">accepted keywords</p>
          <p className="font-mono text-lg text-teal-600 mt-1">{observation.acceptedKeywordCount}</p>
        </div>
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">rejected terms</p>
          <p className="font-mono text-lg text-teal-600 mt-1">{observation.rejectedTermCount}</p>
        </div>
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">unknown terms</p>
          <p className="font-mono text-lg text-teal-600 mt-1">{observation.unknownTermCount}</p>
        </div>
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">grounded hits</p>
          <p className="font-mono text-lg text-teal-600 mt-1">{observation.hitCount}</p>
        </div>
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">clusters</p>
          <p className="font-mono text-lg text-teal-600 mt-1">{observation.clusterCount}</p>
        </div>
        <div className="rounded-xl border border-border-color/60 bg-surface-raised p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">top cluster</p>
          <p className="font-mono text-[11px] text-teal-600 mt-1">
            {observation.topCluster ?? "none"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border-color/60 bg-surface-raised p-4 space-y-2">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">warnings</p>
        <p className="text-sm text-ink-muted leading-6">
          {observation.warnings.join(" • ") || "none"}
        </p>
      </div>

      <div className="rounded-xl border border-border-color/60 bg-surface-raised p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">final output</p>
        <p className="font-mono text-[11px] text-ink-muted">{observation.finalOutput}</p>
      </div>
    </article>
  );
}

function WorkflowTracePanel({ prints }: { prints: ContextSearchStageResult[] }) {
  return (
    <section className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessagesSquare className="w-5 h-5 text-amber-400" />
        <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
          Workflow print trace
        </h2>
      </div>

      <div className="space-y-3">
        {prints.map((entry) => (
          <article
            key={`${entry.stage}-${entry.status}`}
            className="rounded-xl border border-border-color/60 bg-surface p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm font-medium text-ink">{entry.stage}</p>
              <span
                className={cn(
                  "font-mono text-[11px] uppercase",
                  entry.status === "completed" ? "text-teal-600" : "text-amber-700",
                )}
              >
                {entry.status}
              </span>
            </div>
            <p className="text-sm text-ink-muted leading-6">{entry.message}</p>
            <p className="font-mono text-[11px] text-ink-muted">
              {Object.entries(entry.counts)
                .map(([key, value]) => `${key}=${value}`)
                .join(" • ") || "no counters"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ContextSearchView() {
  const { result, loading, error, runSearch, reset } = useContextSearch();
  const [input, setInput] = useState(createDefaultContextSearchInput());

  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "context-search-reference-package.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative max-w-6xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h1
              className="font-heading text-2xl font-bold text-ink tracking-tight"
              style={{ letterSpacing: "-0.02em" }}
            >
              Context Search
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">◎</span> scenario compression, deterministic
              retrieval, node transfer, cluster visibility.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <section className="glass-panel p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-teal-500" />
            <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
              Scenario Input
            </h2>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(input);
            }}
          >
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.08em] text-ink-muted font-body">
                Scenario / context / problem
              </label>
              <textarea
                value={input.scenarioText}
                onChange={(event) =>
                  setInput((current) => ({ ...current, scenarioText: event.target.value }))
                }
                className="w-full min-h-[120px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Describe the situation you want compressed and searched against the codebase."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.08em] text-ink-muted font-body">
                  Optional context
                </label>
                <textarea
                  value={input.optionalContext}
                  onChange={(event) =>
                    setInput((current) => ({ ...current, optionalContext: event.target.value }))
                  }
                  className="w-full min-h-[88px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Constraints, audience, subsystem, or background."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.08em] text-ink-muted font-body">
                  Optional problem frame
                </label>
                <textarea
                  value={input.optionalProblemFrame}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      optionalProblemFrame: event.target.value,
                    }))
                  }
                  className="w-full min-h-[88px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Risk, intended output, or question framing."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.08em] text-ink-muted font-body block">
                  Max keywords
                </span>
                <input
                  type="number"
                  min={5}
                  max={12}
                  value={input.maxKeywords}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      maxKeywords: Number(event.target.value) || 8,
                    }))
                  }
                  className="w-28 rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.08em] text-ink-muted font-body block">
                  Provider
                </span>
                <select
                  value={input.provider}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      provider: event.target.value as typeof current.provider,
                    }))
                  }
                  className="w-44 rounded-xl border border-border-color bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="deterministic">deterministic</option>
                  <option value="openai" disabled>
                    openai (planned)
                  </option>
                  <option value="ollama" disabled>
                    ollama (planned)
                  </option>
                </select>
              </label>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 rounded-xl border border-border-color text-sm text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={loading || input.scenarioText.trim().length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium disabled:opacity-60"
                >
                  <FileSearch className="w-4 h-4" />
                  {loading ? "Analyzing..." : "Analyze context"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {error ? <DataError message={error} onRetry={() => void runSearch(input)} /> : null}

        {!result && !loading && !error ? (
          <section className="glass-panel p-8 text-center">
            <p className="text-sm text-ink-muted">
              Enter a scenario to generate a grounded keyword bundle, search the repo
              deterministically, and build interview-ready reference artifacts.
            </p>
          </section>
        ) : null}

        {result ? (
          <>
            <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
              <DefinitionPanel definition={result.definition} />
              <ObservationPanel observation={result.observation} />
            </section>

            <section className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Tags className="w-5 h-5 text-teal-500" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Keyword bundle
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-color text-sm text-ink hover:bg-surface-raised"
                >
                  <Download className="w-4 h-4" />
                  Export package
                </button>
              </div>

              <p className="text-sm text-ink leading-6">{result.summary}</p>

              <div className="flex flex-wrap gap-2">
                {result.keywords.accepted.map((keyword) => (
                  <span
                    key={keyword.term}
                    className="px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-sm text-teal-700"
                  >
                    {keyword.canonicalTerm}
                    <span className="ml-2 font-mono text-[11px] text-teal-600">
                      {Math.round(keyword.weight * 100)}%
                    </span>
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl bg-surface p-4 border border-border-color/60">
                  <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">
                    unknown terms
                  </p>
                  <p className="text-ink-muted">
                    {result.keywords.unknownTerms.join(", ") || "none"}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-4 border border-border-color/60">
                  <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">
                    rejected terms
                  </p>
                  <p className="text-ink-muted">
                    {result.keywords.rejectedTerms.join(", ") || "none"}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-4 border border-border-color/60">
                  <p className="text-xs uppercase tracking-[0.08em] text-ink-muted mb-2">trace</p>
                  <p className="font-mono text-[11px] text-ink-muted">
                    {result.keywords.synthesisTrace.join(" • ")}
                  </p>
                </div>
              </div>
            </section>

            <WorkflowTracePanel prints={result.prints} />

            <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <div className="glass-panel p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-amber-400" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Node and cluster visibility
                  </h2>
                </div>
                <GraphPanel nodes={result.graph.nodes} edges={result.graph.edges} />
              </div>

              <div className="glass-panel p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-teal-500" />
                  <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                    Cluster ranking
                  </h2>
                </div>
                <div className="space-y-3">
                  {result.clusters.map((cluster) => (
                    <article
                      key={cluster.id}
                      className="rounded-xl border border-border-color/60 bg-surface p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-ink">{cluster.label}</h3>
                        <span className="font-mono text-[11px] text-teal-600">
                          {formatScore(cluster.score)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted mt-2">
                        terms: {cluster.matchedTerms.join(", ") || "none"}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        transfer: {cluster.transferReasons.join(" • ") || "none"}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-teal-500" />
                <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Keyword heatmap
                </h2>
              </div>
              <HeatmapTable heatmap={result.heatmap} clusters={result.clusters} />
            </section>

            <section className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-amber-400" />
                <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Interview transcript
                </h2>
              </div>
              <InterviewPanel speakers={result.interview.speakers} turns={result.interview.turns} />
            </section>

            <section className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-teal-500" />
                <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Reference artifacts
                </h2>
              </div>
              <ArtifactPanel artifacts={result.artifacts} />
            </section>

            <section className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-teal-500" />
                <h2 className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  Implemented runtime grounding
                </h2>
              </div>
              <p className="text-sm text-ink-muted">
                Evidence hits are the truth layer. Graphs, clusters, transcript, and artifacts are
                derived from these grounded references.
              </p>
              <div className="space-y-3">
                {result.hits.map((hit) => (
                  <article
                    key={hit.id}
                    className="rounded-xl border border-border-color/60 bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-ink">{hit.title}</h3>
                        <p className="font-mono text-[11px] text-teal-600 mt-1">{hit.path}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[11px] text-ink-muted uppercase">{hit.kind}</p>
                        <p className="font-mono text-sm text-teal-600 mt-1">
                          {formatScore(hit.score)}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-ink-muted leading-6 mt-3">{hit.excerpt}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {hit.matchedTerms.map((term) => (
                        <span
                          key={`${hit.id}-${term}`}
                          className="px-2 py-1 rounded-md bg-teal-500/10 text-[11px] font-mono text-teal-700"
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

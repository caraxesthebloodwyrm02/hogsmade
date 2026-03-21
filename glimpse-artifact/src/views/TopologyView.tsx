import { McpGraph } from "@/components/phase4/McpGraph";
import { HealthGauge } from "@/components/phase4/HealthGauge";
import { DataError } from "@/components/phase4/DataError";
import { useMcpTopology } from "@/hooks/useMcpTopology";
import { useHealthData } from "@/hooks/useHealthData";
import { Network, HeartPulse } from "lucide-react";

export function TopologyView() {
  const { nodes, edges, loading: topoLoading, error: topoError, retry: topoRetry } = useMcpTopology();
  const health = useHealthData();

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-canvas-surface/80 backdrop-blur-md shadow-token-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-glow-emerald shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight">
              Topology
            </h1>
            <p className="font-body text-sm text-ink-muted mt-1 font-medium">
              MCP server dependency graph and ecosystem health overview.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* MCP Graph */}
        <section aria-labelledby="graph-heading" className="animate-fade-slide-up">
          <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Network className="w-5 h-5" />
            </div>
            <h2 id="graph-heading" className="font-heading text-xl font-bold text-ink tracking-tight">
              MCP Server Graph
            </h2>
          </div>
          <div className="rounded-xl border border-border-color/50 bg-canvas-surface p-5 shadow-token-sm card-glow">
            {topoError
              ? <DataError message={topoError} onRetry={topoRetry} />
              : <McpGraph nodes={nodes} edges={edges} loading={topoLoading} />}
          </div>
        </section>

        {/* Ecosystem Health */}
        <section aria-labelledby="health-heading" className="animate-fade-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <HeartPulse className="w-5 h-5" />
            </div>
            <h2 id="health-heading" className="font-heading text-xl font-bold text-ink tracking-tight">
              Ecosystem Health
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 stagger-children">
            {health.error
              ? <DataError message={health.error} onRetry={health.retry} className="col-span-full" />
              : health.loading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <HealthGauge key={i} loading />
                ))
                : health.data.map((h) => (
                  <HealthGauge key={h.repoName} data={h} />
                ))}
          </div>
        </section>
      </main>
    </div>
  );
}

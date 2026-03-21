import { CiKanban } from "@/components/phase4/CiKanban";
import { DataError } from "@/components/phase4/DataError";
import { useCiPipeline } from "@/hooks/useCiPipeline";
import { GitBranch } from "lucide-react";

export function PipelineView() {
  const { prs, loading, error, retry } = useCiPipeline();

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              CI/CD Pipeline
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">⑂</span> PR lifecycle kanban: Pending → Scanning → Building → Merged, with fix queue.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 animate-fade-slide-up">
        {error ? (
          <DataError message={error} onRetry={retry} />
        ) : (
          <div className="glass-panel p-5 card-glow">
            <CiKanban prs={prs} loading={loading} />
          </div>
        )}
      </main>
    </div>
  );
}

import { AuditStreamPanel } from "@/components/phase4/AuditStreamPanel";
import { DataError } from "@/components/phase4/DataError";
import { useAuditStream } from "@/hooks/useAuditStream";
import { Radio } from "lucide-react";

export function AuditStreamView() {
  const { events, loading, error, retry } = useAuditStream();

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-canvas-surface/80 backdrop-blur-md shadow-token-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight">
              Audit Stream
            </h1>
            <p className="font-body text-sm text-ink-muted mt-1 font-medium">
              Live event feed from MCP servers with filtering and detail inspection.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-slide-up">
        {error ? (
          <DataError message={error} onRetry={retry} />
        ) : (
          <div className="rounded-xl border border-border-color/50 bg-canvas-surface p-5 shadow-token-sm card-glow">
            <AuditStreamPanel events={events} loading={loading} error={error ?? undefined} />
          </div>
        )}
      </main>
    </div>
  );
}

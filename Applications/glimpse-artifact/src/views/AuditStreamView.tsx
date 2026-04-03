import { AuditStreamPanel } from "@/components/phase4/AuditStreamPanel";
import { DataError } from "@/components/phase4/DataError";
import { useAuditStream } from "@/hooks/useAuditStream";
import { Radio } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import type { AuditEvent } from "@/components/phase4/types";

export function AuditStreamView() {
  const { events, loading, error, retry } = useAuditStream();
  const [isPaused, setIsPaused] = useState(false);
  const snapshotRef = useRef<AuditEvent[]>([]);

  // When paused, freeze the displayed events at the moment of pause
  if (!isPaused) {
    snapshotRef.current = events;
  }

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const displayEvents = isPaused ? snapshotRef.current : events;

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative max-w-5xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h1
              className="font-heading text-2xl font-bold text-ink tracking-tight"
              style={{ letterSpacing: "-0.02em" }}
            >
              Audit Stream
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">◉</span> Live event feed from MCP servers with
              filtering and detail inspection.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-slide-up">
        {error ? (
          <DataError message={error} onRetry={retry} />
        ) : (
          <div className="glass-panel p-5 card-glow">
            <AuditStreamPanel
              events={displayEvents}
              loading={loading}
              error={error ?? undefined}
              onPauseToggle={handlePauseToggle}
              isPaused={isPaused}
            />
          </div>
        )}
      </main>
    </div>
  );
}

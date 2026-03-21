import { CognitionRadar } from "@/components/phase4/CognitionRadar";
import { GateFlowDiagram } from "@/components/phase4/GateFlowDiagram";
import { DataError } from "@/components/phase4/DataError";
import { useCognitionStats } from "@/hooks/useCognitionStats";
import { useGateData, GATE_STEPS } from "@/hooks/useGateData";
import { Brain, Shield } from "lucide-react";
import type { EnvelopeStage } from "@/components/phase4/types";

export function CognitionView() {
  const { patterns, loading: cogLoading, error: cogError, retry: cogRetry } = useCognitionStats();
  const { verifications, loading: gateLoading, error: gateError, retry: gateRetry } = useGateData();

  // Derive GATE flow stages from the first (real) verification
  const gateStages: EnvelopeStage[] = gateLoading
    ? []
    : verifications.length > 0
      ? verifications[0].steps.map((step) => ({
        name: step.name,
        status: step.status === "done" ? "passed" as const
          : step.status === "failed" ? "failed" as const
            : step.status === "running" ? "pending" as const
              : "skipped" as const,
        details: GATE_STEPS.find((gs) =>
          step.name.toLowerCase().includes(gs.replace(/_/g, " ").split(" ")[0]),
        )
          ? `Step from ${verifications[0].workflowName}`
          : undefined,
        durationMs: step.durationMs,
      }))
      : [];

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative max-w-6xl mx-auto flex items-center gap-4 animate-fade-in">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400 shadow-glow-amber shrink-0">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              Cognition & GATE
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">✦</span> GRID cognition pattern activation radar and GATE envelope flow.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Cognition Radar */}
        <section aria-labelledby="cognition-heading" className="animate-fade-slide-up">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 rounded-md bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Brain className="w-5 h-5" />
            </div>
            <h2 id="cognition-heading" className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
              Cognition Pattern Radar
            </h2>
            <span className="text-xs text-ink-muted font-body ml-auto">
              9 patterns &middot; recent session
            </span>
          </div>
          <div className="glass-panel p-5 card-glow">
            {cogError
              ? <DataError message={cogError} onRetry={cogRetry} />
              : <CognitionRadar patterns={patterns} loading={cogLoading} />}
          </div>
        </section>

        {/* GATE Envelope Flow */}
        <section aria-labelledby="gateflow-heading" className="animate-fade-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 rounded-md bg-teal-500/10 text-teal-500 border border-teal-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <h2 id="gateflow-heading" className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink">
              GATE Envelope Flow
            </h2>
          </div>
          <div className="glass-panel p-5">
            {gateError
              ? <DataError message={gateError} onRetry={gateRetry} />
              : <GateFlowDiagram
                stages={gateStages}
                loading={gateLoading}
                envelopeId={verifications[0]?.id}
              />}
          </div>
        </section>
      </main>
    </div>
  );
}

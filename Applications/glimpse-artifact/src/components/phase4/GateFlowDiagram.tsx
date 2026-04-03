import type { EnvelopeStage } from "./types";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Clock, SkipForward, ArrowRight } from "lucide-react";

interface GateFlowDiagramProps {
  stages: EnvelopeStage[];
  loading: boolean;
  envelopeId?: string;
}

const STATUS_CONFIG: Record<
  EnvelopeStage["status"],
  { icon: typeof CheckCircle; color: string; bg: string; label: string }
> = {
  passed: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Passed",
  },
  failed: {
    icon: XCircle,
    color: "text-rose-500",
    bg: "bg-rose-500/10 border-rose-500/20",
    label: "Failed",
  },
  pending: {
    icon: Clock,
    color: "text-ink-muted",
    bg: "bg-surface-raised border-border-color",
    label: "Pending",
  },
  skipped: {
    icon: SkipForward,
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    label: "Skipped",
  },
};

export function GateFlowDiagram({ stages, loading, envelopeId }: GateFlowDiagramProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg skeleton-shimmer" />
        ))}
      </div>
    );
  }

  const passedCount = stages.filter((s) => s.status === "passed").length;
  const totalMs = stages.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-3 glass-panel">
        <div className="flex items-center gap-3">
          {envelopeId && (
            <span className="text-xs font-mono text-ink-muted bg-surface-raised px-2 py-0.5 rounded">
              {envelopeId}
            </span>
          )}
          <span className="text-sm font-medium text-ink">
            {passedCount}/{stages.length} checks passed
          </span>
        </div>
        <span className="text-xs text-ink-muted font-mono">{totalMs.toFixed(1)}ms total</span>
      </div>

      {/* Waterfall stages */}
      <div className="space-y-1">
        {stages.map((stage, i) => {
          const cfg = STATUS_CONFIG[stage.status];
          const Icon = cfg.icon;
          const barWidth = stage.durationMs
            ? Math.max(8, (stage.durationMs / Math.max(totalMs, 1)) * 100)
            : 0;

          return (
            <div key={stage.name}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  cfg.bg,
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{stage.name}</span>
                    {stage.durationMs !== undefined && (
                      <span className="text-xs text-ink-muted font-mono shrink-0">
                        {stage.durationMs < 1
                          ? `${(stage.durationMs * 1000).toFixed(0)}μs`
                          : `${stage.durationMs.toFixed(1)}ms`}
                      </span>
                    )}
                  </div>
                  {stage.details && (
                    <p className="text-xs text-ink-muted mt-0.5 truncate">{stage.details}</p>
                  )}
                  {/* Duration bar */}
                  {stage.durationMs !== undefined && stage.durationMs > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-surface-raised overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          stage.status === "passed" ? "bg-emerald-500" : "bg-rose-500",
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {/* Arrow connector */}
              {i < stages.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowRight className="w-3 h-3 text-border-color rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

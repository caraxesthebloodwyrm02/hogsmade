import { cn } from "@/lib/utils";
import type { Experiment } from "./types";
import { Activity, CheckCircle2, XCircle, Clock, BarChart3, TrendingUp, TrendingDown } from "lucide-react";

interface ExperimentCardProps {
  data?: Experiment;
  loading?: boolean;
  error?: string;
  className?: string;
}

const STATUS_LABELS: Record<
  Experiment["status"],
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  running: {
    label: "Running",
    color: "var(--teal-600)",
    bg: "var(--teal-100)",
    icon: Activity,
  },
  completed: {
    label: "Completed",
    color: "var(--emerald-600)",
    bg: "var(--emerald-100)",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "var(--rose-600)",
    bg: "var(--rose-100)",
    icon: XCircle,
  },
  queued: {
    label: "Queued",
    color: "var(--ink-muted)",
    bg: "var(--surface-raised)",
    icon: Clock,
  },
};

function formatDate(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

export function ExperimentCard({
  data,
  loading,
  error,
  className,
}: ExperimentCardProps) {
  if (error) {
    return (
      <div
        className={cn(
          "rounded-lg border border-rose-500 bg-rose-100 p-4",
          className,
        )}
        role="alert"
      >
        <p className="font-body text-sm text-rose-600 font-medium">
          Could not load experiment.
        </p>
        <p className="font-body text-sm text-ink-muted mt-1">{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border-color bg-canvas-surface p-4 animate-pulse",
          className,
        )}
        aria-busy="true"
        aria-label="Loading experiment"
      >
        <div className="h-4 bg-border-color rounded w-3/4 mb-3" />
        <div className="h-3 bg-border-color rounded w-1/2 mb-2" />
        <div className="h-8 bg-border-color rounded w-full" />
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[data.status];
  const StatusIcon = statusCfg.icon;
  const maxVal = Math.max(data.baselineValue, data.currentValue, 1);
  const baselinePct = (data.baselineValue / maxVal) * 100;
  const currentPct = (data.currentValue / maxVal) * 100;
  const delta = data.currentValue - data.baselineValue;
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div
      className={cn(
        "rounded-xl border border-border-color/50 bg-canvas-surface p-5 shadow-token-sm card-glow",
        "transition-all duration-300 hover:shadow-token-md hover:border-border-color",
        className,
      )}
      role="article"
      aria-label={`Experiment: ${data.name}, status: ${statusCfg.label}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-base font-bold text-ink leading-snug tracking-tight">
          {data.name}
        </h3>
        <span
          className="shrink-0 flex items-center gap-1.5 font-body text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm"
          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-5 bg-surface-raised/50 p-2 rounded-lg border border-border-color/30">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-canvas-surface border border-border-color/50 shadow-sm">
          <BarChart3 className="w-3.5 h-3.5 text-ink-muted" />
        </div>
        <p className="font-body text-sm text-ink font-semibold">
          {data.metric}
        </p>
      </div>

      <div className="space-y-4 p-4 rounded-lg bg-canvas-bg/50 border border-border-color/30" aria-label="Comparison bars">
        <div>
          <div className="flex justify-between font-body text-xs font-medium text-ink-muted/80 mb-2">
            <span>Baseline</span>
            <span>{data.baselineValue.toFixed(1)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-raised overflow-hidden border border-border-color/20">
            <div
              className="h-full rounded-full transition-all duration-slow"
              style={{
                width: `${Math.max(2, baselinePct)}%`,
                backgroundColor: "var(--ink-muted)",
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between font-body mb-2 items-center">
            <span className="text-sm font-semibold text-ink">Current</span>
            <span className="flex items-center gap-1.5 font-bold text-base text-ink tracking-tight shadow-sm rounded bg-surface-raised px-1 border border-border-color/30">
              {data.currentValue.toFixed(1)}
              <span
                className="flex items-center text-xs px-1.5 py-0.5 rounded font-bold"
                style={{
                  color: delta >= 0 ? "var(--emerald-500)" : "var(--rose-500)",
                  backgroundColor: delta >= 0 ? "var(--emerald-100)" : "var(--rose-100)",
                }}
              >
                {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
                {deltaSign}{delta.toFixed(1)}
              </span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-raised overflow-hidden border border-border-color/20">
            <div
              className="h-full rounded-full transition-all duration-slow shadow-sm"
              style={{
                width: `${Math.max(2, currentPct)}%`,
                backgroundImage: `linear-gradient(90deg, ${delta >= 0 ? "var(--teal-500), var(--emerald-400)" : "var(--rose-600), var(--rose-400)"
                  })`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-5 font-body text-xs text-ink-muted/80 border-t border-border-color/30 pt-3">
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDate(data.startedAt)}</span>
        {data.completedAt && (
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Finished {formatDate(data.completedAt)}</span>
        )}
      </div>
    </div>
  );
}

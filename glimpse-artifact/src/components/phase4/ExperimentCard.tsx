import { cn } from "@/lib/utils";
import type { Experiment } from "./types";

interface ExperimentCardProps {
  data?: Experiment;
  loading?: boolean;
  error?: string;
  className?: string;
}

const STATUS_LABELS: Record<
  Experiment["status"],
  { label: string; color: string; bg: string }
> = {
  running: {
    label: "Running",
    color: "var(--teal-600)",
    bg: "var(--teal-100)",
  },
  completed: {
    label: "Completed",
    color: "var(--emerald-600)",
    bg: "var(--emerald-100)",
  },
  failed: { label: "Failed", color: "var(--rose-600)", bg: "var(--rose-100)" },
  queued: {
    label: "Queued",
    color: "var(--ink-muted)",
    bg: "var(--surface-raised)",
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
  const maxVal = Math.max(data.baselineValue, data.currentValue, 1);
  const baselinePct = (data.baselineValue / maxVal) * 100;
  const currentPct = (data.currentValue / maxVal) * 100;
  const delta = data.currentValue - data.baselineValue;
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border-color bg-canvas-surface p-4 shadow-token-sm",
        "transition-shadow duration-fast hover:shadow-token-md",
        className,
      )}
      role="article"
      aria-label={`Experiment: ${data.name}, status: ${statusCfg.label}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-base font-bold text-ink leading-snug">
          {data.name}
        </h3>
        <span
          className="shrink-0 font-body text-xs font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
        >
          {statusCfg.label}
        </span>
      </div>

      <p className="font-body text-sm text-ink-muted mb-3">
        Measuring: {data.metric}
      </p>

      <div className="space-y-2" aria-label="Comparison bars">
        <div>
          <div className="flex justify-between font-body text-xs text-ink-muted mb-0.5">
            <span>Baseline</span>
            <span>{data.baselineValue.toFixed(1)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-slow"
              style={{
                width: `${baselinePct}%`,
                backgroundColor: "var(--ink-muted)",
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between font-body text-xs text-ink-muted mb-0.5">
            <span>Current</span>
            <span>
              {data.currentValue.toFixed(1)}{" "}
              <span
                style={{
                  color: delta >= 0 ? "var(--emerald-600)" : "var(--rose-600)",
                }}
              >
                ({deltaSign}
                {delta.toFixed(1)})
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-slow"
              style={{
                width: `${currentPct}%`,
                backgroundColor:
                  delta >= 0 ? "var(--emerald-500)" : "var(--rose-500)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 font-body text-xs text-ink-muted">
        <span>Started {formatDate(data.startedAt)}</span>
        {data.completedAt && (
          <span>Finished {formatDate(data.completedAt)}</span>
        )}
      </div>
    </div>
  );
}

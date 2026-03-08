import { cn } from "@/lib/utils";
import { useState } from "react";
import type { WorkflowRun, WorkflowStep } from "./types";

interface WorkflowStatusCardProps {
  data?: WorkflowRun;
  loading?: boolean;
  error?: string;
  className?: string;
}

const RUN_STATUS: Record<
  WorkflowRun["status"],
  { label: string; color: string; bg: string }
> = {
  pending: {
    label: "Waiting",
    color: "var(--ink-muted)",
    bg: "var(--surface-raised)",
  },
  running: {
    label: "Running",
    color: "var(--teal-600)",
    bg: "var(--teal-100)",
  },
  completed: {
    label: "Done",
    color: "var(--emerald-600)",
    bg: "var(--emerald-100)",
  },
  failed: { label: "Failed", color: "var(--rose-600)", bg: "var(--rose-100)" },
};

const STEP_ICONS: Record<
  WorkflowStep["status"],
  { icon: string; color: string }
> = {
  pending: { icon: "\u25CB", color: "var(--ink-muted)" },
  running: { icon: "\u25CF", color: "var(--teal-500)" },
  done: { icon: "\u2713", color: "var(--emerald-500)" },
  failed: { icon: "\u2717", color: "var(--rose-500)" },
  skipped: { icon: "\u2014", color: "var(--ink-muted)" },
};

function formatElapsed(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function WorkflowStatusCard({
  data,
  loading,
  error,
  className,
}: WorkflowStatusCardProps) {
  const [expanded, setExpanded] = useState(false);

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
          Could not load workflow.
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
        aria-label="Loading workflow"
      >
        <div className="h-4 bg-border-color rounded w-1/2 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-border-color" />
              <div className="h-3 bg-border-color rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusCfg = RUN_STATUS[data.status];
  const completedSteps = data.steps.filter((s) => s.status === "done").length;

  return (
    <div
      className={cn(
        "rounded-lg border border-border-color bg-canvas-surface p-4 shadow-token-sm",
        "transition-shadow duration-fast hover:shadow-token-md",
        className,
      )}
      role="article"
      aria-label={`Workflow: ${data.workflowName}, status: ${statusCfg.label}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-heading text-base font-bold text-ink leading-snug">
          {data.workflowName}
        </h3>
        <span
          className="shrink-0 font-body text-xs font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
        >
          {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-3 font-body text-sm text-ink-muted">
        <span>
          {completedSteps}/{data.steps.length} steps done
        </span>
        {data.elapsedMs != null && <span>{formatElapsed(data.elapsedMs)}</span>}
      </div>

      <button
        onClick={() => setExpanded((e) => !e)}
        className="font-body text-sm font-medium text-teal-600 hover:text-teal-700
                   min-h-touch px-2 py-1 rounded-md
                   transition-colors duration-fast
                   focus:outline-none focus:ring-2 focus:ring-teal-500"
        aria-expanded={expanded}
        aria-controls={`steps-${data.id}`}
      >
        {expanded ? "Hide steps" : "Show steps"}
      </button>

      {expanded && (
        <ol
          id={`steps-${data.id}`}
          className="mt-3 space-y-2 pl-1"
          role="list"
          aria-label="Workflow steps"
        >
          {data.steps.map((step, i) => {
            const stepCfg = STEP_ICONS[step.status];
            return (
              <li key={i} className="flex items-center gap-2" role="listitem">
                <span
                  className="w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ color: stepCfg.color }}
                  aria-hidden="true"
                >
                  {stepCfg.icon}
                </span>
                <span className="font-body text-sm text-ink flex-1">
                  {step.name}
                </span>
                {step.durationMs != null && (
                  <span className="font-body text-xs text-ink-muted">
                    {formatElapsed(step.durationMs)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

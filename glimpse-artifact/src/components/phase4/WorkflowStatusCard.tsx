import { cn } from "@/lib/utils";
import { useState } from "react";
import type { WorkflowRun, WorkflowStep } from "./types";
import { Clock, Activity, CheckCircle2, XCircle, CircleDashed, PlayCircle, MinusCircle, ChevronDown, ChevronUp } from "lucide-react";

interface WorkflowStatusCardProps {
  data?: WorkflowRun;
  loading?: boolean;
  error?: string;
  className?: string;
}

const RUN_STATUS: Record<
  WorkflowRun["status"],
  { label: string; color: string; bg: string; icon: React.ElementType; alert?: boolean }
> = {
  pending: {
    label: "Waiting",
    color: "var(--ink-muted)",
    bg: "var(--surface-raised)",
    icon: Clock,
  },
  running: {
    label: "Running",
    color: "var(--teal-600)",
    bg: "var(--teal-100)",
    icon: Activity,
  },
  completed: {
    label: "Done",
    color: "var(--emerald-600)",
    bg: "var(--emerald-100)",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "var(--rose-600)",
    bg: "var(--rose-100)",
    icon: XCircle,
    alert: true,
  },
};

const STEP_ICONS: Record<
  WorkflowStep["status"],
  { icon: React.ElementType; color: string }
> = {
  pending: { icon: CircleDashed, color: "var(--ink-muted)" },
  running: { icon: PlayCircle, color: "var(--teal-500)" },
  done: { icon: CheckCircle2, color: "var(--emerald-500)" },
  failed: { icon: XCircle, color: "var(--rose-500)" },
  skipped: { icon: MinusCircle, color: "var(--ink-muted)" },
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
  const StatusIcon = statusCfg.icon;
  const completedSteps = data.steps.filter((s) => s.status === "done").length;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-token-sm transition-all duration-300",
        statusCfg.alert
          ? "border-rose-300 bg-rose-50/20 shadow-rose-900/5 hover:border-rose-400 hover:shadow-rose-900/10"
          : "border-border-color/50 bg-canvas-surface hover:shadow-token-md hover:border-border-color",
        className,
      )}
      role="article"
      aria-label={`Workflow: ${data.workflowName}, status: ${statusCfg.label}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-base font-bold text-ink leading-snug tracking-tight">
          {data.workflowName}
        </h3>
        <span
          className="shrink-0 flex items-center gap-1.5 font-body text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm"
          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4 font-body text-sm text-ink-muted bg-canvas-bg/50 p-3 rounded-lg border border-border-color/30">
        <span className="font-medium">
          {completedSteps}/{data.steps.length} steps done
        </span>
        {data.elapsedMs != null && (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-border-color/80" />
            <span className="font-medium">{formatElapsed(data.elapsedMs)} elapsed</span>
          </>
        )}
      </div>

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 font-body text-sm font-semibold text-teal-600 hover:text-teal-700 hover:bg-teal-50
                   min-h-touch px-3 py-1.5 rounded-md
                   transition-all duration-fast w-full justify-center border border-transparent hover:border-teal-100
                   focus:outline-none focus:ring-2 focus:ring-teal-500"
        aria-expanded={expanded}
        aria-controls={`steps-${data.id}`}
      >
        {expanded ? "Hide steps" : "Show steps"}
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <ol
          id={`steps-${data.id}`}
          className="mt-3 space-y-2 border border-border-color/30 rounded-lg p-3 bg-canvas-bg/30"
          role="list"
          aria-label="Workflow steps"
        >
          {data.steps.map((step, i) => {
            const stepCfg = STEP_ICONS[step.status];
            const StepIcon = stepCfg.icon;
            return (
              <li key={i} className="flex items-center gap-3 p-1 rounded-md hover:bg-surface-raised transition-colors" role="listitem">
                <span
                  className="w-5 h-5 flex items-center justify-center shrink-0"
                  style={{ color: stepCfg.color }}
                  aria-hidden="true"
                >
                  <StepIcon className="w-4 h-4" />
                </span>
                <span className="font-body text-sm font-medium text-ink flex-1 truncate">
                  {step.name}
                </span>
                {step.durationMs != null && (
                  <span className="font-body text-xs font-medium text-ink-muted/80 bg-canvas-surface px-2 py-0.5 rounded-md border border-border-color/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
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

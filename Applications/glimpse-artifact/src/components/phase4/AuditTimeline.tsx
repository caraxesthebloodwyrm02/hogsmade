import { cn } from "@/lib/utils";
import { useState } from "react";
import type { AuditEvent } from "./types";
import { Check, X, MinusCircle, Play, AlertCircle } from "lucide-react";

interface AuditTimelineProps {
  events?: AuditEvent[];
  loading?: boolean;
  error?: string;
  pageSize?: number;
  className?: string;
}

const STATUS_CONFIG: Record<
  AuditEvent["status"],
  { color: string; bg: string; icon: React.ElementType; label: string; alert?: boolean }
> = {
  success: { color: "var(--emerald-600)", bg: "var(--emerald-100)", icon: Check, label: "Success" },
  failure: { color: "var(--rose-600)", bg: "var(--rose-100)", icon: X, label: "Failed", alert: true },
  blocked: { color: "var(--amber-600)", bg: "var(--amber-100)", icon: MinusCircle, label: "Blocked", alert: true },
  dry_run: { color: "var(--teal-600)", bg: "var(--teal-100)", icon: Play, label: "Dry run" },
  error: { color: "var(--rose-600)", bg: "var(--rose-100)", icon: AlertCircle, label: "Error", alert: true },
};

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

export function AuditTimeline({
  events,
  loading,
  error,
  pageSize = 10,
  className,
}: AuditTimelineProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  if (error) {
    return (
      <div
        className={cn(
          "p-4 rounded-md border border-rose-500 bg-rose-100",
          className,
        )}
        role="alert"
      >
        <p className="font-body text-sm text-rose-600 font-medium">
          Could not load the timeline.
        </p>
        <p className="font-body text-sm text-ink-muted mt-1">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn("space-y-3 p-4", className)}
        aria-busy="true"
        aria-label="Loading timeline"
      >
        {Array.from({ length: 3 }).map((_: unknown, i: number) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full skeleton-shimmer shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 skeleton-shimmer rounded w-2/3" />
              <div className="h-3 skeleton-shimmer rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className={cn("p-6 text-center", className)}>
        <p className="font-body text-[11px] font-medium uppercase tracking-[0.08em] text-ink">
          No events yet
        </p>
        <p className="font-body text-sm text-ink-muted mt-1">
          Events will appear here as tools run across your workspace.
        </p>
      </div>
    );
  }

  const visible = events.slice(0, visibleCount);
  const hasMore = visibleCount < events.length;

  return (
    <div
      className={cn("relative flex flex-col h-[400px]", className)}
      role="list"
      aria-label="Audit event timeline"
    >
      <div className="flex-1 overflow-y-auto pr-4 -mr-4 space-y-4 relative scrollbar-thin scrollbar-thumb-border-color hover:scrollbar-thumb-border-color/80">
        <div
          className="absolute left-3 top-2 bottom-2 w-px bg-border-color/50"
          aria-hidden="true"
        />

        {visible.map((event) => {
          const cfg = STATUS_CONFIG[event.status];
          const StatusIcon = cfg.icon as React.ElementType;
          return (
            <div
              key={event.id}
              className={cn(
                "flex items-start gap-4 pl-0 py-2 relative group",
                cfg.alert ? "opacity-100" : "opacity-90 hover:opacity-100 transition-opacity"
              )}
              role="listitem"
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white z-10 shadow-sm border-[2px] border-canvas-bg",
                  cfg.alert ? "ring-4 ring-rose-50/50" : "group-hover:scale-110 transition-transform"
                )}
                style={{ backgroundColor: cfg.color }}
                aria-hidden="true"
              >
                <StatusIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
                  <span className={cn(
                    "font-heading text-sm font-bold truncate leading-tight",
                    cfg.alert ? "text-rose-900" : "text-ink"
                  )}>
                    {event.tool}
                  </span>
                  <span className="font-body text-xs font-medium text-ink-muted leading-tight bg-canvas-bg/60 px-1.5 py-0.5 rounded border border-border-color/30">
                    from {event.source}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-2 border rounded-md py-1 px-2.5 w-fit shadow-sm cursor-pointer hover:-translate-y-0.5 transition-transform",
                    cfg.alert ? "border-rose-200/60 bg-rose-50/50" : "border-border-color/30 bg-surface-raised"
                  )}
                  title={cfg.alert ? "Click to view error log" : "View details"}
                >
                  <span
                    className="font-body text-xs font-bold flex items-center gap-1.5"
                    style={{ color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border-color/60" />
                  <span className="font-body text-xs font-medium text-ink-muted">
                    {formatTime(event.timestamp)}
                  </span>
                  {event.durationMs != null && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-border-color/60" />
                      <span className="font-body text-xs font-medium text-ink-light">
                        {event.durationMs}ms
                      </span>
                    </>
                  )}
                </div>
                {event.summary && (
                  <p className={cn(
                    "font-body text-sm mt-3 tracking-wide leading-relaxed p-3 rounded-lg border",
                    cfg.alert ? "text-rose-800 bg-rose-50/30 border-rose-100" : "text-ink-muted bg-canvas-bg/50 border-border-color/50"
                  )}>
                    {event.summary}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="pt-2 pb-4 flex justify-center sticky bottom-0 bg-gradient-to-t from-canvas-surface via-canvas-surface to-transparent w-full z-10 pl-6">
            <button
              onClick={() => setVisibleCount((c: number) => c + pageSize)}
              className="font-body text-sm font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/50 min-h-touch min-w-touch px-5 py-2 rounded-full shadow-sm transition-all duration-fast focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              aria-label={`Show ${Math.min(pageSize, events.length - visibleCount)} more events`}
            >
              Load earlier events
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

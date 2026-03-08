import { cn } from "@/lib/utils";
import { useState } from "react";
import type { AuditEvent } from "./types";

interface AuditTimelineProps {
  events?: AuditEvent[];
  loading?: boolean;
  error?: string;
  pageSize?: number;
  className?: string;
}

const STATUS_CONFIG: Record<
  AuditEvent["status"],
  { color: string; icon: string; label: string }
> = {
  success: { color: "var(--emerald-500)", icon: "\u2713", label: "Success" },
  failure: { color: "var(--rose-500)", icon: "\u2717", label: "Failed" },
  blocked: { color: "var(--amber-400)", icon: "\u25CB", label: "Blocked" },
  dry_run: { color: "var(--teal-500)", icon: "\u25B7", label: "Dry run" },
  error: { color: "var(--rose-500)", icon: "!", label: "Error" },
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
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="w-6 h-6 rounded-full bg-border-color shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-border-color rounded w-2/3" />
              <div className="h-3 bg-border-color rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className={cn("p-6 text-center", className)}>
        <p className="font-heading text-lg font-medium text-ink">
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
      className={cn("relative", className)}
      role="list"
      aria-label="Audit event timeline"
    >
      <div
        className="absolute left-3 top-0 bottom-0 w-px bg-border-color"
        aria-hidden="true"
      />

      <div className="space-y-4">
        {visible.map((event) => {
          const cfg = STATUS_CONFIG[event.status];
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 pl-0 relative"
              role="listitem"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white z-10"
                style={{ backgroundColor: cfg.color }}
                aria-hidden="true"
              >
                {cfg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-body text-sm font-medium text-ink truncate">
                    {event.tool}
                  </span>
                  <span className="font-body text-sm text-ink-muted">
                    from {event.source}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="font-body text-xs font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${cfg.color}22`,
                      color: cfg.color,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span className="font-body text-xs text-ink-muted">
                    {formatTime(event.timestamp)}
                  </span>
                  {event.durationMs != null && (
                    <span className="font-body text-xs text-ink-muted">
                      {event.durationMs}ms
                    </span>
                  )}
                </div>
                {event.summary && (
                  <p className="font-body text-sm text-ink-muted mt-1 line-clamp-2">
                    {event.summary}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c: number) => c + pageSize)}
          className="mt-4 ml-9 font-body text-sm font-medium text-teal-600 hover:text-teal-700
                     min-h-touch min-w-touch px-3 py-2 rounded-md
                     transition-colors duration-fast
                     focus:outline-none focus:ring-2 focus:ring-teal-500"
          aria-label={`Show ${Math.min(pageSize, events.length - visibleCount)} more events`}
        >
          Load earlier events
        </button>
      )}
    </div>
  );
}

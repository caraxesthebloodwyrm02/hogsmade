import type { AuditEvent } from "./types";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";

interface AuditStreamPanelProps {
  events: AuditEvent[];
  loading: boolean;
  error?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  "seeds-server": "bg-emerald-100 text-emerald-700",
  "afloat-server": "bg-blue-100 text-blue-700",
  "echoes-server": "bg-purple-100 text-purple-700",
  "pulse-server": "bg-rose-100 text-rose-700",
  "grid-server": "bg-amber-100 text-amber-700",
  "lots-server": "bg-cyan-100 text-cyan-700",
  "maintain-server": "bg-orange-100 text-orange-700",
};

const STATUS_DOT: Record<AuditEvent["status"], string> = {
  success: "bg-emerald-500",
  failure: "bg-rose-500",
  blocked: "bg-amber-500",
  dry_run: "bg-blue-400",
  error: "bg-rose-600",
};

function Sparkline({ events }: { events: AuditEvent[] }) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const bins = new Array(12).fill(0);
    for (const e of events) {
      const age = now - new Date(e.timestamp).getTime();
      const idx = Math.min(11, Math.floor(age / 300000)); // 5-min buckets
      bins[11 - idx]++;
    }
    return bins;
  }, [events]);

  const max = Math.max(...buckets, 1);
  const h = 32;
  const w = 120;
  const step = w / (buckets.length - 1);

  const points = buckets
    .map((v, i) => `${i * step},${h - (v / max) * (h - 4)}`)
    .join(" ");

  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="var(--teal-500, #14b8a6)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {buckets.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * (h - 4)}
          r={1.5}
          fill="var(--teal-500, #14b8a6)"
        />
      ))}
    </svg>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function AuditStreamPanel({ events, loading, error }: AuditStreamPanelProps) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allSources = useMemo(
    () => [...new Set(events.map((e) => e.source))].sort(),
    [events],
  );

  const filtered = useMemo(
    () =>
      activeFilters.size === 0
        ? events
        : events.filter((e) => activeFilters.has(e.source)),
    [events, activeFilters],
  );

  function toggleFilter(source: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: filters + sparkline */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-ink-muted shrink-0" />
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 w-20 rounded-full bg-surface-raised animate-pulse" />
              ))
            : allSources.map((src) => (
                <button
                  key={src}
                  onClick={() => toggleFilter(src)}
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full transition-all",
                    "border",
                    activeFilters.has(src) || activeFilters.size === 0
                      ? SOURCE_COLORS[src] ?? "bg-gray-100 text-gray-700"
                      : "bg-transparent text-ink-muted border-border-color opacity-50",
                    activeFilters.has(src) ? "ring-1 ring-teal-400" : "",
                  )}
                >
                  {src.replace("-server", "")}
                </button>
              ))}
        </div>
        {!loading && <Sparkline events={filtered} />}
      </div>

      {/* Event list */}
      <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-surface-raised animate-pulse" />
            ))
          : filtered.map((evt) => {
              const isExpanded = expandedId === evt.id;
              return (
                <button
                  key={evt.id}
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                  className={cn(
                    "w-full text-left rounded-lg border border-border-color/50 bg-canvas-surface",
                    "px-3 py-2 transition-all hover:shadow-token-sm",
                    isExpanded && "ring-1 ring-teal-300",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[evt.status])} />
                    <span className="text-sm font-medium text-ink truncate flex-1">
                      {evt.tool}
                    </span>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full shrink-0",
                      SOURCE_COLORS[evt.source] ?? "bg-gray-100 text-gray-700",
                    )}>
                      {evt.source.replace("-server", "")}
                    </span>
                    <span className="text-xs text-ink-muted shrink-0">{timeAgo(evt.timestamp)}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border-color/40">
                      <pre className="text-xs text-ink-muted font-mono whitespace-pre-wrap break-all">
{JSON.stringify(
  {
    id: evt.id,
    timestamp: evt.timestamp,
    tool: evt.tool,
    source: evt.source,
    status: evt.status,
    durationMs: evt.durationMs,
    summary: evt.summary,
  },
  null,
  2,
)}
                      </pre>
                    </div>
                  )}
                </button>
              );
            })}
      </div>

      {!loading && (
        <div className="text-xs text-ink-muted text-center pt-1">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          {activeFilters.size > 0 && ` (filtered from ${events.length})`}
        </div>
      )}
    </div>
  );
}

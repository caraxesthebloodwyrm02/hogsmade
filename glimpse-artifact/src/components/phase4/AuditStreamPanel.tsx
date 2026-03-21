import type { AuditEvent } from "./types";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Filter, ChevronDown, ChevronUp, Search, Pause, Play, X } from "lucide-react";

interface AuditStreamPanelProps {
  events: AuditEvent[];
  loading: boolean;
  error?: string;
  onPauseToggle?: () => void;
  isPaused?: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  "seeds-server": "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  "afloat-server": "bg-teal-500/15 text-teal-500 border-teal-500/20",
  "echoes-server": "bg-amber-400/15 text-amber-400 border-amber-400/20",
  "pulse-server": "bg-rose-500/15 text-rose-500 border-rose-500/20",
  "grid-server": "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  "lots-server": "bg-teal-500/15 text-teal-500 border-teal-500/20",
  "maintain-server": "bg-amber-400/15 text-amber-400 border-amber-400/20",
};

const STATUS_DOT: Record<AuditEvent["status"], string> = {
  success: "bg-emerald-500",
  failure: "bg-rose-500",
  blocked: "bg-amber-500",
  dry_run: "bg-teal-500",
  error: "bg-rose-600",
};

function Sparkline({ events }: { events: AuditEvent[] }) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const bins = new Array(12).fill(0);
    for (const e of events) {
      const age = now - new Date(e.timestamp).getTime();
      const idx = Math.min(11, Math.floor(age / 300000));
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
        stroke="var(--teal-500)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {buckets.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * (h - 4)}
          r={1.5}
          fill="var(--teal-500)"
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

export function AuditStreamPanel({ events, loading, error, onPauseToggle, isPaused }: AuditStreamPanelProps) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // A2: Dynamic server filters from actual event sources
  const allSources = useMemo(
    () => [...new Set(events.map((e) => e.source))].sort(),
    [events],
  );

  // A3: Text search + source filter
  const filtered = useMemo(() => {
    let result = events;
    if (activeFilters.size > 0) {
      result = result.filter((e) => activeFilters.has(e.source));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.tool.toLowerCase().includes(q) ||
          (e.summary?.toLowerCase().includes(q) ?? false) ||
          e.source.toLowerCase().includes(q),
      );
    }
    return result;
  }, [events, activeFilters, searchQuery]);

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
      <div className="rounded-lg border border-rose-500/30 bg-rose-100 p-4 text-rose-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: filters + search + controls + sparkline */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <Filter className="w-4 h-4 text-ink-muted shrink-0" />
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-20 rounded-full skeleton-shimmer" />
            ))
            : allSources.map((src) => (
              <button
                key={src}
                onClick={() => toggleFilter(src)}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full transition-all border",
                  activeFilters.has(src) || activeFilters.size === 0
                    ? SOURCE_COLORS[src] ?? "bg-surface-raised text-ink-muted border-border-color"
                    : "bg-transparent text-ink-muted border-border-color/30 opacity-40",
                  activeFilters.has(src) ? "ring-1 ring-teal-500/40" : "",
                )}
              >
                {src.replace("-server", "")}
              </button>
            ))}
        </div>
        {!loading && <Sparkline events={filtered} />}
      </div>

      {/* A3: Search + A4: Pause/Clear */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools, sources, summaries..."
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-border-color bg-canvas-bg text-sm text-ink placeholder:text-ink-muted/50 font-body
                       focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500/30
                       transition-all duration-fast"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {onPauseToggle && (
          <button
            onClick={onPauseToggle}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all",
              isPaused
                ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
                : "border-border-color bg-canvas-surface text-ink-muted hover:text-ink",
            )}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? "Resume" : "Pause"}
          </button>
        )}
        {activeFilters.size > 0 && (
          <button
            onClick={() => setActiveFilters(new Set())}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border-color bg-canvas-surface text-xs font-medium text-ink-muted hover:text-ink transition-all"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Event list */}
      <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg skeleton-shimmer" />
          ))
          : filtered.map((evt) => {
            const isExpanded = expandedId === evt.id;
            return (
              <button
                key={evt.id}
                onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                className={cn(
                  "w-full text-left glass-panel",
                  "px-3 py-2 transition-all",
                  isExpanded && "ring-1 ring-teal-500/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[evt.status])} />
                  <span className="text-sm font-medium text-ink truncate flex-1">
                    {evt.tool}
                  </span>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full shrink-0 border",
                    SOURCE_COLORS[evt.source] ?? "bg-surface-raised text-ink-muted border-border-color",
                  )}>
                    {evt.source.replace("-server", "")}
                  </span>
                  <span className="text-xs text-ink-muted shrink-0 font-mono">{timeAgo(evt.timestamp)}</span>
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
        <div className="text-xs text-ink-muted text-center pt-1 font-mono">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          {activeFilters.size > 0 && ` (filtered from ${events.length})`}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}
    </div>
  );
}

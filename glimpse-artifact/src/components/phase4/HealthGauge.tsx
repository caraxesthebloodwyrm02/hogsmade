import { cn } from "@/lib/utils";
import type { HealthScore } from "./types";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

interface HealthGaugeProps {
  data?: HealthScore;
  loading?: boolean;
  error?: string;
  className?: string;
}

function scoreToColor(score: number): string {
  if (score >= 80) return "var(--emerald-500)";
  if (score >= 50) return "var(--amber-400)";
  return "var(--rose-500)";
}

function scoreToLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Needs attention";
  return "At risk";
}

function TrendIcon({ trend, className, style }: { trend: "up" | "down" | "stable", className?: string, style?: React.CSSProperties }) {
  if (trend === "up") return <TrendingUp className={className} style={style} />;
  if (trend === "down") return <TrendingDown className={className} style={style} />;
  return <Minus className={className} style={style} />;
}

export function HealthGauge({
  data,
  loading,
  error,
  className,
}: HealthGaugeProps) {
  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-4 rounded-xl border border-rose-500/30 bg-rose-50/50 min-h-[140px] shadow-sm",
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="w-6 h-6 text-rose-500 mb-2" />
        <p className="font-body text-sm text-rose-600 font-medium text-center">
          Loading error
        </p>
        <p className="font-body text-xs text-rose-500/80 mt-1 text-center line-clamp-2">
          {error}
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div
        className={cn(
          "flex flex-col p-4 rounded-xl border border-border-color/50 bg-canvas-surface shadow-token-sm min-h-[140px]",
          className,
        )}
        aria-busy="true"
        aria-label="Loading health score"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="h-4 bg-border-color/30 rounded w-1/2 animate-pulse" />
          <div className="w-4 h-4 bg-border-color/30 rounded-full animate-pulse" />
        </div>

        <div className="h-10 bg-border-color/20 rounded w-1/3 mb-4 animate-pulse" />

        <div className="mt-auto">
          <div className="h-3 bg-border-color/20 rounded w-1/4 mb-2 animate-pulse" />
          <div className="h-1.5 w-full bg-border-color/10 rounded-full overflow-hidden animate-pulse" />
        </div>
      </div>
    );
  }

  const score = Math.max(0, Math.min(100, data.score));
  const color = scoreToColor(score);
  const label = data.label || scoreToLabel(score);

  return (
    <div
      className={cn(
        "flex flex-col p-4 rounded-xl border border-border-color/50 bg-canvas-surface shadow-token-sm min-h-[140px]",
        "transition-all duration-300 hover:shadow-token-md hover:border-border-color",
        className
      )}
      role="figure"
      aria-label={`${data.repoName}: health score ${score} out of 100, ${label}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-heading text-sm font-bold text-ink truncate pr-2 tracking-tight" title={data.repoName}>
          {data.repoName}
        </span>
        <span aria-label={`trend ${data.trend}`} className="shrink-0 bg-canvas-bg/50 p-1 rounded-md border border-border-color/30">
          <TrendIcon trend={data.trend} className="w-3.5 h-3.5" style={{ color: data.trend === 'up' ? 'var(--emerald-500)' : data.trend === 'down' ? 'var(--rose-500)' : 'var(--ink-muted)' }} />
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-2 mt-1">
        <span
          className="font-heading text-4xl font-black tracking-tight leading-none drop-shadow-sm"
          style={{ color }}
        >
          {score}
        </span>
      </div>

      <div className="mt-auto pt-2 border-t border-border-color/20">
        <div className="flex justify-between items-center mb-2">
          <span className="font-body text-xs font-semibold text-ink-muted uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className="h-1.5 w-full bg-surface-raised rounded-full overflow-hidden border border-border-color/10">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
            style={{
              width: `${Math.max(2, score)}%`,
              backgroundColor: color
            }}
          />
        </div>
      </div>
    </div>
  );
}

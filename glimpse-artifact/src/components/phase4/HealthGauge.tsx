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

/* Radial arc constants */
const ARC_RADIUS = 40;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

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
          "flex flex-col items-center justify-center p-4 rounded-xl border border-rose-500/30 bg-rose-100 min-h-[180px] shadow-sm",
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
          "flex flex-col items-center justify-center p-4 rounded-xl border border-border-color/50 bg-canvas-surface shadow-token-sm min-h-[180px]",
          className,
        )}
        aria-busy="true"
        aria-label="Loading health score"
      >
        <div className="w-[96px] h-[96px] rounded-full border-[3px] border-border-color/20 animate-pulse mb-3" />
        <div className="h-3 bg-border-color/30 rounded w-2/3 animate-pulse mb-1" />
        <div className="h-2 bg-border-color/20 rounded w-1/3 animate-pulse" />
      </div>
    );
  }

  const score = Math.max(0, Math.min(100, data.score));
  const color = scoreToColor(score);
  const label = data.label || scoreToLabel(score);
  const dashOffset = ARC_CIRCUMFERENCE - (score / 100) * ARC_CIRCUMFERENCE;

  return (
    <div
      className={cn(
        "flex flex-col items-center p-4 rounded-xl border border-border-color/50 bg-canvas-surface shadow-token-sm min-h-[180px] card-glow",
        className
      )}
      role="figure"
      aria-label={`${data.repoName}: health score ${score} out of 100, ${label}`}
    >
      {/* Repo name + trend */}
      <div className="flex items-center justify-between w-full mb-3">
        <span className="font-heading text-sm font-bold text-ink truncate pr-2 tracking-tight" title={data.repoName}>
          {data.repoName}
        </span>
        <span aria-label={`trend ${data.trend}`} className="shrink-0 p-1 rounded-md border border-border-color/30 bg-canvas-bg/50">
          <TrendIcon trend={data.trend} className="w-3 h-3" style={{ color: data.trend === 'up' ? 'var(--emerald-500)' : data.trend === 'down' ? 'var(--rose-500)' : 'var(--ink-muted)' }} />
        </span>
      </div>

      {/* Radial arc gauge */}
      <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0 -rotate-90">
          {/* Background track */}
          <circle
            cx="48" cy="48" r={ARC_RADIUS}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.3"
          />
          {/* Score arc */}
          <circle
            cx="48" cy="48" r={ARC_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={ARC_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="animate-arc-reveal"
            style={{
              "--arc-length": ARC_CIRCUMFERENCE,
              "--arc-offset": dashOffset,
              filter: `drop-shadow(0 0 6px ${color})`,
            } as React.CSSProperties}
          />
        </svg>
        {/* Score number centered */}
        <span
          className="font-mono text-2xl font-bold tracking-tight leading-none"
          style={{ color }}
        >
          {score}
        </span>
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <span
          className="font-body text-xs font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

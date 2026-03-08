import { cn } from "@/lib/utils";
import type { HealthScore } from "./types";

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

function trendArrow(trend: "up" | "down" | "stable"): string {
  if (trend === "up") return "\u2191";
  if (trend === "down") return "\u2193";
  return "\u2192";
}

export function HealthGauge({
  data,
  loading,
  error,
  className,
}: HealthGaugeProps) {
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-4 rounded-md border border-rose-500 bg-rose-100 min-h-[160px]",
          className,
        )}
        role="alert"
      >
        <p className="font-body text-sm text-rose-600 font-medium text-center">
          Something went wrong loading health data.
        </p>
        <p className="font-body text-sm text-ink-muted mt-1 text-center">
          {error}
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-4 min-h-[160px]",
          className,
        )}
        aria-busy="true"
        aria-label="Loading health score"
      >
        <div className="w-[120px] h-[120px] rounded-full border-4 border-border-color animate-pulse" />
        <p className="font-body text-sm text-ink-muted mt-2">
          Loading health...
        </p>
      </div>
    );
  }

  const score = Math.max(0, Math.min(100, data.score));
  const offset = circumference - (score / 100) * circumference;
  const color = scoreToColor(score);
  const label = data.label || scoreToLabel(score);

  return (
    <div
      className={cn("flex flex-col items-center p-4", className)}
      role="figure"
      aria-label={`${data.repoName}: health score ${score} out of 100, ${label}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: `stroke-dashoffset var(--duration-slow) var(--easing-default)`,
          }}
        />
      </svg>

      <div className="flex flex-col items-center mt-2 gap-0.5">
        <span
          className="font-heading text-xl font-bold text-ink"
          style={{ color }}
        >
          {score}
        </span>
        <span className="font-body text-sm font-medium text-ink">
          {data.repoName}
        </span>
        <span className="font-body text-sm text-ink-muted flex items-center gap-1">
          {label}
          <span aria-label={`trend ${data.trend}`}>
            {trendArrow(data.trend)}
          </span>
        </span>
      </div>
    </div>
  );
}

import type { CognitionPattern } from "./types";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CognitionRadarProps {
  patterns: CognitionPattern[];
  loading: boolean;
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

export function CognitionRadar({ patterns, loading }: CognitionRadarProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const n = patterns.length;
  if (n === 0) return null;

  const cx = 200;
  const cy = 200;
  const maxR = 150;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2; // start from top

  // Build the filled polygon for activation levels
  const polyPoints = patterns
    .map((p, i) => {
      const angle = startAngle + i * angleStep;
      const r = p.activation * maxR;
      const pt = polarToCartesian(cx, cy, r, angle);
      return `${pt.x},${pt.y}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <svg viewBox="0 0 400 400" className="w-full max-w-[400px] shrink-0" role="img" aria-label="Cognition Pattern Radar">
        {/* Background rings */}
        {rings.map((frac) => (
          <circle
            key={frac}
            cx={cx}
            cy={cy}
            r={maxR * frac}
            fill="none"
            stroke="var(--border-color, #e5e7eb)"
            strokeWidth={0.5}
          />
        ))}

        {/* Ring labels */}
        {rings.map((frac) => (
          <text
            key={`lbl-${frac}`}
            x={cx + 4}
            y={cy - maxR * frac + 12}
            className="text-[9px] fill-ink-muted font-body"
          >
            {Math.round(frac * 100)}%
          </text>
        ))}

        {/* Axis lines */}
        {patterns.map((_, i) => {
          const angle = startAngle + i * angleStep;
          const pt = polarToCartesian(cx, cy, maxR + 8, angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={pt.x}
              y2={pt.y}
              stroke="var(--border-color, #e5e7eb)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Filled area */}
        <polygon
          points={polyPoints}
          fill="var(--teal-100)"
          stroke="var(--teal-500)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Data points + labels */}
        {patterns.map((p, i) => {
          const angle = startAngle + i * angleStep;
          const r = p.activation * maxR;
          const pt = polarToCartesian(cx, cy, r, angle);
          const labelPt = polarToCartesian(cx, cy, maxR + 22, angle);
          const isHovered = hoveredIdx === i;

          return (
            <g
              key={p.name}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6 : 4}
                fill="var(--teal-500)"
                stroke="var(--ink)"
                strokeWidth={2}
                className="transition-all duration-150"
              />
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="central"
                className={cn(
                  "font-body text-[11px]",
                  isHovered ? "fill-ink font-bold" : "fill-ink-muted font-medium",
                )}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      <div className="space-y-2 w-full lg:w-56">
        {patterns
          .slice()
          .sort((a, b) => b.activation - a.activation)
          .map((p, i) => {
            const isHovered = hoveredIdx !== null && patterns[hoveredIdx]?.name === p.name;
            return (
              <div
                key={p.name}
                onMouseEnter={() => setHoveredIdx(patterns.findIndex((pp) => pp.name === p.name))}
                onMouseLeave={() => setHoveredIdx(null)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isHovered ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-surface-raised",
                )}
              >
                <span className="text-xs text-ink-muted w-4 text-right font-mono">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    <span className="text-xs font-mono text-teal-600">{Math.round(p.activation * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-500 transition-all duration-300"
                      style={{ width: `${p.activation * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-ink-muted shrink-0">{p.recentQueries}q</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

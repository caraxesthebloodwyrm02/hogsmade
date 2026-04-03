import { AlertTriangle } from "lucide-react";
import type { BoardKnob } from "../types/board";
import { HOUSE_META } from "../types/board";

interface KnobProps {
  knob: BoardKnob;
  isSelected: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

const HEALTH_GLOW: Record<string, string> = {
  green: "var(--shadow-glow-green)",
  yellow: "var(--shadow-glow-yellow)",
  red: "var(--shadow-glow-red)",
  unknown: "none",
};

const STATUS_COLOR: Record<string, string> = {
  ready: "var(--color-led-green)",
  running: "var(--color-led-blue)",
  error: "var(--color-led-red)",
  disabled: "var(--color-text-muted)",
};

function KnobDial({
  color,
  isSelected,
  status,
}: {
  color: string;
  isSelected: boolean;
  status: string;
}) {
  const indicatorAngle = status === "running" ? 270 : status === "ready" ? 220 : 140;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="drop-shadow-md">
      {/* Outer ring with gradient */}
      <defs>
        <radialGradient id="knob-face" cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor="var(--color-panel-raised)" />
          <stop offset="100%" stopColor="var(--color-knob-bg)" />
        </radialGradient>
        <filter id="knob-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.5)" />
        </filter>
      </defs>
      {/* Track arc */}
      <circle
        cx="22"
        cy="22"
        r="19"
        fill="none"
        stroke="var(--color-knob-ring)"
        strokeWidth="2.5"
        opacity="0.5"
      />
      {/* Active arc (shows parameter count as fill) */}
      {isSelected && (
        <circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="119.4"
          strokeDashoffset="30"
          strokeLinecap="round"
          opacity="0.6"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      )}
      {/* Knob face */}
      <circle cx="22" cy="22" r="15" fill="url(#knob-face)" filter="url(#knob-shadow)" />
      {/* Inner bevel highlight */}
      <circle
        cx="22"
        cy="22"
        r="14"
        fill="none"
        stroke="var(--color-panel-border-light)"
        strokeWidth="0.5"
        opacity="0.3"
      />
      {/* Indicator line */}
      <line
        x1="22"
        y1="22"
        x2={22 + 10 * Math.cos((indicatorAngle * Math.PI) / 180)}
        y2={22 + 10 * Math.sin((indicatorAngle * Math.PI) / 180)}
        stroke={isSelected ? color : "var(--color-text-muted)"}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
      {/* Center dot */}
      <circle cx="22" cy="22" r="2.5" fill={isSelected ? color : "var(--color-knob-highlight)"} />
    </svg>
  );
}

export function Knob({ knob, isSelected, onClick, style }: KnobProps) {
  const house = HOUSE_META[knob.house];

  return (
    <button
      onClick={onClick}
      aria-label={`${knob.label}: ${knob.description}`}
      aria-pressed={isSelected}
      title={knob.description}
      style={style}
      className={`
        press-scale group relative flex flex-col items-center gap-1 p-2 rounded-xl
        border-2 cursor-pointer min-w-[96px]
        transition-all duration-200 ease-out
        ${
          isSelected
            ? "border-white/30 bg-panel-light shadow-lg"
            : "border-transparent bg-panel hover:border-panel-border-light hover:bg-panel-light"
        }
      `}
    >
      {/* Health LED */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor:
              knob.healthIndicator === "unknown"
                ? "var(--color-panel-border)"
                : `var(--color-led-${knob.healthIndicator})`,
            boxShadow: HEALTH_GLOW[knob.healthIndicator],
          }}
          aria-label={`Health: ${knob.healthIndicator}`}
        />
      </div>

      {/* SVG Knob dial */}
      <KnobDial color={house.color} isSelected={isSelected} status={knob.status} />

      {/* Label */}
      <span className="text-[11px] leading-tight text-center text-text-secondary group-hover:text-text-primary transition-colors max-w-[84px] truncate font-medium">
        {knob.label}
      </span>

      {/* Status + param count */}
      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: STATUS_COLOR[knob.status] }}
        />
        <span className="tabular-nums">{knob.parameters.length}p</span>
      </div>

      {/* Flags */}
      {knob.flags.length > 0 && (
        <div className="absolute top-1.5 left-1.5 flex gap-0.5">
          {knob.flags.slice(0, 3).map((flag, i) => (
            <div
              key={i}
              className="w-1.5 h-3 rounded-full"
              style={{ backgroundColor: house.color, opacity: 0.7 }}
              title={flag}
              aria-label={`Flag: ${flag}`}
            />
          ))}
        </div>
      )}

      {/* Governance warning */}
      {knob.description.length > 120 && (
        <div
          className="absolute -bottom-1 -right-1"
          aria-label="Governance warning: description exceeds 120 chars"
        >
          <AlertTriangle size={12} className="text-led-yellow" />
        </div>
      )}
    </button>
  );
}

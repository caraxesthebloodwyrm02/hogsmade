interface BranchForkProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
}

export function BranchFork({ fromX, fromY, toX, toY, label }: BranchForkProps) {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="var(--teal-200)" strokeWidth={2} strokeDasharray="6 4" />
      <circle cx={fromX} cy={fromY} r={4} fill="var(--teal-500)" />
      <circle cx={toX} cy={toY} r={4} fill="var(--teal-500)" />

      {label && (
        <text
          x={midX}
          y={midY - 8}
          textAnchor="middle"
          className="font-body"
          style={{
            fontSize: "var(--text-sm)",
            fill: "var(--ink-muted)",
          }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

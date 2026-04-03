import { cn } from "@/lib/utils";
import type {
  BeatRailEntry,
  CollectionRow,
  ConditionNote,
  CycleSnapshot,
  MomentumFrame,
  ObservationNote,
  PromotionGateResult,
} from "@/components/phase4/types";

interface EligibilityMemoViewProps {
  snapshot: CycleSnapshot;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

const BEAT_COLORS: Record<string, string> = {
  map: "var(--violet-400)",
  balance: "var(--teal-500)",
  tighten: "var(--amber-400)",
  verify: "var(--emerald-500)",
};

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; glow: string }> =
  {
    priority: {
      border: "rgba(232, 93, 93, 0.35)",
      bg: "rgba(232, 93, 93, 0.06)",
      text: "var(--rose-500)",
      glow: "var(--glow-rose)",
    },
    watch: {
      border: "rgba(240, 168, 48, 0.35)",
      bg: "rgba(240, 168, 48, 0.06)",
      text: "var(--amber-400)",
      glow: "var(--glow-amber)",
    },
    info: {
      border: "rgba(78, 205, 196, 0.25)",
      bg: "rgba(78, 205, 196, 0.04)",
      text: "var(--teal-500)",
      glow: "var(--glow-emerald)",
    },
  };

const BAND_COLORS: Record<string, string> = {
  trace: "#1e1a35",
  steady: "#26908c",
  elevated: "#c78e2e",
  dominant: "#ffda4d",
};

const DIMENSION_LABELS: Record<string, string> = {
  governance: "GOV",
  usability: "USA",
  integration: "INT",
  observability: "OBS",
  operational_fit: "OPS",
};

const PASS_LABELS = [
  "normalize",
  "catalog",
  "weights",
  "hierarchy",
  "conditions",
  "observations",
  "forms",
  "table",
];

// ── Section Divider ─────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="section-divider">
      <div className="section-divider-line" />
      <span className="section-divider-label">
        <span className="section-divider-sym">&#x25C6;</span>
        {label}
      </span>
      <div className="section-divider-line" />
    </div>
  );
}

// ── Beat Rail ───────────────────────────────────────────────────────

function BeatRail({ rail }: { rail: BeatRailEntry[] }) {
  return (
    <div className="flex items-center gap-1">
      {rail.map((entry, i) => {
        const color = BEAT_COLORS[entry.beat] ?? "var(--ink-muted)";
        const isCurrent = entry.state === "current";
        const isComplete = entry.state === "complete";
        return (
          <div key={entry.beat} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className="w-4 h-px"
                style={{ background: isComplete || isCurrent ? color : "var(--sediment-dark)" }}
              />
            )}
            <div
              className={cn(
                "flex items-center justify-center rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-all",
                isCurrent && "breathe-glow",
              )}
              style={{
                background: isCurrent
                  ? `${color}22`
                  : isComplete
                    ? `${color}11`
                    : "var(--canvas-bg)",
                border: `1px solid ${isCurrent ? color : isComplete ? `${color}44` : "var(--sediment-dark)"}`,
                color: isCurrent || isComplete ? color : "var(--ink-ghost)",
                boxShadow: isCurrent ? `0 0 12px ${color}33` : "none",
              }}
            >
              {entry.beat}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Promotion Verdict ───────────────────────────────────────────────

function PromotionVerdict({ gate }: { gate: PromotionGateResult | null }) {
  if (!gate) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-sediment-dark bg-canvas-bg/50">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-ghost">
          No gate evaluation
        </span>
      </div>
    );
  }

  const passed = gate.passed;
  const color = passed ? "var(--emerald-500)" : "var(--rose-500)";
  const label = gate.decision.replace(/_/g, " ");

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg overflow-hidden"
      style={{
        background: passed ? "rgba(78, 205, 196, 0.06)" : "rgba(232, 93, 93, 0.06)",
        border: `1px solid ${passed ? "rgba(78, 205, 196, 0.3)" : "rgba(232, 93, 93, 0.3)"}`,
        boxShadow: passed ? "var(--glow-emerald)" : "var(--glow-rose)",
      }}
    >
      {/* Stamp circle */}
      <div
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-heading text-lg font-bold"
        style={{
          background: `${color}18`,
          border: `2px solid ${color}`,
          color,
          boxShadow: `0 0 16px ${color}44`,
        }}
      >
        {passed ? "\u2713" : "\u2717"}
      </div>
      <div className="flex flex-col">
        <span className="font-heading text-sm font-bold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
        {gate.reasons.length > 0 && (
          <span className="font-body text-[11px] text-ink-muted mt-0.5 line-clamp-2">
            {gate.reasons[0]}
            {gate.reasons.length > 1 && ` (+${gate.reasons.length - 1} more)`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Pentagon Radar ──────────────────────────────────────────────────

function DimensionRadar({ scores }: { scores: Record<string, number> }) {
  const dims = ["governance", "usability", "integration", "observability", "operational_fit"];
  const cx = 90;
  const cy = 90;
  const maxR = 70;
  const n = dims.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const rings = [0.25, 0.5, 0.75, 1.0];

  // Pentagon ring paths
  function ringPath(frac: number) {
    const points = dims.map((_, i) => {
      const angle = startAngle + i * angleStep;
      const x = cx + maxR * frac * Math.cos(angle);
      const y = cy + maxR * frac * Math.sin(angle);
      return `${x},${y}`;
    });
    return `M${points.join("L")}Z`;
  }

  // Data polygon
  const dataPoints = dims.map((dim, i) => {
    const angle = startAngle + i * angleStep;
    const r = (scores[dim] ?? 0) * maxR;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  });

  return (
    <svg viewBox="0 0 180 180" className="w-full max-w-[200px]">
      {/* Grid rings */}
      {rings.map((frac) => (
        <path
          key={frac}
          d={ringPath(frac)}
          fill="none"
          stroke="var(--sediment-dark)"
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {dims.map((_, i) => {
        const angle = startAngle + i * angleStep;
        const ex = cx + maxR * Math.cos(angle);
        const ey = cy + maxR * Math.sin(angle);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="var(--sediment-dark)"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data fill */}
      <polygon
        points={dataPoints.join(" ")}
        fill="rgba(78, 205, 196, 0.12)"
        stroke="var(--teal-500)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Data dots + labels */}
      {dims.map((dim, i) => {
        const angle = startAngle + i * angleStep;
        const score = scores[dim] ?? 0;
        const r = score * maxR;
        const dx = cx + r * Math.cos(angle);
        const dy = cy + r * Math.sin(angle);
        const lx = cx + (maxR + 14) * Math.cos(angle);
        const ly = cy + (maxR + 14) * Math.sin(angle);
        return (
          <g key={dim}>
            <circle
              cx={dx}
              cy={dy}
              r="3"
              fill="var(--teal-500)"
              stroke="var(--canvas-bg)"
              strokeWidth="1.5"
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[8px] font-mono fill-ink-muted uppercase"
              style={{ letterSpacing: "0.08em" }}
            >
              {DIMENSION_LABELS[dim]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score Bar ────────────────────────────────────────────────────────

function ScoreBar({
  score,
  label,
  rank,
  band,
}: {
  score: number;
  label: string;
  rank: number;
  band?: string;
}) {
  const bandColor = band ? (BAND_COLORS[band] ?? "var(--sediment-mid)") : "var(--teal-500)";
  const width = Math.max(2, score * 100);

  return (
    <div className="flex items-center gap-3 group">
      <span className="font-mono text-[10px] text-ink-ghost w-4 text-right shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-body text-xs text-ink truncate">{label}</span>
          <span className="font-mono text-[11px] text-ink-muted shrink-0 ml-2">{fmt(score)}</span>
        </div>
        <div className="confidence-track">
          <div
            className="confidence-fill"
            style={{
              width: `${width}%`,
              background: `linear-gradient(90deg, ${bandColor}88, ${bandColor})`,
              boxShadow: `0 0 8px ${bandColor}44`,
            }}
          />
        </div>
      </div>
      {band && (
        <span
          className="lens-badge !text-[9px] !px-1.5 !py-0"
          style={{
            color: bandColor,
            borderColor: `${bandColor}33`,
            background: `${bandColor}0a`,
          }}
        >
          {band}
        </span>
      )}
    </div>
  );
}

// ── Momentum Arc Gauge ──────────────────────────────────────────────

function MomentumGauge({
  value,
  label,
  color,
  thresholdValue,
}: {
  value: number;
  label: string;
  color: string;
  thresholdValue?: number;
}) {
  const R = 32;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC - Math.min(value, 1) * CIRC;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 80 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="var(--sediment-dark)"
            strokeWidth="4"
            opacity="0.4"
          />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            className="animate-arc-reveal"
            style={
              {
                "--arc-length": CIRC,
                "--arc-offset": offset,
                filter: `drop-shadow(0 0 5px ${color}88)`,
              } as React.CSSProperties
            }
          />
          {thresholdValue !== undefined && (
            <circle
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke="var(--rose-500)"
              strokeWidth="1"
              strokeDasharray="2 4"
              strokeDashoffset={CIRC - thresholdValue * CIRC}
              opacity="0.5"
            />
          )}
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold"
          style={{ color }}
        >
          {fmt(value)}
        </span>
      </div>
      <span className="stat-label mt-1">{label}</span>
    </div>
  );
}

// ── Pipeline Residue Trace ──────────────────────────────────────────

function ResidueTrace({ rows }: { rows: CollectionRow[] }) {
  // Estimate deposit counts from table rows
  const passCounts = PASS_LABELS.map((_, i) => {
    // Approximate: weight rows for pass 2, dimension rows for pass 3, etc.
    if (i === 0) return 1; // normalize
    if (i === 1) return 10; // catalog (10 attributes)
    if (i === 2) return rows.filter((r) => r.rowType === "attribute").length || 1;
    if (i === 3) return rows.filter((r) => r.rowType === "dimension").length || 1;
    if (i === 4) return rows.filter((r) => r.conditionIds.length > 0).length || 0;
    if (i === 5) return rows.filter((r) => r.observationIds.length > 0).length || 0;
    if (i === 6) return 5; // forms
    if (i === 7) return rows.length;
    return 0;
  });

  const maxCount = Math.max(1, ...passCounts);

  return (
    <div className="flex items-end gap-1 h-16">
      {PASS_LABELS.map((label, i) => {
        const count = passCounts[i];
        const height = Math.max(4, (count / maxCount) * 100);
        const brightness = 0.3 + (count / maxCount) * 0.7;

        return (
          <div
            key={label}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${label}: ${count}`}
          >
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${height}%`,
                background: `rgba(78, 205, 196, ${brightness * 0.7})`,
                boxShadow:
                  brightness > 0.6 ? `0 0 6px rgba(78, 205, 196, ${brightness * 0.3})` : "none",
              }}
            />
            <span className="font-mono text-[7px] text-ink-ghost uppercase tracking-wider whitespace-nowrap">
              {label.slice(0, 4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Condition Card ──────────────────────────────────────────────────

function ConditionCard({ note }: { note: ConditionNote }) {
  const style = SEVERITY_STYLES[note.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className="rounded-lg px-3 py-2 surface-anim"
      style={{
        border: `1px solid ${style.border}`,
        background: style.bg,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="font-mono text-[9px] uppercase tracking-widest font-bold"
          style={{ color: style.text }}
        >
          {note.severity}
        </span>
        <span className="font-mono text-[9px] text-ink-ghost uppercase tracking-wider">
          {note.dimension}
        </span>
      </div>
      <p className="font-body text-xs text-ink-muted leading-relaxed">{note.message}</p>
    </div>
  );
}

// ── Observation Card ────────────────────────────────────────────────

function ObservationCard({ note }: { note: ObservationNote }) {
  return (
    <div
      className="rounded-lg px-3 py-2 border surface-anim"
      style={{
        borderColor: "var(--sediment-dark)",
        background: "rgba(78, 205, 196, 0.02)",
      }}
    >
      <p className="font-body text-xs text-ink-muted leading-relaxed">{note.message}</p>
      <p
        className="font-mono text-[10px] mt-1 leading-snug"
        style={{ color: "var(--ink-tertiary)" }}
      >
        {note.surfaceHint}
      </p>
    </div>
  );
}

// ── Weight Band Distribution Strip ──────────────────────────────────

function BandDistribution({ rows }: { rows: CollectionRow[] }) {
  const bands = { trace: 0, steady: 0, elevated: 0, dominant: 0 };
  for (const row of rows) {
    if (row.weightBand && row.weightBand in bands) {
      bands[row.weightBand as keyof typeof bands] += 1;
    }
  }
  const total = Math.max(
    1,
    Object.values(bands).reduce((a, b) => a + b, 0),
  );

  return (
    <div className="space-y-1.5">
      {/* Strip */}
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ background: "var(--sediment-dark)" }}
      >
        {(Object.entries(bands) as [string, number][]).map(([band, count]) => {
          const w = (count / total) * 100;
          if (w === 0) return null;
          return (
            <div
              key={band}
              style={{
                width: `${w}%`,
                background: BAND_COLORS[band],
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15)`,
              }}
              title={`${band}: ${count} (${Math.round(w)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {(Object.entries(bands) as [string, number][]).map(([band, count]) => (
          <div key={band} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: BAND_COLORS[band] }} />
            <span className="font-mono text-[9px] text-ink-ghost uppercase tracking-wider">
              {band}
            </span>
            <span className="font-mono text-[10px] text-ink-muted">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Memo Component ─────────────────────────────────────────────

export function EligibilityMemoView({ snapshot, className }: EligibilityMemoViewProps) {
  const { caseRecord, beatRail, summary } = snapshot;
  const result = caseRecord.latestEligibilityResult;
  const momentum: MomentumFrame = caseRecord.momentum;
  const gate = caseRecord.latestPromotionDecision;
  const rows = result?.table.rows ?? [];

  // Build dimension scores from table rows for top candidate
  const topCandidateId = caseRecord.candidateIds[0];
  const dimScores: Record<string, number> = {};
  for (const row of rows) {
    if (
      row.rowType === "dimension" &&
      row.candidateId === topCandidateId &&
      row.dimensionScore !== null
    ) {
      dimScores[row.dimension] = row.dimensionScore;
    }
  }

  // Build candidate ranking from overall dimension rows
  const overallRows = rows
    .filter(
      (r) => r.rowType === "dimension" && r.dimension === "overall" && r.dimensionScore !== null,
    )
    .sort((a, b) => (a.hierarchyRank ?? 99) - (b.hierarchyRank ?? 99));

  // Determine dominant band per candidate
  const candidateBands = new Map<string, string>();
  for (const row of rows) {
    if (row.rowType === "attribute" && row.weightBand) {
      const current = candidateBands.get(row.candidateId);
      const bandOrder = ["trace", "steady", "elevated", "dominant"];
      if (!current || bandOrder.indexOf(row.weightBand) > bandOrder.indexOf(current)) {
        candidateBands.set(row.candidateId, row.weightBand);
      }
    }
  }

  return (
    <div className={cn("max-w-2xl mx-auto px-6 py-8 space-y-1 stagger-children", className)}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="glass-panel px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-xl font-bold text-ink tracking-tight truncate">
              {caseRecord.label}
            </h1>
            <p className="font-body text-sm text-ink-muted mt-1 leading-relaxed">{summary}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className="font-mono text-[10px] text-ink-ghost uppercase tracking-widest">
              {caseRecord.caseId.slice(0, 16)}
            </span>
            <BeatRail rail={beatRail} />
          </div>
        </div>
      </div>

      {/* ── Promotion Verdict ────────────────────────────────────── */}
      <SectionDivider label="Promotion Gate" />
      <PromotionVerdict gate={gate} />

      {/* ── Dimension Radar + Momentum Gauges ────────────────────── */}
      <SectionDivider label="Dimensions & Momentum" />
      <div className="glass-panel px-5 py-4">
        <div className="flex items-center gap-6 flex-wrap">
          <DimensionRadar scores={dimScores} />
          <div className="flex-1 min-w-[200px] flex items-center justify-around gap-4">
            <MomentumGauge
              value={momentum.momentum}
              label="Momentum"
              color={momentum.momentum > 0.5 ? "var(--emerald-500)" : "var(--amber-400)"}
            />
            <MomentumGauge
              value={momentum.sidewalkDrift}
              label="Drift"
              color={momentum.sidewalkDrift >= 0.35 ? "var(--rose-500)" : "var(--teal-500)"}
              thresholdValue={0.35}
            />
            <MomentumGauge value={momentum.acceleration} label="Accel" color="var(--violet-400)" />
          </div>
        </div>
      </div>

      {/* ── Candidate Ranking ────────────────────────────────────── */}
      <SectionDivider label="Candidate Hierarchy" />
      <div className="glass-panel px-5 py-4 space-y-2.5">
        {overallRows.length > 0 ? (
          overallRows.map((row) => {
            const cid = row.candidateId;
            const label = cid.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <ScoreBar
                key={row.rowId}
                score={row.dimensionScore ?? 0}
                label={label}
                rank={row.hierarchyRank ?? 0}
                band={candidateBands.get(cid)}
              />
            );
          })
        ) : (
          <p className="font-body text-xs text-ink-ghost text-center py-4">
            No hierarchy data available.
          </p>
        )}
      </div>

      {/* ── Weight Band Distribution ─────────────────────────────── */}
      <SectionDivider label="Weight Band Distribution" />
      <div className="glass-panel px-5 py-4">
        <BandDistribution rows={rows} />
      </div>

      {/* ── Pipeline Residue Trace ───────────────────────────────── */}
      <SectionDivider label="Pipeline Residue (8 Passes)" />
      <div className="glass-panel px-5 py-4">
        <ResidueTrace rows={rows} />
      </div>

      {/* ── Conditions ───────────────────────────────────────────── */}
      {caseRecord.conditionNotes.length > 0 && (
        <>
          <SectionDivider label="Conditions" />
          <div className="space-y-2">
            {caseRecord.conditionNotes.map((note) => (
              <ConditionCard key={note.id} note={note} />
            ))}
          </div>
        </>
      )}

      {/* ── Observations ─────────────────────────────────────────── */}
      {caseRecord.observationNotes.length > 0 && (
        <>
          <SectionDivider label="Observations" />
          <div className="space-y-2">
            {caseRecord.observationNotes.slice(0, 6).map((note) => (
              <ObservationCard key={note.id} note={note} />
            ))}
            {caseRecord.observationNotes.length > 6 && (
              <p className="font-mono text-[10px] text-ink-ghost text-center">
                +{caseRecord.observationNotes.length - 6} more observations
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Promotion Thresholds (if gate exists) ────────────────── */}
      {gate && (
        <>
          <SectionDivider label="Gate Thresholds vs. Metrics" />
          <div className="glass-panel px-5 py-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {(
                [
                  ["Overall", gate.thresholds.overallScore, gate.metrics.overallScore],
                  ["Governance", gate.thresholds.governanceScore, gate.metrics.governanceScore],
                  ["Integration", gate.thresholds.integrationScore, gate.metrics.integrationScore],
                  ["Drift", gate.thresholds.sidewalkDrift, gate.metrics.sidewalkDrift],
                ] as [string, number, number][]
              ).map(([label, threshold, actual]) => {
                const passed = label === "Drift" ? actual < threshold : actual >= threshold;
                return (
                  <div key={label} className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ink-muted uppercase tracking-wider">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs font-bold"
                        style={{ color: passed ? "var(--emerald-500)" : "var(--rose-500)" }}
                      >
                        {fmt(actual)}
                      </span>
                      <span className="font-mono text-[9px] text-ink-ghost">
                        / {fmt(threshold)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="pt-4 pb-2 flex items-center justify-between">
        <span className="font-mono text-[9px] text-ink-ghost uppercase tracking-widest">
          Eligibility Routine Memo
        </span>
        <span className="font-mono text-[9px] text-ink-ghost">
          {new Date(caseRecord.updatedAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

/**
 * Mood Surface — Session Entry View
 *
 * A single flowing surface that greets you on session start.
 * Not a dashboard. A mood. An emotional handshake from the system.
 *
 * "I was the water and you were the boat,
 *  you said you're drowning though I kept you afloat."
 */

import { cn } from "@/lib/utils";
import {
  useSessionEntry,
  type ClusterSummary,
  type EcosystemMood,
  type PulseColor,
} from "@/hooks/useSessionEntry";

// ── Gradient Maps ──

const PULSE_GRADIENTS: Record<PulseColor, string> = {
  teal: "from-[#0b1215] via-[#0f2a2e] to-[#0b1215]",
  amber: "from-[#0b1215] via-[#2a1f0f] to-[#0b1215]",
  coral: "from-[#0b1215] via-[#2a0f14] to-[#0b1215]",
};

const PULSE_GLOW: Record<PulseColor, string> = {
  teal: "rgba(78, 205, 196, 0.08)",
  amber: "rgba(240, 168, 48, 0.08)",
  coral: "rgba(232, 93, 93, 0.08)",
};

const MOOD_ICONS: Record<EcosystemMood, string> = {
  thriving: "\u25C9", // fisheye
  steady: "\u25CB",   // circle
  drifting: "\u223F", // sine wave
  recovering: "\u21BA", // ccw arrow
  quiet: "\u00B7",    // middle dot
};

// ── Component ──

export function MoodSurface() {
  const { data, loading } = useSessionEntry();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="skeleton-shimmer w-64 h-4 rounded" />
      </div>
    );
  }

  const {
    narrative,
    pulseColor,
    energyTag,
    mood,
    lastPosition,
    historyWhisper,
    clusters,
    ecosystemScore,
    trustRelationships,
    driftCount,
    driftSeverity,
  } = data;

  return (
    <div
      className={cn(
        "h-full overflow-auto",
        "bg-gradient-to-b",
        PULSE_GRADIENTS[pulseColor],
      )}
    >
      {/* Atmospheric glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${PULSE_GLOW[pulseColor]} 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12 space-y-10 stagger-children">

        {/* ── Pulse Header ── */}
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-lg",
                pulseColor === "teal" && "text-[var(--teal-500)]",
                pulseColor === "amber" && "text-[var(--amber-400)]",
                pulseColor === "coral" && "text-[var(--rose-500)]",
              )}
            >
              {MOOD_ICONS[mood]}
            </span>
            <span className="stat-label tracking-widest">
              {mood}
            </span>
            {ecosystemScore !== null && (
              <span className="stat-label ml-auto opacity-0 hover:opacity-100 transition-opacity duration-slow">
                {ecosystemScore}/100
              </span>
            )}
          </div>

          {/* ── Narrative ── */}
          <p
            className="font-body text-lg leading-relaxed text-[var(--ink)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {narrative}
          </p>
        </header>

        {/* ── Energy Reference ── */}
        <div className="glass-panel px-5 py-4">
          <div className="section-divider-label mb-2">
            <span className="section-divider-sym">{"\u266B"}</span>
            energy
          </div>
          <p
            className="font-body text-base text-[var(--ink-muted)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {energyTag}
          </p>
        </div>

        {/* ── Constellation ── */}
        <div className="space-y-3">
          <div className="section-divider">
            <span className="section-divider-line" />
            <span className="section-divider-label">
              <span className="section-divider-sym">{"\u25C6"}</span>
              constellation
            </span>
            <span className="section-divider-line" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        </div>

        {/* ── Trust Narrative ── */}
        {trustRelationships.length > 0 && (
          <div className="space-y-3">
            <div className="section-divider">
              <span className="section-divider-line" />
              <span className="section-divider-label">
                <span className="section-divider-sym">{"\u2726"}</span>
                trust — to whom
              </span>
              <span className="section-divider-line" />
            </div>

            <div className="space-y-2">
              {trustRelationships
                .filter((r) => r.confidence !== null)
                .map((rel, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-2 rounded-md"
                    style={{ background: "var(--biolum-cyan-ghost)" }}
                  >
                    <span className="font-mono text-sm text-[var(--ink-muted)]">
                      {rel.observer} {"\u2192"} {rel.subject}
                    </span>
                    <TrustBar confidence={rel.confidence!} />
                  </div>
                ))}
              {trustRelationships
                .filter((r) => r.confidence === null)
                .map((rel, i) => (
                  <div
                    key={`null-${i}`}
                    className="flex items-center justify-between px-4 py-2 rounded-md opacity-50"
                    style={{ background: "var(--biolum-cyan-ghost)" }}
                  >
                    <span className="font-mono text-sm text-[var(--ink-tertiary)]">
                      {rel.observer} {"\u2192"} {rel.subject}
                    </span>
                    <span className="font-mono text-xs text-[var(--ink-ghost)]">
                      not enough signal
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Garden (Drift) ── */}
        {driftCount > 0 && (
          <div className="space-y-3">
            <div className="section-divider">
              <span className="section-divider-line" />
              <span className="section-divider-label">
                <span className="section-divider-sym">{"\u2740"}</span>
                garden
              </span>
              <span className="section-divider-line" />
            </div>
            <p className="font-body text-sm text-[var(--ink-muted)]">
              {driftCount} {driftCount === 1 ? "area" : "areas"} {driftSeverity === "high" ? "need pruning" : "showing new growth"}.
            </p>
          </div>
        )}

        {/* ── Last Position ── */}
        {lastPosition && (
          <div className="space-y-3">
            <div className="section-divider">
              <span className="section-divider-line" />
              <span className="section-divider-label">
                <span className="section-divider-sym">{"\u25B8"}</span>
                last position
              </span>
              <span className="section-divider-line" />
            </div>
            <p
              className="font-mono text-sm text-[var(--ink-muted)] px-4 py-3 rounded-md"
              style={{ background: "var(--biolum-cyan-ghost)" }}
            >
              {lastPosition}
            </p>
          </div>
        )}

        {/* ── History Whisper ── */}
        {historyWhisper && (
          <div className="space-y-3">
            <div className="section-divider">
              <span className="section-divider-line" />
              <span className="section-divider-label">
                <span className="section-divider-sym">{"\u2042"}</span>
                history
              </span>
              <span className="section-divider-line" />
            </div>
            <p
              className="font-body text-sm italic text-[var(--ink-tertiary)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {historyWhisper}
            </p>
          </div>
        )}

        {/* ── Closing breath ── */}
        <div className="pt-8 pb-16 text-center">
          <span className="text-[var(--ink-ghost)] text-xs font-mono tracking-widest">
            {"\u2E3A"} mangrove {"\u2E3A"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Cluster Card ──

function ClusterCard({ cluster }: { cluster: ClusterSummary }) {
  const healthColor =
    cluster.health >= 80
      ? "var(--teal-500)"
      : cluster.health >= 60
        ? "var(--amber-400)"
        : "var(--rose-500)";

  return (
    <div className="glass-panel px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-xs tracking-wide text-[var(--ink-muted)]"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          {cluster.label}
        </span>
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: healthColor }}
        />
      </div>

      {/* Health bar */}
      <div className="confidence-track">
        <div
          className="confidence-fill"
          style={{
            width: `${cluster.health}%`,
            backgroundColor: healthColor,
          }}
        />
      </div>

      {/* Trust confidence (subtle) */}
      {cluster.trustConfidence !== null && (
        <span className="font-mono text-[10px] text-[var(--ink-ghost)]">
          trust {Math.round(cluster.trustConfidence * 100)}%
        </span>
      )}
    </div>
  );
}

// ── Trust Bar ──

function TrustBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 75
      ? "var(--teal-500)"
      : pct >= 50
        ? "var(--amber-400)"
        : "var(--rose-500)";

  return (
    <div className="flex items-center gap-2">
      <div className="confidence-track w-16">
        <div
          className="confidence-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

/**
 * RouteConfigLens — shared lens for the ori signal router.
 *
 * Renders the 4 bus routes as tweakable panels. critical-escalator is
 * flagged as the blocking route (threshold 1, any pattern). Provides:
 *   - Per-route threshold / window sliders (number inputs with validation)
 *   - Enable/disable toggle per route
 *   - Run GRID button — fires ori run_tests on grid-main
 *   - Auto-snapshot indicator (timestamps from overview-server)
 *   - Live runtime stats: hits in window, cooldown state, last fired
 *
 * This component is self-contained and can be mounted in any Nuke-compatible
 * layout. It reads from useRouteStore and has no direct dependency on the
 * knob pad — the "shared" in "shared lens" means it shares the MCP bridge.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouteStore } from "../stores/route-store.ts";
import type { RouteView, RouteTrigger } from "../stores/route-store.ts";
import { isBridged } from "../lib/mcp-bridge.ts";

// ── helpers ────────────────────────────────────────────────────────

function formatRelative(isoString: string | null): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── RouteCard ──────────────────────────────────────────────────────

interface RouteCardProps {
  route: RouteView;
  isBlocking: boolean;
}

function RouteCard({ route, isBlocking }: RouteCardProps) {
  const patchRoute = useRouteStore((s) => s.patchRoute);
  const toggleRoute = useRouteStore((s) => s.toggleRoute);

  const [threshold, setThreshold] = useState(String(route.trigger.threshold));
  const [windowMin, setWindowMin] = useState(String(route.trigger.windowMinutes));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local inputs when store updates (e.g. after fetch)
  useEffect(() => {
    setThreshold(String(route.trigger.threshold));
    setWindowMin(String(route.trigger.windowMinutes));
    setDirty(false);
  }, [route.trigger.threshold, route.trigger.windowMinutes]);

  const handleChange = useCallback(
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setDirty(true);
      setSaveError(null);
    },
    [],
  );

  const handlePatch = useCallback(async () => {
    const t = parseInt(threshold, 10);
    const w = parseInt(windowMin, 10);
    if (isNaN(t) || t < 1 || isNaN(w) || w < 1) {
      setSaveError("threshold ≥ 1, window ≥ 1");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<RouteTrigger> = {};
      if (t !== route.trigger.threshold) patch.threshold = t;
      if (w !== route.trigger.windowMinutes) patch.windowMinutes = w;
      if (Object.keys(patch).length > 0) await patchRoute(route.id, patch);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [threshold, windowMin, route, patchRoute]);

  const handleToggle = useCallback(async () => {
    try {
      await toggleRoute(route.id);
    } catch {
      // error visible via fetchStatus
    }
  }, [toggleRoute, route.id]);

  const borderColor = isBlocking
    ? "var(--led-error)"
    : route.runtime.inCooldown
      ? "var(--led-running)"
      : "var(--nuke-border)";

  const patternLabel = Array.isArray(route.trigger.patternIds)
    ? route.trigger.patternIds.length === 0
      ? "any"
      : route.trigger.patternIds.join(", ")
    : route.trigger.patternIds;

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2 fade-in"
      style={{
        background: "var(--nuke-surface-alt)",
        border: `1px solid ${borderColor}`,
        transition: "border-color var(--transition-base)",
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isBlocking && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded led-pulse"
              style={{ background: "var(--led-error)", color: "#0a0a0f" }}
            >
              blocking
            </span>
          )}
          <span className="font-semibold text-xs" style={{ color: "var(--nuke-text)" }}>
            {route.name}
          </span>
          <span className="text-[10px]" style={{ color: "var(--nuke-text-muted)" }}>
            {route.id}
          </span>
        </div>

        {/* enable toggle */}
        <button
          onClick={handleToggle}
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{
            background: route.enabled ? "var(--led-success)" : "var(--nuke-border)",
            color: route.enabled ? "#0a0a0f" : "var(--nuke-text-dim)",
          }}
        >
          {route.enabled ? "enabled" : "disabled"}
        </button>
      </div>

      {/* runtime stats */}
      <div className="flex gap-3 text-[10px]" style={{ color: "var(--nuke-text-dim)" }}>
        <span>
          hits:{" "}
          <span
            style={{
              color: route.runtime.hitsInWindow > 0 ? "var(--led-running)" : "var(--nuke-text-dim)",
            }}
          >
            {route.runtime.hitsInWindow}
          </span>
        </span>
        <span>
          cooldown:{" "}
          <span
            style={{
              color: route.runtime.inCooldown ? "var(--led-running)" : "var(--nuke-text-muted)",
            }}
          >
            {route.runtime.inCooldown ? "active" : "clear"}
          </span>
        </span>
        <span>
          last:{" "}
          <span style={{ color: "var(--nuke-text-muted)" }}>
            {formatRelative(route.runtime.lastFiredAt)}
          </span>
        </span>
        <span style={{ color: "var(--nuke-text-muted)" }}>patterns: {patternLabel}</span>
      </div>

      {/* controls */}
      <div className="flex items-center gap-3">
        <label
          className="flex items-center gap-1.5 text-[10px]"
          style={{ color: "var(--nuke-text-dim)" }}
        >
          threshold
          <input
            type="number"
            min={1}
            value={threshold}
            onChange={handleChange(setThreshold)}
            className="w-14 text-center rounded px-1.5 py-0.5 outline-none"
            style={{
              background: "var(--nuke-bg)",
              border: `1px solid ${dirty ? "var(--analysis-accent)" : "var(--nuke-border)"}`,
              color: "var(--nuke-text)",
              fontSize: "11px",
            }}
          />
        </label>

        <label
          className="flex items-center gap-1.5 text-[10px]"
          style={{ color: "var(--nuke-text-dim)" }}
        >
          window (min)
          <input
            type="number"
            min={1}
            value={windowMin}
            onChange={handleChange(setWindowMin)}
            className="w-14 text-center rounded px-1.5 py-0.5 outline-none"
            style={{
              background: "var(--nuke-bg)",
              border: `1px solid ${dirty ? "var(--analysis-accent)" : "var(--nuke-border)"}`,
              color: "var(--nuke-text)",
              fontSize: "11px",
            }}
          />
        </label>

        <span className="text-[10px]" style={{ color: "var(--nuke-text-muted)" }}>
          cooldown: {route.trigger.cooldownMinutes}m
        </span>

        {dirty && (
          <button
            onClick={handlePatch}
            disabled={saving}
            className="ml-auto text-[10px] px-2.5 py-0.5 rounded font-medium transition-colors"
            style={{
              background: saving ? "var(--nuke-border)" : "var(--analysis-accent)",
              color: saving ? "var(--nuke-text-muted)" : "#0a0a0f",
            }}
          >
            {saving ? "saving…" : "patch"}
          </button>
        )}
      </div>

      {saveError && (
        <span className="text-[10px]" style={{ color: "var(--led-error)" }}>
          {saveError}
        </span>
      )}
    </div>
  );
}

// ── RouteConfigLens ────────────────────────────────────────────────

export function RouteConfigLens() {
  const routes = useRouteStore((s) => s.routes);
  const fetchStatus = useRouteStore((s) => s.fetchStatus);
  const fetchError = useRouteStore((s) => s.fetchError);
  const fetchRoutes = useRouteStore((s) => s.fetchRoutes);

  const gridRunStatus = useRouteStore((s) => s.gridRunStatus);
  const gridRunSummary = useRouteStore((s) => s.gridRunSummary);
  const gridRunError = useRouteStore((s) => s.gridRunError);
  const runGrid = useRouteStore((s) => s.runGrid);

  const lastSnapshotAt = useRouteStore((s) => s.lastSnapshotAt);
  const snapshotError = useRouteStore((s) => s.snapshotError);

  // Auto-fetch on mount
  useEffect(() => {
    void fetchRoutes();
  }, [fetchRoutes]);

  const RUN_STATUS_COLOR: Record<string, string> = {
    idle: "var(--led-idle)",
    running: "var(--led-running)",
    success: "var(--led-success)",
    error: "var(--led-error)",
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--nuke-surface)", border: "1px solid var(--nuke-border-dim)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--analysis-accent)" }}
          >
            Bus Routing Lens
          </span>
          {!isBridged && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--nuke-border)", color: "var(--nuke-text-muted)" }}
            >
              sim mode — set VITE_MCP_BRIDGE_URL to go live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* snapshot indicator */}
          <span
            className="text-[10px]"
            style={{ color: snapshotError ? "var(--led-error)" : "var(--nuke-text-muted)" }}
          >
            snapshot: {snapshotError ? "err" : formatRelative(lastSnapshotAt)}
          </span>

          {/* refresh */}
          <button
            onClick={() => void fetchRoutes()}
            disabled={fetchStatus === "loading"}
            className="text-[10px] px-2 py-0.5 rounded transition-colors"
            style={{
              background: "var(--nuke-border)",
              color: fetchStatus === "loading" ? "var(--nuke-text-muted)" : "var(--nuke-text-dim)",
            }}
          >
            {fetchStatus === "loading" ? "loading…" : "↺ refresh"}
          </button>
        </div>
      </div>

      {/* fetch error */}
      {fetchError && (
        <div
          className="text-[11px] px-3 py-2 rounded"
          style={{ background: "rgba(239,83,80,0.1)", color: "var(--led-error)" }}
        >
          {fetchError}
        </div>
      )}

      {/* route cards */}
      {fetchStatus === "loading" && routes.length === 0 && (
        <div className="text-[11px] py-4 text-center" style={{ color: "var(--nuke-text-muted)" }}>
          fetching route config…
        </div>
      )}

      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          isBlocking={route.id === "critical-escalator" && route.trigger.threshold === 1}
        />
      ))}

      {/* run GRID footer */}
      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: "1px solid var(--nuke-border-dim)" }}
      >
        <div className="flex flex-col gap-0.5">
          {gridRunSummary && (
            <span
              className="text-[10px]"
              style={{
                color: gridRunStatus === "success" ? "var(--led-success)" : "var(--led-error)",
              }}
            >
              {gridRunSummary}
            </span>
          )}
          {gridRunError && (
            <span className="text-[10px]" style={{ color: "var(--led-error)" }}>
              {gridRunError}
            </span>
          )}
        </div>

        <button
          onClick={() => void runGrid()}
          disabled={gridRunStatus === "running"}
          className="flex items-center gap-2 px-4 py-1.5 rounded font-medium text-xs transition-all"
          style={{
            background: gridRunStatus === "running" ? "var(--nuke-border)" : "var(--zap-accent)",
            color: gridRunStatus === "running" ? "var(--nuke-text-muted)" : "#fff",
          }}
        >
          <span
            className={`w-2 h-2 rounded-full ${gridRunStatus === "running" ? "led-pulse" : ""}`}
            style={{ background: RUN_STATUS_COLOR[gridRunStatus] }}
          />
          {gridRunStatus === "running" ? "running grid…" : "Run GRID"}
        </button>
      </div>
    </div>
  );
}

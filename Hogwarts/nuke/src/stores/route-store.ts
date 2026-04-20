/**
 * Route Store — state for the ori signal router.
 *
 * Reads live route config + runtime status from ori-server,
 * exposes patch/toggle controls, drives the RunGrid action,
 * and auto-snapshots via overview-server on every mutation.
 */

import { create } from "zustand";
import { callMcp, mcpJson } from "../lib/mcp-bridge.ts";

// ── Types mirroring ori-server router_status response ─────────────

export interface RouteTrigger {
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  severities: string[];
  patternIds: string[] | "any";
}

export interface RouteRuntime {
  hitsInWindow: number;
  lastFiredAt: string | null;
  inCooldown: boolean;
}

export interface RouteView {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RouteTrigger;
  actionTypes: string[];
  runtime: RouteRuntime;
}

export type FetchStatus = "idle" | "loading" | "ready" | "error";
export type RunStatus = "idle" | "running" | "success" | "error";

interface RouterStatusResponse {
  routes: RouteView[];
}

interface RunTestsResponse {
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  healthStatus: string;
}

// ── Store ─────────────────────────────────────────────────────────

interface RouteStoreState {
  routes: RouteView[];
  fetchStatus: FetchStatus;
  fetchError: string | null;

  gridRunStatus: RunStatus;
  gridRunSummary: string | null;
  gridRunError: string | null;

  lastSnapshotAt: string | null;
  snapshotError: string | null;

  // actions
  fetchRoutes: () => Promise<void>;
  patchRoute: (routeId: string, trigger: Partial<RouteTrigger>) => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
  runGrid: () => Promise<void>;
  snapshot: () => Promise<void>;
}

export const useRouteStore = create<RouteStoreState>((set, get) => ({
  routes: [],
  fetchStatus: "idle",
  fetchError: null,

  gridRunStatus: "idle",
  gridRunSummary: null,
  gridRunError: null,

  lastSnapshotAt: null,
  snapshotError: null,

  // ── fetchRoutes ───────────────────────────────────────────────

  fetchRoutes: async () => {
    set({ fetchStatus: "loading", fetchError: null });
    try {
      const result = await callMcp("ori-server", "router_status", {});
      const data = mcpJson<RouterStatusResponse>(result);
      set({
        routes: data?.routes ?? [],
        fetchStatus: "ready",
      });
    } catch (err) {
      set({
        fetchStatus: "error",
        fetchError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  // ── patchRoute ────────────────────────────────────────────────

  patchRoute: async (routeId, trigger) => {
    // Optimistic update
    set((s) => ({
      routes: s.routes.map((r) =>
        r.id === routeId ? { ...r, trigger: { ...r.trigger, ...trigger } } : r,
      ),
    }));

    try {
      await callMcp("ori-server", "configure_routes", {
        action: "update",
        routeId,
        trigger,
      });
      // Refresh after patch to sync disk state
      await get().fetchRoutes();
      await get().snapshot();
    } catch (err) {
      // Revert optimistic update by re-fetching
      await get().fetchRoutes();
      throw err;
    }
  },

  // ── toggleRoute ───────────────────────────────────────────────

  toggleRoute: async (routeId) => {
    const route = get().routes.find((r) => r.id === routeId);
    if (!route) return;

    const action = route.enabled ? "disable" : "enable";

    // Optimistic
    set((s) => ({
      routes: s.routes.map((r) => (r.id === routeId ? { ...r, enabled: !r.enabled } : r)),
    }));

    try {
      await callMcp("ori-server", "configure_routes", { action, routeId });
      await get().snapshot();
    } catch (err) {
      await get().fetchRoutes();
      throw err;
    }
  },

  // ── runGrid ───────────────────────────────────────────────────

  runGrid: async () => {
    if (get().gridRunStatus === "running") return;

    set({ gridRunStatus: "running", gridRunSummary: null, gridRunError: null });

    try {
      const result = await callMcp("ori-server", "run_tests", {
        projectId: "grid-main",
        timeoutSeconds: 300,
      });
      const data = mcpJson<RunTestsResponse>(result);

      const summary = data
        ? `${data.passed} passed · ${data.failed} failed · ${Math.round(
            data.durationMs / 1000,
          )}s · ${data.healthStatus}`
        : "Run complete";

      set({ gridRunStatus: data?.failed === 0 ? "success" : "error", gridRunSummary: summary });

      // Refresh routes (run may have triggered route firings)
      await get().fetchRoutes();
      await get().snapshot();
    } catch (err) {
      set({
        gridRunStatus: "error",
        gridRunError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  // ── snapshot ──────────────────────────────────────────────────

  snapshot: async () => {
    try {
      await callMcp("overview-server", "checkpoint", { depth: "summary" });
      set({ lastSnapshotAt: new Date().toISOString(), snapshotError: null });
    } catch (err) {
      set({ snapshotError: err instanceof Error ? err.message : String(err) });
    }
  },
}));

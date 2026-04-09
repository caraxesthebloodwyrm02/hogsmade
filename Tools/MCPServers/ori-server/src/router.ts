/**
 * Signal Router — core evaluate + accumulate + fire engine.
 *
 * Lifecycle:
 *   1. initRouter()          — load config, build runtime state map
 *   2. evaluateSignals()     — called after every collect_logs / run_tests ingest
 *   3. For each enabled route, check trigger against incoming entries
 *   4. Accumulate hits within the sliding window
 *   5. If threshold crossed and not in cooldown → fire actions
 *   6. Return array of RouteFiring summaries
 *
 * Actions are executed inline (synchronous-ish with awaits), no background threads.
 * Failures in individual actions are logged but do not block the remaining actions.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { appendNote } from "./notebook.js";
import { runProbe, saveProbe } from "./probe.js";
import { generateRecommendations, saveRecommendations } from "./recommend.js";
import { loadRouterConfig } from "./router-config.js";
import { readAllLogs } from "./storage.js";
import type { LogEntry, RouteAction, RouteFiring, RouteState, SignalRoute } from "./types.js";

// ── Runtime state (in-memory, not persisted) ──

const routeStates = new Map<string, RouteState>();

/** Get or create runtime state for a route. */
function getState(routeId: string): RouteState {
  let state = routeStates.get(routeId);
  if (!state) {
    state = { hits: [] };
    routeStates.set(routeId, state);
  }
  return state;
}

/** Prune hits outside the sliding window. */
function pruneWindow(state: RouteState, windowMinutes: number): void {
  const cutoff = Date.now() - windowMinutes * 60_000;
  state.hits = state.hits.filter((ts) => new Date(ts).getTime() >= cutoff);
}

/** Check if route is in cooldown. */
function isInCooldown(state: RouteState, cooldownMinutes: number): boolean {
  if (!state.lastFiredAt) return false;
  const elapsed = Date.now() - new Date(state.lastFiredAt).getTime();
  return elapsed < cooldownMinutes * 60_000;
}

// ── Template expansion ──

interface TemplateContext {
  count: number;
  patterns: string[];
  sources: string[];
  window: number;
  topLine: string;
}

function expandTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{\{count\}\}/g, String(ctx.count))
    .replace(/\{\{patterns\}\}/g, ctx.patterns.join(", ") || "none")
    .replace(/\{\{source\}\}/g, ctx.sources.join(", ") || "unknown")
    .replace(/\{\{window\}\}/g, String(ctx.window))
    .replace(/\{\{topLine\}\}/g, ctx.topLine || "(no sample line)");
}

// ── Route matching ──

/**
 * Check if a log entry matches a route's trigger filters.
 * - patternIds: entry must have at least one matching pattern (empty = any)
 * - severities: entry severity must be in the list (empty/undefined = any)
 * - sources: entry source must match (empty/undefined = any)
 */
function entryMatchesTrigger(entry: LogEntry, route: SignalRoute): boolean {
  const { trigger } = route;

  // Severity filter
  if (trigger.severities && trigger.severities.length > 0) {
    if (!trigger.severities.includes(entry.severity)) return false;
  }

  // Pattern filter
  if (trigger.patternIds.length > 0) {
    const triggerSet = new Set(trigger.patternIds);
    if (!entry.matchedPatterns.some((p) => triggerSet.has(p))) return false;
  }

  // Source filter
  if (trigger.sources && trigger.sources.length > 0) {
    if (!trigger.sources.includes(entry.source)) return false;
  }

  // Must have at least one matched pattern to be a "signal"
  if (entry.matchedPatterns.length === 0) return false;

  return true;
}

/**
 * Special matching for cross-source correlation: instead of counting
 * total hits, we count distinct sources in the window.
 */
function isCrossSourceRoute(route: SignalRoute): boolean {
  return route.id === "cross-source-correlation";
}

// ── Action execution ──

async function executeAction(
  action: RouteAction,
  ctx: TemplateContext,
  route: SignalRoute,
): Promise<string> {
  switch (action.type) {
    case "probe": {
      const entries = await readAllLogs();
      const source = action.source ?? ctx.sources[0] ?? "signal-router";
      // Filter to recent entries matching the route's patterns
      const relevant =
        entries.length > 200
          ? entries.slice(-200) // cap for performance
          : entries;
      const result = runProbe(relevant, source);
      await saveProbe(result);
      return `probe:${result.id}`;
    }

    case "note": {
      const title = expandTemplate(action.titleTemplate, ctx);
      const body = expandTemplate(action.bodyTemplate, ctx);
      const note = await appendNote({
        category: action.category,
        title,
        body,
        tags: [...action.tags, `route:${route.id}`],
        source: "signal-router",
      });
      return `note:${note.id}`;
    }

    case "recommend": {
      const entries = await readAllLogs();
      const recent = entries.slice(-200);
      const source = ctx.sources[0] ?? "signal-router";
      const probe = runProbe(recent, source);
      const recs = generateRecommendations(probe, recent);
      if (action.save && recs.length > 0) {
        await saveRecommendations(recs);
      }
      return `recommend:${recs.length}`;
    }

    case "audit": {
      await emitAudit({
        source: "ori-server",
        tool: action.tool,
        status: "success",
        metadata: {
          routeId: route.id,
          routeName: route.name,
          matchedCount: ctx.count,
          patterns: ctx.patterns,
          sources: ctx.sources,
          ...(action.metadata ?? {}),
        },
      });
      return `audit:${action.tool}`;
    }

    default:
      return `unknown:${(action as { type: string }).type}`;
  }
}

// ── Main evaluation entry point ──

/**
 * Evaluate newly ingested log entries against all enabled routes.
 *
 * Called by server.ts after every collect_logs or run_tests ingest.
 * Returns an array of RouteFiring summaries for any routes that triggered.
 */
export async function evaluateSignals(newEntries: LogEntry[]): Promise<RouteFiring[]> {
  if (newEntries.length === 0) return [];

  const config = await loadRouterConfig();
  const firings: RouteFiring[] = [];

  for (const route of config.routes) {
    if (!route.enabled) continue;

    const state = getState(route.id);
    const now = new Date().toISOString();

    // Collect matching entries for this route
    const matched = newEntries.filter((e) => entryMatchesTrigger(e, route));
    if (matched.length === 0) continue;

    // Record hits
    for (const entry of matched) {
      state.hits.push(entry.timestamp);
    }

    // Prune to window
    pruneWindow(state, route.trigger.windowMinutes);

    // Determine if threshold is met
    let thresholdMet = false;

    if (isCrossSourceRoute(route)) {
      // Cross-source: count distinct sources in window
      // We need to check the actual entries, not just timestamps
      // Collect all matching sources from recent entries
      const allLogs = await readAllLogs();
      const windowCutoff = Date.now() - route.trigger.windowMinutes * 60_000;
      const windowEntries = allLogs.filter(
        (e) => new Date(e.timestamp).getTime() >= windowCutoff && entryMatchesTrigger(e, route),
      );
      const distinctSources = new Set(windowEntries.map((e) => e.source));
      thresholdMet = distinctSources.size >= route.trigger.threshold;
    } else {
      thresholdMet = state.hits.length >= route.trigger.threshold;
    }

    if (!thresholdMet) continue;

    // Check cooldown
    if (isInCooldown(state, route.trigger.cooldownMinutes)) continue;

    // Build template context
    const allPatterns = new Set<string>();
    const allSources = new Set<string>();
    for (const entry of matched) {
      for (const p of entry.matchedPatterns) allPatterns.add(p);
      allSources.add(entry.source);
    }

    const ctx: TemplateContext = {
      count: state.hits.length,
      patterns: [...allPatterns],
      sources: [...allSources],
      window: route.trigger.windowMinutes,
      topLine: matched[0]?.line?.slice(0, 200) ?? "",
    };

    // Fire actions
    const executedActions: string[] = [];
    for (const action of route.actions) {
      try {
        const result = await executeAction(action, ctx, route);
        executedActions.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[signal-router] action ${action.type} failed for route ${route.id}: ${msg}\n`,
        );
        executedActions.push(`${action.type}:ERROR`);
      }
    }

    // Record firing
    state.lastFiredAt = now;
    state.hits = []; // Reset accumulator after fire

    firings.push({
      routeId: route.id,
      routeName: route.name,
      firedAt: now,
      matchedCount: ctx.count,
      matchedPatterns: ctx.patterns,
      matchedSources: ctx.sources,
      actionsExecuted: executedActions,
      topLine: ctx.topLine || undefined,
    });
  }

  return firings;
}

/**
 * Get current runtime state for all routes (diagnostic).
 */
export function getRouterState(): Record<string, RouteState> {
  const result: Record<string, RouteState> = {};
  for (const [id, state] of routeStates) {
    result[id] = { ...state, hits: [...state.hits] };
  }
  return result;
}

/**
 * Reset runtime state for all routes (e.g., after config reload).
 */
export function resetRouterState(): void {
  routeStates.clear();
}

/**
 * Reset runtime state for a single route.
 */
export function resetRouteState(routeId: string): void {
  routeStates.delete(routeId);
}

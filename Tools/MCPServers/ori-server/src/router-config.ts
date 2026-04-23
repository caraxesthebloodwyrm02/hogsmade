/**
 * Router configuration — default routes and persistence layer.
 *
 * Persists to ~/.ori/router/routes.json. If no file exists on startup,
 * the 4 built-in routes are used and written to disk.
 *
 * Routes:
 *   1. warning-accumulator:     3+ warnings in 30 min → probe → note → recommend
 *   2. critical-escalator:      1 critical signal → note → probe → recommend → audit
 *   3. pattern-surge-detector:  5+ of same pattern in 60 min → note (trend)
 *   4. cross-source-correlation: 3+ sources in 60 min → note → probe
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import type { RouterConfig, SignalRoute } from "./types.js";

const SCHEMA_VERSION = "1.0.0";

// ── Default routes ──

export const DEFAULT_ROUTES: SignalRoute[] = [
  {
    id: "warning-accumulator",
    name: "Warning Accumulator",
    enabled: true,
    trigger: {
      patternIds: [],
      severities: ["warning"],
      threshold: 3,
      windowMinutes: 30,
      cooldownMinutes: 15,
    },
    actions: [
      { type: "probe" },
      {
        type: "note",
        category: "anomaly",
        titleTemplate: "Warning accumulation: {{count}} signals in {{window}}min",
        bodyTemplate:
          "Detected {{count}} warning-level signals within a {{window}}-minute window.\n\n" +
          "Patterns: {{patterns}}\n" +
          "Sources: {{source}}\n" +
          "Sample: {{topLine}}",
        tags: ["auto-router", "warning-accumulator"],
      },
      { type: "recommend", save: true },
    ],
  },
  {
    id: "critical-escalator",
    name: "Critical Escalator",
    enabled: true,
    trigger: {
      patternIds: [],
      severities: ["critical"],
      threshold: 1,
      windowMinutes: 60,
      cooldownMinutes: 5,
    },
    actions: [
      {
        type: "note",
        category: "anomaly",
        titleTemplate: "Critical signal detected: {{patterns}}",
        bodyTemplate:
          "Immediate critical-severity signal detected.\n\n" +
          "Count: {{count}}\n" +
          "Patterns: {{patterns}}\n" +
          "Source: {{source}}\n" +
          "Line: {{topLine}}",
        tags: ["auto-router", "critical-escalator"],
      },
      { type: "probe" },
      { type: "recommend", save: true },
      {
        type: "audit",
        tool: "signal_router",
        metadata: { trigger: "critical-escalator" },
      },
    ],
  },
  {
    id: "pattern-surge-detector",
    name: "Pattern Surge Detector",
    enabled: true,
    trigger: {
      patternIds: [],
      severities: ["critical", "warning", "info"],
      threshold: 5,
      windowMinutes: 60,
      cooldownMinutes: 30,
    },
    actions: [
      {
        type: "note",
        category: "trend",
        titleTemplate: "Pattern surge: {{patterns}} ({{count}}x in {{window}}min)",
        bodyTemplate:
          "A surge of {{count}} signals matching the same pattern(s) was detected " +
          "within a {{window}}-minute window.\n\n" +
          "Patterns: {{patterns}}\n" +
          "Sources: {{source}}\n" +
          "This may indicate a systemic issue or regression.",
        tags: ["auto-router", "pattern-surge"],
      },
    ],
  },
  {
    id: "cross-source-correlation",
    name: "Cross-Source Correlation",
    enabled: true,
    trigger: {
      patternIds: [],
      severities: ["critical", "warning"],
      sources: [],
      threshold: 3,
      windowMinutes: 60,
      cooldownMinutes: 60,
    },
    actions: [
      {
        type: "note",
        category: "cross-run-context",
        titleTemplate: "Cross-source correlation: {{source}}",
        bodyTemplate:
          "Signals from {{count}} different sources correlated within {{window}} minutes.\n\n" +
          "Sources: {{source}}\n" +
          "Patterns: {{patterns}}\n" +
          "This suggests a shared root cause across test suites or projects.",
        tags: ["auto-router", "cross-source"],
      },
      { type: "probe" },
    ],
  },
  {
    id: "seeds-snapshot-drift",
    name: "Seeds Snapshot Drift",
    enabled: true,
    trigger: {
      patternIds: [],
      severities: ["critical", "warning", "info"],
      sources: ["seeds-server"],
      threshold: 1,
      windowMinutes: 1440, // 24-hour window — one signal per day triggers
      cooldownMinutes: 60,
    },
    actions: [
      { type: "recommend", save: true },
      {
        type: "note",
        category: "trend",
        titleTemplate: "Seeds snapshot drift detected ({{count}} signals in {{window}}min)",
        bodyTemplate:
          "Seeds-server emitted {{count}} signal(s) within a {{window}}-minute window, " +
          "indicating score drift across ecosystem snapshots.\n\n" +
          "Sources: {{source}}\n" +
          "Top signal: {{topLine}}\n\n" +
          "Review recent seeds snapshots at ~/.seeds-server/snapshots/ for score deltas.",
        tags: ["auto-router", "seeds-drift", "ecosystem-health"],
      },
    ],
  },
];

// ── Persistence ──

function routerDir(): string {
  return path.join(getConfig().dataDir, "router");
}

function routerConfigPath(): string {
  return path.join(routerDir(), "routes.json");
}

/**
 * Load the router config from disk, falling back to defaults.
 * Creates the file on first load.
 */
export async function loadRouterConfig(): Promise<RouterConfig> {
  await fs.mkdir(routerDir(), { recursive: true });

  try {
    const raw = await fs.readFile(routerConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as RouterConfig;

    // Schema migration guard: if version doesn't match, merge defaults
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      const merged = mergeWithDefaults(parsed.routes);
      const config = buildConfig(merged);
      await saveRouterConfig(config);
      return config;
    }

    return parsed;
  } catch {
    // File doesn't exist or is corrupt — write defaults
    const config = buildConfig(DEFAULT_ROUTES);
    await saveRouterConfig(config);
    return config;
  }
}

/**
 * Save the router config to disk.
 */
export async function saveRouterConfig(config: RouterConfig): Promise<void> {
  await fs.mkdir(routerDir(), { recursive: true });
  const json = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(routerConfigPath(), json, "utf-8");
}

/**
 * Build a RouterConfig from a route array.
 */
export function buildConfig(routes: SignalRoute[]): RouterConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    routes,
  };
}

/**
 * Merge user routes with defaults — user routes override by ID,
 * missing defaults are added back.
 */
function mergeWithDefaults(userRoutes: SignalRoute[]): SignalRoute[] {
  const userMap = new Map(userRoutes.map((r) => [r.id, r]));
  const merged: SignalRoute[] = [];

  for (const dflt of DEFAULT_ROUTES) {
    merged.push(userMap.get(dflt.id) ?? dflt);
    userMap.delete(dflt.id);
  }

  // Append any custom user routes not in defaults
  for (const custom of userMap.values()) {
    merged.push(custom);
  }

  return merged;
}

/**
 * Update a single route by ID. Returns the updated config or null if not found.
 */
export async function updateRoute(
  routeId: string,
  patch: Partial<Omit<SignalRoute, "id">>,
): Promise<RouterConfig | null> {
  const config = await loadRouterConfig();
  const route = config.routes.find((r) => r.id === routeId);
  if (!route) return null;

  if (patch.name !== undefined) route.name = patch.name;
  if (patch.enabled !== undefined) route.enabled = patch.enabled;
  if (patch.trigger !== undefined) route.trigger = { ...route.trigger, ...patch.trigger };
  if (patch.actions !== undefined) route.actions = patch.actions;

  config.updatedAt = new Date().toISOString();
  await saveRouterConfig(config);
  return config;
}

/**
 * Add a custom route. Rejects if ID already exists.
 */
export async function addRoute(route: SignalRoute): Promise<RouterConfig> {
  const config = await loadRouterConfig();
  if (config.routes.some((r) => r.id === route.id)) {
    throw new Error(`Route with id '${route.id}' already exists`);
  }
  config.routes.push(route);
  config.updatedAt = new Date().toISOString();
  await saveRouterConfig(config);
  return config;
}

/**
 * Remove a route by ID. Built-in routes can be disabled but not removed.
 */
export async function removeRoute(routeId: string): Promise<RouterConfig> {
  const builtinIds = new Set(DEFAULT_ROUTES.map((r) => r.id));
  if (builtinIds.has(routeId)) {
    throw new Error(
      `Cannot remove built-in route '${routeId}'. Use updateRoute to disable it instead.`,
    );
  }
  const config = await loadRouterConfig();
  config.routes = config.routes.filter((r) => r.id !== routeId);
  config.updatedAt = new Date().toISOString();
  await saveRouterConfig(config);
  return config;
}

/**
 * Reset all routes to factory defaults.
 */
export async function resetRoutes(): Promise<RouterConfig> {
  const config = buildConfig([...DEFAULT_ROUTES]);
  await saveRouterConfig(config);
  return config;
}

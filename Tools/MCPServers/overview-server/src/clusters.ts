/**
 * Static cluster definitions for the Mangrove workspace.
 * Clusters are the developer's own mental model codified.
 * Adding a new project means adding it here.
 */

import path from "path";
import { getConfig } from "./config.js";
import type {
  AggregatedData,
  AuditEventParsed,
  ClusterDef,
  ClusterInsight,
  EntityStatus,
  SeedsRepoData,
} from "./types.js";

const cfg = getConfig();
const CASCADE = cfg.workspaceRoot;
const HOME = path.resolve(CASCADE, "..");

// ── Static Cluster Definitions ──

export const CLUSTER_DEFINITIONS: ClusterDef[] = [
  {
    id: "grid-family",
    label: "GRID Family",
    description: "Core AI framework and its dependent servers",
    entities: [
      { name: "GRID", type: "repo", path: `${CASCADE}/Projects/GRID-main` },
      { name: "grid-server", type: "mcp-server", auditSource: "grid-server" },
      { name: "grid-rag", type: "mcp-server", auditSource: null },
      { name: "grid-rag-enhanced", type: "mcp-server", auditSource: null },
      { name: "grid-enhanced-tools", type: "mcp-server", auditSource: null },
      { name: "portfolio-safety-lens", type: "mcp-server", auditSource: null },
    ],
    dependencyEdges: [
      { from: "GRID", to: "grid-server", type: "depends-on" },
      { from: "GRID", to: "grid-rag", type: "depends-on" },
      { from: "GRID", to: "grid-rag-enhanced", type: "depends-on" },
      { from: "GRID", to: "grid-enhanced-tools", type: "depends-on" },
      { from: "GRID", to: "portfolio-safety-lens", type: "depends-on" },
    ],
  },
  {
    id: "mcp-infrastructure",
    label: "MCP Infrastructure",
    description: "Shared libraries and observability servers",
    entities: [
      { name: "hogsmade", type: "repo", path: CASCADE },
      { name: "shared-types", type: "repo", path: `${CASCADE}/Components/shared-types` },
      {
        name: "shared-resilience",
        type: "repo",
        path: `${CASCADE}/Components/shared-resilience`,
      },
      { name: "echoes-server", type: "mcp-server", auditSource: "echoes-server" },
      { name: "seeds-server", type: "mcp-server", auditSource: "seeds-server" },
      { name: "pulse-server", type: "mcp-server", auditSource: "pulse-server" },
      { name: "maintain-server", type: "mcp-server", auditSource: "maintain-server" },
      { name: "lots-server", type: "mcp-server", auditSource: "lots-server" },
    ],
    dependencyEdges: [
      { from: "shared-types", to: "echoes-server", type: "build-dep" },
      { from: "shared-types", to: "seeds-server", type: "build-dep" },
      { from: "shared-types", to: "pulse-server", type: "build-dep" },
      { from: "shared-types", to: "maintain-server", type: "build-dep" },
      { from: "shared-types", to: "lots-server", type: "build-dep" },
      { from: "shared-resilience", to: "grid-server", type: "build-dep" },
    ],
  },
  {
    id: "canopy-apps",
    label: "Canopy Applications",
    description: "Standalone applications",
    entities: [
      { name: "afloat", type: "repo", path: `${CASCADE}/Tools/MCPServers/afloat-server` },
      { name: "echoes", type: "repo", path: `${CASCADE}/Tools/MCPServers/echoes-server` },
      { name: "afloat-server", type: "mcp-server", auditSource: "afloat-server" },
    ],
    dependencyEdges: [
      { from: "shared-types", to: "afloat-server", type: "build-dep" },
    ],
  },
  {
    id: "glimpse-family",
    label: "Glimpse Family",
    description: "Cognitive rendering engine and artifacts",
    entities: [
      { name: "glimpse-engine", type: "repo", path: `${CASCADE}/Applications/glimpse-engine` },
      {
        name: "glimpse-artifact",
        type: "repo",
        path: `${CASCADE}/Applications/glimpse-artifact`,
      },
      { name: "glimpse-server", type: "mcp-server", auditSource: null },
    ],
    dependencyEdges: [
      { from: "glimpse-engine", to: "glimpse-artifact", type: "depends-on" },
      { from: "glimpse-engine", to: "glimpse-server", type: "depends-on" },
    ],
  },
  {
    id: "deployment-pipeline",
    label: "Deployment Pipeline",
    description: "GATE verification, CI/CD, governance",
    entities: [
      { name: "GATE", type: "data-store", path: `${CASCADE}/Projects/GATE` },
      { name: "apiguard", type: "repo", path: path.join(HOME, "roots", "apiguard") }, // legacy external root
    ],
    dependencyEdges: [],
  },
  {
    id: "seed-archive",
    label: "Seed & Archive",
    description: "Templates, archive, and secondary repos",
    entities: [
      { name: "seed", type: "repo", path: path.join(HOME, "seed") }, // legacy external root
      { name: "Vision", type: "repo", path: path.join(HOME, "grove", "Vision") }, // legacy external root
    ],
    dependencyEdges: [],
  },
];

// ── Cluster Health Computation ──

/**
 * Enrich cluster definitions with live data from aggregated sources.
 * When focus is provided, only that cluster gets full entity detail.
 */
export function computeClusterInsights(
  data: AggregatedData,
  focus: string | null,
): ClusterInsight[] {
  return CLUSTER_DEFINITIONS.map((cluster) => {
    const isFocused = !focus || focus === cluster.id;
    return buildClusterInsight(cluster, data, isFocused);
  });
}

function buildClusterInsight(
  cluster: ClusterDef,
  data: AggregatedData,
  detailed: boolean,
): ClusterInsight {
  const entities = cluster.entities.map((entityDef) => {
    if (!detailed) {
      // Summary: just name, type, and health score
      const repoData = findRepoData(entityDef.name, data);
      return {
        name: entityDef.name,
        type: entityDef.type,
        healthScore: repoData?.healthScore ?? null,
        branch: null,
        uncommittedChanges: null,
        lastActivity: null,
        issues: [],
        auditSummary: { eventsInWindow: 0, failures: 0, lastStatus: null },
      } satisfies EntityStatus;
    }

    return enrichEntity(entityDef.name, entityDef.type, entityDef.auditSource ?? null, data);
  });

  const scoredEntities = entities.filter((e) => e.healthScore !== null);
  const clusterHealth =
    scoredEntities.length > 0
      ? Math.round(
        scoredEntities.reduce((sum, e) => sum + (e.healthScore ?? 0), 0) /
        scoredEntities.length,
      )
      : 0;

  const issueCount = entities.reduce((sum, e) => sum + e.issues.length, 0);
  const driftItems = entities
    .filter((e) => e.uncommittedChanges && e.uncommittedChanges > 0)
    .map((e) => `${e.name}: ${e.uncommittedChanges} uncommitted changes`);

  return {
    id: cluster.id,
    label: cluster.label,
    entities,
    clusterHealth,
    issueCount,
    driftItems,
  };
}

function findRepoData(
  entityName: string,
  data: AggregatedData,
): SeedsRepoData | null {
  if (!data.latestSnapshot) return null;
  return (
    data.latestSnapshot.repos.find(
      (r) => r.name.toLowerCase() === entityName.toLowerCase(),
    ) ?? null
  );
}

function enrichEntity(
  name: string,
  type: string,
  auditSource: string | null,
  data: AggregatedData,
): EntityStatus {
  const repoData = findRepoData(name, data);
  const auditSummary = computeAuditSummary(auditSource ?? name, data.auditEvents);

  return {
    name,
    type: type as EntityStatus["type"],
    healthScore: repoData?.healthScore ?? null,
    branch: repoData?.branch ?? null,
    uncommittedChanges: repoData?.uncommittedChanges ?? null,
    lastActivity: auditSummary.lastTimestamp,
    issues: repoData?.issues ?? [],
    auditSummary: {
      eventsInWindow: auditSummary.eventsInWindow,
      failures: auditSummary.failures,
      lastStatus: auditSummary.lastStatus,
    },
  };
}

function computeAuditSummary(
  sourceName: string,
  events: AuditEventParsed[],
): {
  eventsInWindow: number;
  failures: number;
  lastStatus: string | null;
  lastTimestamp: string | null;
} {
  const sourceNameLower = sourceName.toLowerCase();
  const matching = events.filter(
    (e) => e.source.toLowerCase() === sourceNameLower,
  );

  if (matching.length === 0) {
    return { eventsInWindow: 0, failures: 0, lastStatus: null, lastTimestamp: null };
  }

  const failures = matching.filter(
    (e) => e.status === "failure" || e.status === "error" || e.status === "blocked",
  ).length;

  return {
    eventsInWindow: matching.length,
    failures,
    lastStatus: matching[0].status, // events are reverse-chronological
    lastTimestamp: matching[0].timestamp,
  };
}

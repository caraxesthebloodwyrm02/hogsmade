// ── Overview-Server Type Definitions ──

export type Depth = "summary" | "standard" | "deep";
export type Direction = "improving" | "stable" | "degrading" | "unknown";
export type DriftSeverity = "none" | "low" | "moderate" | "high";
export type DriftItemSeverity = "info" | "warning" | "critical";
export type Confidence = "high" | "moderate" | "low" | "insufficient-data";
export type Sentiment = "positive" | "neutral" | "negative";
export type EntityType = "repo" | "mcp-server" | "data-store" | "workflow";
export type DriftType =
  | "uncommitted-changes"
  | "stale-branch"
  | "test-failure"
  | "audit-anomaly"
  | "snapshot-score-drop"
  | "stale-data";
export type DependencyEdgeType = "depends-on" | "build-dep";

// ── Checkpoint (top-level return shape) ──

export interface Checkpoint {
  meta: CheckpointMeta;
  trajectory: Trajectory;
  clusters: ClusterInsight[];
  drift: DriftReport;
  trust: TrustSignal;
  rawSources?: RawSources; // only when depth === "deep"
}

export interface CheckpointMeta {
  generatedAt: string;
  sinceBoundary: string;
  focus: string | null;
  depth: Depth;
  dataSources: DataSourceStatus[];
}

export interface DataSourceStatus {
  name: string;
  available: boolean;
  lastModified: string | null;
  recordCount: number | null;
  stale: boolean; // true if data older than 48h
}

// ── Trajectory ──

export interface Trajectory {
  direction: Direction;
  ecosystemScore: number | null;
  previousScore: number | null;
  scoreDelta: number | null;
  evidence: string[];
}

// ── Clusters ──

export interface ClusterInsight {
  id: string;
  label: string;
  entities: EntityStatus[];
  clusterHealth: number; // 0-100
  issueCount: number;
  driftItems: string[];
}

export interface EntityStatus {
  name: string;
  type: EntityType;
  healthScore: number | null;
  branch: string | null;
  uncommittedChanges: number | null;
  lastActivity: string | null;
  issues: string[];
  auditSummary: {
    eventsInWindow: number;
    failures: number;
    lastStatus: string | null;
  };
}

// ── Drift ──

export interface DriftReport {
  totalDriftItems: number;
  severity: DriftSeverity;
  items: DriftItem[];
}

export interface DriftItem {
  entity: string;
  type: DriftType;
  detail: string;
  severity: DriftItemSeverity;
  firstDetected: string | null;
}

// ── Trust ──

export interface TrustSignal {
  confidence: Confidence;
  score: number; // 0-100
  basis: TrustBasisItem[];
}

export interface TrustBasisItem {
  signal: string;
  weight: number;
  sentiment: Sentiment;
}

// ── Raw sources (deep mode) ──

export interface RawSources {
  auditEventCount: number;
  snapshotTimestamp: string | null;
  journalEntryCount: number;
  focusSessionActive: boolean;
  workflowsRunToday: number;
}

// ── Cluster Definitions ──

export interface ClusterEntityDef {
  name: string;
  type: EntityType;
  path?: string;
  auditSource?: string | null;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeType;
}

export interface ClusterDef {
  id: string;
  label: string;
  description: string;
  entities: ClusterEntityDef[];
  dependencyEdges: DependencyEdge[];
}

// ── Aggregated data (internal, passed between modules) ──

export interface AggregatedData {
  auditEvents: AuditEventParsed[];
  latestSnapshot: SeedsSnapshotData | null;
  previousSnapshot: SeedsSnapshotData | null;
  journalEntryCount: number;
  focusSessionActive: boolean;
  workflowsRunToday: number;
  dataSources: DataSourceStatus[];
  sinceBoundary: string;
}

export interface AuditEventParsed {
  timestamp: string;
  source: string;
  tool: string;
  status: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SeedsSnapshotData {
  timestamp: string;
  repos: SeedsRepoData[];
  overallScore: number | null;
}

export interface SeedsRepoData {
  name: string;
  exists: boolean;
  hasGit: boolean;
  hasDependencyFile: boolean;
  hasTests: boolean;
  healthScore: number;
  branch?: string;
  uncommittedChanges?: number;
  lastCommit?: string;
  issues: string[];
}

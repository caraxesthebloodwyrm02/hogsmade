export interface HealthScore {
  repoName: string;
  score: number;
  label: string;
  trend: 'up' | 'down' | 'stable';
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  tool: string;
  source: string;
  status: 'success' | 'failure' | 'blocked' | 'dry_run' | 'error';
  durationMs?: number;
  summary?: string;
}

export interface Experiment {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'queued';
  metric: string;
  baselineValue: number;
  currentValue: number;
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  startedAt: string;
  completedAt?: string;
  elapsedMs?: number;
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  durationMs?: number;
}

export interface ScenarioSeed {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  seedId: string;
  label: string;
  parentBranchId?: string;
}

export interface GlimpseSnapshot {
  id: string;
  branchId: string;
  title: string;
  content: string;
  annotations: Annotation[];
  createdAt: string;
}

export interface Annotation {
  id: string;
  text: string;
  x: number;
  y: number;
  color?: string;
}

// ── MCP Topology ──────────────────────────────────────────────────────

export interface McpServerNode {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  toolCount: number;
  port?: number;
}

export interface McpEdge {
  source: string;
  target: string;
  type: 'dependency' | 'dataflow';
  label?: string;
}

// ── Cognition Patterns ────────────────────────────────────────────────

export interface CognitionPattern {
  name: string;
  activation: number;
  recentQueries: number;
}

// ── CI/CD Pipeline ────────────────────────────────────────────────────

export interface PipelinePR {
  id: string;
  title: string;
  author: string;
  source: 'dependabot' | 'human';
  status: 'pending' | 'scanning' | 'building' | 'merged' | 'fix-queue';
  labels: string[];
  runnerType?: 'self-hosted' | 'github';
  createdAt: string;
  updatedAt: string;
}

// ── GATE Envelope Stages ──────────────────────────────────────────────

export interface EnvelopeStage {
  name: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  details?: string;
  durationMs?: number;
}

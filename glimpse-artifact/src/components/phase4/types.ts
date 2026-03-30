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

// ── Realtime Pattern Detection ───────────────────────────────────────

export interface HybridPatternResult {
  statisticalPatterns: string[];
  syntacticPatterns: string[];
  neuralPatterns: string[];
  combinedPatterns: string[];
  overallConfidence: number;
  confidenceScores: {
    statistical: number;
    syntactic: number;
    neural: number;
  };
}

export interface PatternChangeEvent {
  added: string[];
  removed: string[];
  stable: string[];
  allPatterns: string[];
}

export interface RealtimePatternState {
  tick: number;
  windowSize: number;
  totalIngested: number;
  patterns: HybridPatternResult | null;
  lastChange: PatternChangeEvent | null;
  anomalies: RealtimeAnomaly[];
}

export interface RealtimeAnomaly {
  type: 'LOW_CONFIDENCE' | 'HIGH_GAP_COUNT';
  score?: number;
  gapCount?: number;
  timestamp: string;
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
  repo?: string;
  url?: string;
}

// ── GATE Envelope Stages ──────────────────────────────────────────────

export interface EnvelopeStage {
  name: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  details?: string;
  durationMs?: number;
}

// ── Context Search ────────────────────────────────────────────────────

export interface KeywordTerm {
  term: string;
  canonicalTerm: string;
  weight: number;
  expansions: string[];
  source: 'deterministic' | 'openai' | 'ollama';
}

export interface KeywordBundle {
  provider: 'deterministic' | 'openai' | 'ollama';
  accepted: KeywordTerm[];
  rejectedTerms: string[];
  unknownTerms: string[];
  synthesisTrace: string[];
}

export interface ContextSearchHit {
  id: string;
  path: string;
  title: string;
  cluster: string;
  kind: string;
  score: number;
  matchedTerms: string[];
  symbolMatches: string[];
  exactPathMatches: string[];
  contentMatches: number;
  excerpt: string;
}

export interface ReferenceGraphNode {
  id: string;
  label: string;
  type: 'cluster' | 'file';
  cluster?: string;
  score: number;
}

export interface ReferenceGraphEdge {
  source: string;
  target: string;
  type: 'belongs_to' | 'references' | 'transfer';
  weight: number;
  label?: string;
}

export interface ClusterVisibility {
  id: string;
  label: string;
  score: number;
  matchedTerms: string[];
  topHitIds: string[];
  transferReasons: string[];
}

export interface HeatmapCell {
  keyword: string;
  clusterId: string;
  score: number;
}

export interface InterviewSpeaker {
  id: 'interviewer' | 'retriever' | 'mapper' | 'skeptic' | 'synthesizer';
  label: string;
  role: string;
}

export interface ArtifactCard {
  id: string;
  type: 'paragraph' | 'graph' | 'cluster_map' | 'heatmap' | 'checklist';
  title: string;
  content: string;
  evidenceRefs: string[];
}

export interface InterviewTurn {
  id: string;
  speakerId: InterviewSpeaker['id'];
  text: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  confidence: number;
}

export interface CollectionRow {
  rowId: string;
  rowType: 'attribute' | 'dimension';
  candidateId: string;
  dimension: string;
  attributeId: string | null;
  sourcePass: string;
  sourceArtifact: string;
  seed: string;
  argvSignature: string;
  weightRaw: number | null;
  weightBand: string | null;
  dimensionScore: number | null;
  hierarchyRank: number | null;
  conditionIds: string[];
  observationIds: string[];
  creditLabel: string;
}

export interface CollectionTable {
  columns: string[];
  rows: CollectionRow[];
  generatedAt: string;
}

export interface ConditionNote {
  id: string;
  candidateId: string;
  dimension: string;
  severity: 'info' | 'watch' | 'priority';
  message: string;
  sourceWeightIds: string[];
}

export interface ObservationNote {
  id: string;
  candidateId: string;
  dimension: string;
  message: string;
  surfaceHint: string;
  sourceSliceIds: string[];
}

export interface ContextSearchWorkflowDefinition {
  id: string;
  title: string;
  whatItIs: string;
  authorityOrder: string[];
  contractNotes: string[];
  implementedRuntime: string[];
  adjacentInfluence: string[];
  tokenDenseForm: string;
  stageOrder: string[];
}

export interface ContextSearchObservation {
  acceptedKeywordCount: number;
  rejectedTermCount: number;
  unknownTermCount: number;
  hitCount: number;
  clusterCount: number;
  topCluster: string | null;
  topHit: string | null;
  confidenceSummary: string;
  warnings: string[];
  finalOutput: string;
}

export interface ContextSearchStageResult {
  stage: string;
  status: 'completed' | 'skipped';
  message: string;
  counts: Record<string, number>;
}

export interface ContextSearchResult {
  definition: ContextSearchWorkflowDefinition;
  observation: ContextSearchObservation;
  prints: ContextSearchStageResult[];
  keywords: KeywordBundle;
  summary: string;
  hits: ContextSearchHit[];
  graph: {
    nodes: ReferenceGraphNode[];
    edges: ReferenceGraphEdge[];
  };
  clusters: ClusterVisibility[];
  heatmap: HeatmapCell[];
  artifacts: ArtifactCard[];
  interview: {
    speakers: InterviewSpeaker[];
    turns: InterviewTurn[];
  };
}

// ── Evolution Cycle ─────────────────────────────────────────────────

export type CycleBeat = 'map' | 'balance' | 'tighten' | 'verify';
export type CycleStatus = 'active' | 'promotion_pending' | 'promoted' | 'returned' | 'archived';
export type PromotionGateDecision =
  | 'allow_promotion'
  | 'hold_for_tighten'
  | 'return_to_balance'
  | 'deny_promotion';

export interface EndpointSpec {
  id: string;
  label: string;
  owner?: string;
  contract?: string;
  status: 'draft' | 'ready' | 'blocked' | 'verified';
  required: boolean;
  readiness?: number;
  notes?: string;
  updatedAt: string;
}

export interface HandoffRecord {
  id: string;
  caseId: string;
  from: string;
  to: string;
  status: 'submitted' | 'accepted' | 'rejected';
  summary: string;
  beat: CycleBeat;
  recordedAt: string;
}

export interface CycleSignal {
  id: string;
  caseId: string;
  type:
    | 'endpoint_spec_changed'
    | 'integration_call_succeeded'
    | 'integration_call_failed'
    | 'handoff_submitted'
    | 'handoff_accepted'
    | 'handoff_rejected'
    | 'test_passed'
    | 'test_failed'
    | 'condition_escalated'
    | 'heartbeat_stale';
  weight: number;
  beat: CycleBeat;
  source: string;
  note?: string;
  recordedAt: string;
}

export interface MomentumFrame {
  acceleration: number;
  momentum: number;
  sidewalkDrift: number;
  endpointReadiness: number;
  handoffCompletion: number;
  integrationSuccessRate: number;
  reversalRate: number;
  staleWindowRatio: number;
  openPriorityConditionCount: number;
  updatedAt: string;
}

export interface PromotionGateResult {
  caseId: string;
  decision: PromotionGateDecision;
  passed: boolean;
  beat: CycleBeat;
  evaluatedAt: string;
  reasons: string[];
  thresholds: {
    overallScore: number;
    governanceScore: number;
    integrationScore: number;
    sidewalkDrift: number;
  };
  metrics: {
    overallScore: number;
    governanceScore: number;
    integrationScore: number;
    sidewalkDrift: number;
    requiredEndpointCount: number;
    completeEndpointCount: number;
    openPriorityConditionCount: number;
  };
}

export interface CycleTimelineEntry {
  id: string;
  caseId: string;
  event:
    | 'case_opened'
    | 'beat_advanced'
    | 'case_returned'
    | 'signal_recorded'
    | 'endpoint_upserted'
    | 'handoff_recorded'
    | 'promotion_blocked'
    | 'promotion_allowed';
  beat: CycleBeat;
  status: CycleStatus;
  timestamp: string;
  summary: string;
  refIds: string[];
}

export interface ReturnRecord {
  fromBeat: CycleBeat;
  toBeat: CycleBeat;
  reason?: string;
  returnedAt: string;
}

export interface BeatRailEntry {
  beat: CycleBeat;
  state: 'complete' | 'current' | 'pending';
}

export interface EvolutionCase {
  caseId: string;
  label: string;
  owner?: string;
  candidateIds: string[];
  currentBeat: CycleBeat;
  status: CycleStatus;
  endpointSpecs: EndpointSpec[];
  handoffs: HandoffRecord[];
  signals: CycleSignal[];
  momentum: MomentumFrame;
  latestPromotionDecision: PromotionGateResult | null;
  conditionNotes: ConditionNote[];
  observationNotes: ObservationNote[];
  returnHistory: ReturnRecord[];
  timeline: CycleTimelineEntry[];
  openedAt: string;
  updatedAt: string;
  latestEligibilityResult: {
    summary: string;
    table: CollectionTable;
  } | null;
}

export interface CycleSnapshot {
  summary: string;
  beatRail: BeatRailEntry[];
  caseRecord: EvolutionCase;
}

// ── Shader Pipeline Types ────────────────────────────────────────────

export type WeightBand = 'trace' | 'steady' | 'elevated' | 'dominant';

export interface ShaderDataPayload {
  snapshot: CycleSnapshot;
  promotionGate: PromotionGateResult | null;
  momentum: MomentumFrame | null;
}

export interface HierarchySlice {
  id: string;
  candidateId: string;
  dimension: string;
  score: number;
  rank: number;
  leadingAttributeIds: string[];
}

export interface AnalogWeight {
  id: string;
  candidateId: string;
  attributeId: string;
  dimension: string;
  weightRaw: number;
  weightBand: WeightBand;
  runtimeInfluence: number;
}

export interface EvolutionCaseSummary {
  caseId: string;
  label: string;
  currentBeat: CycleBeat;
  status: CycleStatus;
  candidateIds: string[];
  overallScore: number;
  momentum: number;
  sidewalkDrift: number;
  updatedAt: string;
}

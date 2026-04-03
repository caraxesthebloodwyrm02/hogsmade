import type { ResidueStack } from "@cascade/shared-pipeline";

export type IntegrationDimension =
  | "governance"
  | "usability"
  | "integration"
  | "observability"
  | "operational_fit";

export type CompileTarget = "server_tool" | "rule" | "agent" | "skill" | "reference" | "all";

export type TableScope = "attributes" | "dimensions" | "all";
export type WeightBand = "trace" | "steady" | "elevated" | "dominant";
export type ConditionSeverity = "info" | "watch" | "priority";

export interface EligibilityProperty {
  id: string;
  label: string;
  value: number;
  note?: string;
  source?: string;
}

export interface EligibilityCandidate {
  id: string;
  label: string;
  summary: string;
  properties: EligibilityProperty[];
  tags?: string[];
  source?: string;
}

export interface EligibilityAttribute {
  id: string;
  label: string;
  dimension: IntegrationDimension;
  polarity: "positive" | "negative";
  propertyKeys: string[];
  baseBand: readonly [number, number];
  argMultipliers: Partial<Record<IntegrationDimension, number>>;
  observationHooks: string[];
  conditionHooks: string[];
  tableColumns: string[];
}

export interface AnalogWeight {
  id: string;
  candidateId: string;
  attributeId: string;
  dimension: IntegrationDimension;
  seed: string;
  argvSignature: string;
  sourcePropertyIds: string[];
  weightRaw: number;
  weightBand: WeightBand;
  runtimeInfluence: number;
}

export interface HierarchySlice {
  id: string;
  candidateId: string;
  dimension: IntegrationDimension | "overall";
  score: number;
  rank: number;
  leadingAttributeIds: string[];
}

export interface ConditionNote {
  id: string;
  candidateId: string;
  dimension: IntegrationDimension | "overall";
  severity: ConditionSeverity;
  message: string;
  sourceWeightIds: string[];
}

export interface ObservationNote {
  id: string;
  candidateId: string;
  dimension: IntegrationDimension | "overall";
  message: string;
  surfaceHint: string;
  sourceSliceIds: string[];
}

export interface RoutineArgs {
  governance: number;
  usability: number;
  integration: number;
  observability: number;
  operationalFit: number;
  seed?: string;
  formTarget: CompileTarget;
  tableScope: TableScope;
}

export interface ProvenanceCredit {
  sourcePass: string;
  sourceArtifact: string;
  sourceIds: string[];
  creditLabel: string;
}

export interface FormArtifact {
  kind: Exclude<CompileTarget, "all">;
  path: string;
  title: string;
  content: string;
  runtimeBacked: boolean;
  candidateIds: string[];
  credit: ProvenanceCredit;
}

export interface CollectionRow {
  rowId: string;
  rowType: "attribute" | "dimension";
  candidateId: string;
  dimension: IntegrationDimension | "overall";
  attributeId: string | null;
  sourcePass: string;
  sourceArtifact: string;
  seed: string;
  argvSignature: string;
  weightRaw: number | null;
  weightBand: WeightBand | null;
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

export interface EligibilityValidationResult {
  ok: boolean;
  issues: string[];
  candidateCount: number;
}

export interface EligibilityState {
  args: RoutineArgs;
  argvSignature: string;
  seed: string;
  candidates: EligibilityCandidate[];
  catalog: EligibilityAttribute[];
  weights: AnalogWeight[];
  hierarchy: HierarchySlice[];
  conditions: ConditionNote[];
  observations: ObservationNote[];
  forms: FormArtifact[];
  table: CollectionTable;
  summary: string;
}

export interface RoutineResult {
  pipelineId: string;
  passCount: number;
  durationMs: number;
  args: RoutineArgs;
  argvSignature: string;
  seed: string;
  candidates: EligibilityCandidate[];
  catalog: EligibilityAttribute[];
  weights: AnalogWeight[];
  hierarchy: HierarchySlice[];
  conditions: ConditionNote[];
  observations: ObservationNote[];
  forms: FormArtifact[];
  table: CollectionTable;
  residue: ResidueStack;
  summary: string;
}

export interface SafeRoutineEvaluation {
  validation: EligibilityValidationResult;
  result: RoutineResult | null;
}

export type CycleBeat = "map" | "balance" | "tighten" | "verify";
export type CycleStatus = "active" | "promotion_pending" | "promoted" | "returned" | "archived";
export type EndpointStatus = "draft" | "ready" | "blocked" | "verified";
export type HandoffStatus = "submitted" | "accepted" | "rejected";
export type PromotionGateDecision =
  | "allow_promotion"
  | "hold_for_tighten"
  | "return_to_balance"
  | "deny_promotion";
export type CycleSignalKind =
  | "endpoint_spec_changed"
  | "integration_call_succeeded"
  | "integration_call_failed"
  | "handoff_submitted"
  | "handoff_accepted"
  | "handoff_rejected"
  | "test_passed"
  | "test_failed"
  | "condition_escalated"
  | "heartbeat_stale";
export type CycleTimelineEvent =
  | "case_opened"
  | "beat_advanced"
  | "case_returned"
  | "signal_recorded"
  | "endpoint_upserted"
  | "handoff_recorded"
  | "promotion_blocked"
  | "promotion_allowed";

export interface CycleSignal {
  id: string;
  caseId: string;
  type: CycleSignalKind;
  weight: number;
  beat: CycleBeat;
  source: string;
  note?: string;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}

export interface EndpointSpec {
  id: string;
  label: string;
  owner?: string;
  contract?: string;
  status: EndpointStatus;
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
  status: HandoffStatus;
  summary: string;
  beat: CycleBeat;
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
  event: CycleTimelineEvent;
  beat: CycleBeat;
  status: CycleStatus;
  timestamp: string;
  summary: string;
  refIds: string[];
  metadata?: Record<string, unknown>;
}

export interface CycleSnapshotPoint {
  id: string;
  caseId: string;
  beat: CycleBeat;
  timestamp: string;
  endpointReadiness: number;
  integrationSuccessRate: number;
  overallScore: number;
  governanceScore: number;
  integrationScore: number;
  momentum: number;
  sidewalkDrift: number;
}

export interface ReturnRecord {
  fromBeat: CycleBeat;
  toBeat: CycleBeat;
  reason?: string;
  returnedAt: string;
}

export interface EvolutionCase {
  caseId: string;
  label: string;
  owner?: string;
  candidateIds: string[];
  candidates: EligibilityCandidate[];
  args: RoutineArgs;
  currentBeat: CycleBeat;
  status: CycleStatus;
  endpointSpecs: EndpointSpec[];
  handoffs: HandoffRecord[];
  signals: CycleSignal[];
  momentum: MomentumFrame;
  promotionHistory: PromotionGateResult[];
  latestPromotionDecision: PromotionGateResult | null;
  latestEligibilityResult: RoutineResult | null;
  conditionNotes: ConditionNote[];
  observationNotes: ObservationNote[];
  returnHistory: ReturnRecord[];
  snapshotHistory: CycleSnapshotPoint[];
  timeline: CycleTimelineEntry[];
  openedAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface BeatRailEntry {
  beat: CycleBeat;
  state: "complete" | "current" | "pending";
}

export interface CycleSnapshot {
  summary: string;
  caseRecord: EvolutionCase;
  beatRail: BeatRailEntry[];
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

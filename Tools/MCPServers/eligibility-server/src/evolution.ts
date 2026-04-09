import { emitAudit } from "@cascade/shared-types/audit-client";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { onCycleSignalRecorded, onEvolutionCaseOpened, onPromotionGateEvaluated } from "./hooks.js";
import {
  buildDeterministicTimestamp,
  evaluateRoutine,
  normalizeRoutineArgs,
  safeEvaluateRoutine,
} from "./pipeline.js";
import type {
  BeatRailEntry,
  ConditionNote,
  CycleBeat,
  CycleSignal,
  CycleSignalKind,
  CycleSnapshot,
  CycleTimelineEntry,
  EligibilityCandidate,
  EndpointSpec,
  EvolutionCase,
  EvolutionCaseSummary,
  HandoffRecord,
  MomentumFrame,
  ObservationNote,
  PromotionGateDecision,
  PromotionGateResult,
  RoutineArgs,
  RoutineResult,
} from "./types.js";

const STORE_FILENAME = "evolution-cases.json";
const BEAT_SEQUENCE: readonly CycleBeat[] = ["map", "balance", "tighten", "verify"] as const;

export const DEFAULT_SIGNAL_WEIGHTS: Record<CycleSignalKind, number> = {
  endpoint_spec_changed: 0.35,
  integration_call_succeeded: 0.2,
  integration_call_failed: 0.45,
  handoff_submitted: 0.3,
  handoff_accepted: 0.2,
  handoff_rejected: 0.4,
  test_passed: 0.2,
  test_failed: 0.45,
  condition_escalated: 0.4,
  heartbeat_stale: 0.1,
};

interface EvolutionStoreData {
  schemaVersion: string;
  cases: EvolutionCase[];
}

export interface OpenEvolutionCaseInput {
  caseId?: string;
  label?: string;
  owner?: string;
  candidates: EligibilityCandidate[];
  args?: Partial<RoutineArgs>;
}

export interface RecordCycleSignalInput {
  caseId: string;
  type: CycleSignalKind;
  source?: string;
  note?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface RecordHandoffInput {
  caseId: string;
  from: string;
  to: string;
  status: HandoffRecord["status"];
  summary: string;
}

export interface UpsertEndpointSpecInput {
  caseId: string;
  endpointId: string;
  label: string;
  owner?: string;
  contract?: string;
  status: EndpointSpec["status"];
  required?: boolean;
  readiness?: number;
  notes?: string;
}

export interface AdvanceCycleInput {
  caseId: string;
  direction?: "forward" | "return";
  reason?: string;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  // Use structuredClone when available for prototype-pollution-safe deep cloning
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  // Fallback: JSON round-trip with prototype pollution guard
  const json = JSON.stringify(value);
  if (json.includes("__proto__") || json.includes("constructor")) {
    throw new Error("clone: rejected input containing prototype pollution patterns");
  }
  return JSON.parse(json) as T;
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildCaseId(candidates: EligibilityCandidate[], label: string, args: RoutineArgs): string {
  const base = `${label}:${candidates
    .map((candidate) => candidate.id)
    .sort()
    .join(",")}:${args.seed ?? "seedless"}`;
  return `cycle-${hashString(base)}`;
}

function defaultDataDir(): string {
  return process.env["ELIGIBILITY_DATA_DIR"] ?? path.join(homedir(), ".eligibility-server");
}

function defaultStorePath(): string {
  return path.join(defaultDataDir(), STORE_FILENAME);
}

function severityScore(severity: ConditionNote["severity"]): number {
  if (severity === "priority") return 3;
  if (severity === "watch") return 2;
  return 1;
}

function topOverallCandidate(result: RoutineResult): string | null {
  return (
    result.hierarchy
      .filter((slice) => slice.dimension === "overall")
      .sort((left, right) => left.rank - right.rank)[0]?.candidateId ?? null
  );
}

function sliceScore(
  result: RoutineResult,
  candidateId: string | null,
  dimension: "overall" | "governance" | "integration",
): number {
  if (!candidateId) return 0;
  return (
    result.hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === dimension,
    )?.score ?? 0
  );
}

function buildBeatRail(currentBeat: CycleBeat): BeatRailEntry[] {
  const currentIndex = BEAT_SEQUENCE.indexOf(currentBeat);
  return BEAT_SEQUENCE.map((beat, index) => ({
    beat,
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending",
  }));
}

function summarizeCase(caseRecord: EvolutionCase): string {
  const result = caseRecord.latestEligibilityResult;
  const leaderId = result ? topOverallCandidate(result) : null;
  const leaderLabel =
    caseRecord.candidates.find((candidate) => candidate.id === leaderId)?.label ??
    leaderId ??
    caseRecord.label;
  const overallScore = result ? sliceScore(result, leaderId, "overall").toFixed(3) : "0.000";
  return `${leaderLabel} is in ${caseRecord.currentBeat} with momentum ${caseRecord.momentum.momentum.toFixed(3)}, drift ${caseRecord.momentum.sidewalkDrift.toFixed(3)}, and overall score ${overallScore}.`;
}

function endpointReadinessScore(spec: EndpointSpec): number {
  let score = 0;
  if (spec.owner?.trim()) score += 0.25;
  if (spec.contract?.trim()) score += 0.25;
  if (spec.status === "ready" || spec.status === "verified") score += 0.25;
  const readiness = clamp(
    spec.readiness ??
    (spec.status === "verified"
      ? 1
      : spec.status === "ready"
        ? 0.8
        : spec.status === "blocked"
          ? 0.2
          : 0.45),
    0,
    1,
  );
  score += readiness * 0.25;
  return round(score);
}

function computeEndpointStats(endpointSpecs: EndpointSpec[]) {
  if (endpointSpecs.length === 0) {
    return { endpointReadiness: 0, requiredCount: 0, completeCount: 0 };
  }

  const required = endpointSpecs.filter((spec) => spec.required);
  const completeCount = required.filter(
    (spec) =>
      Boolean(spec.owner?.trim()) &&
      Boolean(spec.contract?.trim()) &&
      (spec.status === "ready" || spec.status === "verified"),
  ).length;

  const endpointReadiness = round(
    endpointSpecs.reduce((sum, spec) => sum + endpointReadinessScore(spec), 0) /
    endpointSpecs.length,
  );

  return {
    endpointReadiness,
    requiredCount: required.length,
    completeCount,
  };
}

function computeHandoffCompletion(handoffs: HandoffRecord[]): number {
  if (handoffs.length === 0) return 0;
  const accepted = handoffs.filter((handoff) => handoff.status === "accepted").length;
  return round(accepted / handoffs.length);
}

function computeIntegrationSuccessRate(signals: CycleSignal[]): number {
  const successSignals = signals.filter(
    (signal) => signal.type === "integration_call_succeeded" || signal.type === "test_passed",
  );
  const failureSignals = signals.filter(
    (signal) => signal.type === "integration_call_failed" || signal.type === "test_failed",
  );
  const total = successSignals.length + failureSignals.length;
  if (total === 0) return 0;
  return round(successSignals.length / total);
}

function computeReversalRate(caseRecord: EvolutionCase): number {
  const returnCount = caseRecord.returnHistory.length;
  const advanceCount = caseRecord.timeline.filter(
    (entry) => entry.event === "beat_advanced",
  ).length;
  if (advanceCount === 0) return 0;
  return round(clamp(returnCount / advanceCount, 0, 1));
}

function computeStaleWindowRatio(signals: CycleSignal[]): number {
  if (signals.length === 0) return 0;
  const staleCount = signals.filter((signal) => signal.type === "heartbeat_stale").length;
  return round(clamp(staleCount / signals.length, 0, 1));
}

function nextTimestamp(
  caseRecord: Pick<EvolutionCase, "caseId" | "args" | "timeline" | "snapshotHistory">,
  label: string,
): string {
  const seed = caseRecord.args.seed ?? caseRecord.caseId;
  const index = caseRecord.timeline.length + caseRecord.snapshotHistory.length + 1;
  return buildDeterministicTimestamp(seed, `${caseRecord.caseId}:${index}:${label}`);
}

function buildTimelineEntry(
  caseRecord: Pick<EvolutionCase, "caseId" | "currentBeat" | "status">,
  event: CycleTimelineEntry["event"],
  timestamp: string,
  summary: string,
  refIds: string[],
  metadata?: Record<string, unknown>,
): CycleTimelineEntry {
  return {
    id: `${caseRecord.caseId}:${event}:${timestamp}`,
    caseId: caseRecord.caseId,
    event,
    beat: caseRecord.currentBeat,
    status: caseRecord.status,
    timestamp,
    summary,
    refIds,
    metadata,
  };
}

function pushTimeline(
  caseRecord: EvolutionCase,
  event: CycleTimelineEntry["event"],
  timestamp: string,
  summary: string,
  refIds: string[],
  metadata?: Record<string, unknown>,
) {
  caseRecord.timeline.push(
    buildTimelineEntry(caseRecord, event, timestamp, summary, refIds, metadata),
  );
  caseRecord.updatedAt = timestamp;
}

function baseConditions(
  caseRecord: EvolutionCase,
  result: RoutineResult,
  timestamp: string,
  endpointStats: { requiredCount: number; completeCount: number },
  integrationSuccessRate: number,
): ConditionNote[] {
  const conditions = result.conditions.map((condition) => ({
    ...condition,
    sourceWeightIds: [...condition.sourceWeightIds],
  }));

  for (const endpoint of caseRecord.endpointSpecs.filter((spec) => spec.required)) {
    const missingBits = [
      endpoint.owner?.trim() ? null : "owner",
      endpoint.contract?.trim() ? null : "contract",
      endpoint.status === "ready" || endpoint.status === "verified" ? null : "status",
    ].filter(Boolean);

    if (missingBits.length > 0) {
      conditions.push({
        id: `${caseRecord.caseId}:endpoint:${endpoint.id}:priority`,
        candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
        dimension: "integration",
        severity: "priority",
        message: `Endpoint ${endpoint.label} is incomplete: missing ${missingBits.join(", ")}.`,
        sourceWeightIds: [endpoint.id],
      });
    }
  }

  const latestRejectedHandoff = [...caseRecord.handoffs]
    .reverse()
    .find((handoff) => handoff.status === "rejected");
  if (latestRejectedHandoff) {
    conditions.push({
      id: `${caseRecord.caseId}:handoff:${latestRejectedHandoff.id}:watch`,
      candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
      dimension: "overall",
      severity: "watch",
      message: `A recent handoff from ${latestRejectedHandoff.from} to ${latestRejectedHandoff.to} was rejected and needs rebalance.`,
      sourceWeightIds: [latestRejectedHandoff.id],
    });
  }

  if (caseRecord.currentBeat === "verify" && integrationSuccessRate < 0.55) {
    conditions.push({
      id: `${caseRecord.caseId}:verify:integration-priority`,
      candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
      dimension: "integration",
      severity: "priority",
      message: "Verify beat requires stronger integration success before promotion can proceed.",
      sourceWeightIds: ["integration-success-rate"],
    });
  }

  if (endpointStats.requiredCount > 0 && endpointStats.completeCount === 0) {
    conditions.push({
      id: `${caseRecord.caseId}:endpoint:zero-complete`,
      candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
      dimension: "integration",
      severity: "priority",
      message: "No required endpoints are complete yet; keep the cycle in shaping beats.",
      sourceWeightIds: caseRecord.endpointSpecs.map((spec) => spec.id),
    });
  }

  return conditions
    .sort((left, right) => severityScore(right.severity) - severityScore(left.severity))
    .map((condition, index) => ({
      ...condition,
      id: `${condition.id}:${index}:${timestamp}`,
    }));
}

function buildObservations(
  caseRecord: EvolutionCase,
  result: RoutineResult,
  timestamp: string,
  momentum: MomentumFrame,
): ObservationNote[] {
  const observations = result.observations.map((observation) => ({
    ...observation,
    sourceSliceIds: [...observation.sourceSliceIds],
  }));

  observations.push({
    id: `${caseRecord.caseId}:beat:${caseRecord.currentBeat}:${timestamp}`,
    candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
    dimension: "overall",
    message: `The control room is currently centered on the ${caseRecord.currentBeat} beat.`,
    surfaceHint:
      "Use the beat rail as the top-level status surface before reading tables or artifacts.",
    sourceSliceIds: [caseRecord.currentBeat],
  });

  observations.push({
    id: `${caseRecord.caseId}:momentum:${timestamp}`,
    candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
    dimension: "overall",
    message: `Momentum ${momentum.momentum.toFixed(3)} and drift ${momentum.sidewalkDrift.toFixed(3)} define the current transport tension.`,
    surfaceHint:
      "Read momentum and drift together before deciding whether the next handoff is safe.",
    sourceSliceIds: ["momentum", "sidewalk-drift"],
  });

  return observations;
}

function buildMomentum(
  caseRecord: EvolutionCase,
  timestamp: string,
  endpointReadiness: number,
  handoffCompletion: number,
  integrationSuccessRate: number,
  openPriorityConditionCount: number,
): MomentumFrame {
  const previousSnapshot = caseRecord.snapshotHistory[caseRecord.snapshotHistory.length - 1];
  const acceleration = previousSnapshot
    ? clamp(
      endpointReadiness -
      previousSnapshot.endpointReadiness +
      (integrationSuccessRate - previousSnapshot.integrationSuccessRate),
      0,
      1,
    )
    : 0;
  const reversalRate = computeReversalRate(caseRecord);
  const staleWindowRatio = computeStaleWindowRatio(caseRecord.signals);
  const momentum = clamp(
    endpointReadiness * 0.45 + handoffCompletion * 0.3 + integrationSuccessRate * 0.25,
    0,
    1,
  );
  const normalizedPriorityCount = clamp(openPriorityConditionCount / 3, 0, 1);
  const sidewalkDrift = clamp(
    reversalRate * 0.4 + normalizedPriorityCount * 0.35 + staleWindowRatio * 0.25,
    0,
    1,
  );

  return {
    acceleration: round(acceleration),
    momentum: round(momentum),
    sidewalkDrift: round(sidewalkDrift),
    endpointReadiness: round(endpointReadiness),
    handoffCompletion: round(handoffCompletion),
    integrationSuccessRate: round(integrationSuccessRate),
    reversalRate: round(reversalRate),
    staleWindowRatio: round(staleWindowRatio),
    openPriorityConditionCount,
    updatedAt: timestamp,
  };
}

function appendDriftCondition(
  caseRecord: EvolutionCase,
  conditions: ConditionNote[],
  timestamp: string,
  sidewalkDrift: number,
): ConditionNote[] {
  const severity: ConditionNote["severity"] | null =
    sidewalkDrift >= 0.55 ? "priority" : sidewalkDrift >= 0.35 ? "watch" : null;
  if (!severity) return conditions;

  return [
    {
      id: `${caseRecord.caseId}:drift:${severity}:${timestamp}`,
      candidateId: caseRecord.candidateIds[0] ?? caseRecord.caseId,
      dimension: "overall",
      severity,
      message:
        severity === "priority"
          ? "Sidewalk drift is high; promotion should not proceed until reversals and stale pressure are reduced."
          : "Sidewalk drift is rising; monitor returns and stale windows before promotion.",
      sourceWeightIds: ["sidewalk-drift"],
    },
    ...conditions,
  ];
}

function refreshCaseRecord(
  caseRecord: EvolutionCase,
  timestamp: string,
  appendSnapshot = true,
): EvolutionCase {
  const evaluation = evaluateRoutine(caseRecord.candidates, caseRecord.args);
  const endpointStats = computeEndpointStats(caseRecord.endpointSpecs);
  const handoffCompletion = computeHandoffCompletion(caseRecord.handoffs);
  const integrationSuccessRate = computeIntegrationSuccessRate(caseRecord.signals);
  const initialConditions = baseConditions(
    caseRecord,
    evaluation,
    timestamp,
    endpointStats,
    integrationSuccessRate,
  );
  const provisionalMomentum = buildMomentum(
    caseRecord,
    timestamp,
    endpointStats.endpointReadiness,
    handoffCompletion,
    integrationSuccessRate,
    initialConditions.filter((condition) => condition.severity === "priority").length,
  );
  const conditions = appendDriftCondition(
    caseRecord,
    initialConditions,
    timestamp,
    provisionalMomentum.sidewalkDrift,
  ).sort((left, right) => severityScore(right.severity) - severityScore(left.severity));
  const momentum = buildMomentum(
    caseRecord,
    timestamp,
    endpointStats.endpointReadiness,
    handoffCompletion,
    integrationSuccessRate,
    conditions.filter((condition) => condition.severity === "priority").length,
  );
  const observations = buildObservations(caseRecord, evaluation, timestamp, momentum);

  caseRecord.latestEligibilityResult = evaluation;
  caseRecord.conditionNotes = conditions;
  caseRecord.observationNotes = observations;
  caseRecord.momentum = momentum;
  caseRecord.updatedAt = timestamp;

  if (appendSnapshot) {
    const leaderId = topOverallCandidate(evaluation);
    caseRecord.snapshotHistory.push({
      id: `${caseRecord.caseId}:snapshot:${caseRecord.snapshotHistory.length + 1}`,
      caseId: caseRecord.caseId,
      beat: caseRecord.currentBeat,
      timestamp,
      endpointReadiness: endpointStats.endpointReadiness,
      integrationSuccessRate,
      overallScore: round(sliceScore(evaluation, leaderId, "overall")),
      governanceScore: round(sliceScore(evaluation, leaderId, "governance")),
      integrationScore: round(sliceScore(evaluation, leaderId, "integration")),
      momentum: momentum.momentum,
      sidewalkDrift: momentum.sidewalkDrift,
    });
  }

  return caseRecord;
}

function buildSnapshot(caseRecord: EvolutionCase): CycleSnapshot {
  return {
    summary: summarizeCase(caseRecord),
    caseRecord: clone(caseRecord),
    beatRail: buildBeatRail(caseRecord.currentBeat),
  };
}

function summaryStatus(event: CycleTimelineEntry["event"]): "success" | "blocked" {
  return event === "promotion_blocked" ? "blocked" : "success";
}

function emitCycleAudit(
  caseRecord: EvolutionCase,
  event: CycleTimelineEntry["event"],
  _summary: string,
  metadata?: Record<string, unknown>,
) {
  void emitAudit({
    source: "eligibility-server",
    tool: `evolution_${event}`,
    status: summaryStatus(event),
    metadata: {
      caseId: caseRecord.caseId,
      beat: caseRecord.currentBeat,
      cycleStatus: caseRecord.status,
      ...metadata,
    },
  });
}

export class EvolutionCycleStore {
  private cache: EvolutionStoreData | null = null;

  constructor(private readonly filePath = defaultStorePath()) { }

  private ensureLoaded(): EvolutionStoreData {
    if (this.cache) return this.cache;

    const directory = path.dirname(this.filePath);
    mkdirSync(directory, { recursive: true });

    if (!existsSync(this.filePath)) {
      this.cache = { schemaVersion: "1.0.0", cases: [] };
      writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
      return this.cache;
    }

    const raw = readFileSync(this.filePath, "utf8");
    this.cache = raw.trim()
      ? (JSON.parse(raw) as EvolutionStoreData)
      : { schemaVersion: "1.0.0", cases: [] };
    this.cache.cases ||= [];
    return this.cache;
  }

  private save(): void {
    if (!this.cache) return;
    writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
  }

  listCases(): EvolutionCase[] {
    return clone(this.ensureLoaded().cases);
  }

  listActiveSummaries(): EvolutionCaseSummary[] {
    return this.ensureLoaded()
      .cases.filter((caseRecord) => caseRecord.status !== "archived")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((caseRecord) => {
        const latestSnapshot = caseRecord.snapshotHistory[caseRecord.snapshotHistory.length - 1];
        return {
          caseId: caseRecord.caseId,
          label: caseRecord.label,
          currentBeat: caseRecord.currentBeat,
          status: caseRecord.status,
          candidateIds: [...caseRecord.candidateIds],
          overallScore: latestSnapshot?.overallScore ?? 0,
          momentum: caseRecord.momentum.momentum,
          sidewalkDrift: caseRecord.momentum.sidewalkDrift,
          updatedAt: caseRecord.updatedAt,
        };
      });
  }

  getCase(caseId: string): EvolutionCase | undefined {
    return clone(this.ensureLoaded().cases.find((caseRecord) => caseRecord.caseId === caseId));
  }

  upsertCase(caseRecord: EvolutionCase): EvolutionCase {
    const data = this.ensureLoaded();
    const index = data.cases.findIndex((entry) => entry.caseId === caseRecord.caseId);
    const stored = clone(caseRecord);
    if (index >= 0) data.cases[index] = stored;
    else data.cases.push(stored);
    this.save();
    return clone(stored);
  }
}

let defaultStore: EvolutionCycleStore | undefined;

export function getEvolutionCycleStore(): EvolutionCycleStore {
  defaultStore ??= new EvolutionCycleStore();
  return defaultStore;
}

function validateCaseLookup(caseRecord: EvolutionCase | undefined, caseId: string): EvolutionCase {
  if (!caseRecord) {
    throw new Error(`Evolution case not found: ${caseId}`);
  }
  return caseRecord;
}

function promotionDecision(caseRecord: EvolutionCase, timestamp: string): PromotionGateResult {
  const result = caseRecord.latestEligibilityResult;
  const leaderId = result ? topOverallCandidate(result) : null;
  const overallScore = result ? sliceScore(result, leaderId, "overall") : 0;
  const governanceScore = result ? sliceScore(result, leaderId, "governance") : 0;
  const integrationScore = result ? sliceScore(result, leaderId, "integration") : 0;
  const requiredEndpointCount = caseRecord.endpointSpecs.filter((spec) => spec.required).length;
  const completeEndpointCount = caseRecord.endpointSpecs.filter(
    (spec) =>
      spec.required &&
      Boolean(spec.owner?.trim()) &&
      Boolean(spec.contract?.trim()) &&
      (spec.status === "ready" || spec.status === "verified"),
  ).length;
  const openPriorityConditionCount = caseRecord.conditionNotes.filter(
    (condition) => condition.severity === "priority",
  ).length;
  const reasons: string[] = [];
  let decision: PromotionGateDecision = "allow_promotion";

  if (caseRecord.currentBeat !== "verify") {
    reasons.push("Promotion may only be evaluated from the verify beat.");
    decision = "deny_promotion";
  }

  if (overallScore < 0.68) reasons.push(`Overall score ${overallScore.toFixed(3)} is below 0.680.`);
  if (governanceScore < 0.62)
    reasons.push(`Governance score ${governanceScore.toFixed(3)} is below 0.620.`);
  if (integrationScore < 0.64)
    reasons.push(`Integration score ${integrationScore.toFixed(3)} is below 0.640.`);
  if (requiredEndpointCount > completeEndpointCount)
    reasons.push("Not all required endpoint specs are complete.");
  if (openPriorityConditionCount > 0) reasons.push("Priority conditions remain open.");
  if (caseRecord.momentum.sidewalkDrift >= 0.35)
    reasons.push(`Sidewalk drift ${caseRecord.momentum.sidewalkDrift.toFixed(3)} is above 0.350.`);

  if (decision !== "deny_promotion") {
    if (reasons.length === 0) {
      decision = "allow_promotion";
    } else if (
      caseRecord.momentum.sidewalkDrift >= 0.5 ||
      integrationScore < 0.55 ||
      governanceScore < 0.5
    ) {
      decision = "return_to_balance";
    } else {
      decision = "hold_for_tighten";
    }
  }

  return {
    caseId: caseRecord.caseId,
    decision,
    passed: decision === "allow_promotion",
    beat: caseRecord.currentBeat,
    evaluatedAt: timestamp,
    reasons,
    thresholds: {
      overallScore: 0.68,
      governanceScore: 0.62,
      integrationScore: 0.64,
      sidewalkDrift: 0.35,
    },
    metrics: {
      overallScore: round(overallScore),
      governanceScore: round(governanceScore),
      integrationScore: round(integrationScore),
      sidewalkDrift: caseRecord.momentum.sidewalkDrift,
      requiredEndpointCount,
      completeEndpointCount,
      openPriorityConditionCount,
    },
  };
}

export function openEvolutionCase(
  input: OpenEvolutionCaseInput,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const args = normalizeRoutineArgs(input.args);
  const validation = safeEvaluateRoutine(input.candidates, args).validation;
  if (!validation.ok) {
    return {
      validation,
      created: false,
      snapshot: null as CycleSnapshot | null,
    };
  }

  const label =
    input.label?.trim() || `${input.candidates[0]?.label ?? "Eligibility"} evolution case`;
  const caseId = input.caseId?.trim() || buildCaseId(input.candidates, label, args);
  const existing = store.getCase(caseId);
  if (existing) {
    return {
      validation,
      created: false,
      snapshot: buildSnapshot(existing),
    };
  }

  const timestamp = buildDeterministicTimestamp(args.seed ?? caseId, `${caseId}:open`);
  const caseRecord: EvolutionCase = {
    caseId,
    label,
    owner: input.owner?.trim(),
    candidateIds: input.candidates.map((candidate) => candidate.id),
    candidates: clone(input.candidates),
    args,
    currentBeat: "map",
    status: "active",
    endpointSpecs: [],
    handoffs: [],
    signals: [],
    momentum: {
      acceleration: 0,
      momentum: 0,
      sidewalkDrift: 0,
      endpointReadiness: 0,
      handoffCompletion: 0,
      integrationSuccessRate: 0,
      reversalRate: 0,
      staleWindowRatio: 0,
      openPriorityConditionCount: 0,
      updatedAt: timestamp,
    },
    promotionHistory: [],
    latestPromotionDecision: null,
    latestEligibilityResult: null,
    conditionNotes: [],
    observationNotes: [],
    returnHistory: [],
    snapshotHistory: [],
    timeline: [],
    openedAt: timestamp,
    updatedAt: timestamp,
  };

  pushTimeline(
    caseRecord,
    "case_opened",
    timestamp,
    `Opened evolution case ${label}.`,
    caseRecord.candidateIds,
  );
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(stored, "case_opened", `Opened evolution case ${stored.label}.`, {
    candidateIds: stored.candidateIds,
  });

  // Trigger hook for cross-server routing (fire-and-forget to preserve sync API)
  void onEvolutionCaseOpened(stored);

  return {
    validation,
    created: true,
    snapshot: buildSnapshot(stored),
  };
}

export function listActiveCycles(store: EvolutionCycleStore = getEvolutionCycleStore()) {
  return {
    cases: store.listActiveSummaries(),
  };
}

export function getCycleSnapshot(
  caseId: string,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(caseId), caseId);
  return buildSnapshot(caseRecord);
}

export function recordCycleSignal(
  input: RecordCycleSignalInput,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
  const timestamp = nextTimestamp(caseRecord, `signal:${input.type}`);
  const signal: CycleSignal = {
    id: `${caseRecord.caseId}:signal:${caseRecord.signals.length + 1}`,
    caseId: caseRecord.caseId,
    type: input.type,
    weight: round(input.weight ?? DEFAULT_SIGNAL_WEIGHTS[input.type]),
    beat: caseRecord.currentBeat,
    source: input.source?.trim() || "runtime",
    note: input.note?.trim(),
    recordedAt: timestamp,
    metadata: input.metadata ? clone(input.metadata) : undefined,
  };

  caseRecord.signals.push(signal);
  pushTimeline(
    caseRecord,
    "signal_recorded",
    timestamp,
    `Recorded ${input.type} signal.`,
    [signal.id],
    {
      source: signal.source,
      weight: signal.weight,
    },
  );
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(stored, "signal_recorded", `Recorded ${input.type} signal.`, {
    signalType: input.type,
    weight: signal.weight,
  });

  // Trigger hook for cross-server routing (fire-and-forget to preserve sync API)
  void onCycleSignalRecorded(stored.caseId, signal);

  return {
    signal,
    snapshot: buildSnapshot(stored),
  };
}

export function recordHandoff(
  input: RecordHandoffInput,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
  const timestamp = nextTimestamp(caseRecord, `handoff:${input.status}`);
  const handoff: HandoffRecord = {
    id: `${caseRecord.caseId}:handoff:${caseRecord.handoffs.length + 1}`,
    caseId: caseRecord.caseId,
    from: input.from,
    to: input.to,
    status: input.status,
    summary: input.summary,
    beat: caseRecord.currentBeat,
    recordedAt: timestamp,
  };

  caseRecord.handoffs.push(handoff);
  pushTimeline(
    caseRecord,
    "handoff_recorded",
    timestamp,
    `Recorded ${input.status} handoff from ${input.from} to ${input.to}.`,
    [handoff.id],
  );
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(stored, "handoff_recorded", `Recorded ${input.status} handoff.`, {
    from: input.from,
    to: input.to,
    handoffStatus: input.status,
  });

  return {
    handoff,
    snapshot: buildSnapshot(stored),
  };
}

export function upsertEndpointSpec(
  input: UpsertEndpointSpecInput,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
  const timestamp = nextTimestamp(caseRecord, `endpoint:${input.endpointId}`);
  const spec: EndpointSpec = {
    id: input.endpointId,
    label: input.label,
    owner: input.owner?.trim(),
    contract: input.contract?.trim(),
    status: input.status,
    required: input.required ?? true,
    readiness: input.readiness !== undefined ? round(clamp(input.readiness, 0, 1)) : undefined,
    notes: input.notes?.trim(),
    updatedAt: timestamp,
  };

  const existingIndex = caseRecord.endpointSpecs.findIndex((entry) => entry.id === spec.id);
  if (existingIndex >= 0) caseRecord.endpointSpecs[existingIndex] = spec;
  else caseRecord.endpointSpecs.push(spec);

  pushTimeline(
    caseRecord,
    "endpoint_upserted",
    timestamp,
    `Upserted endpoint spec ${spec.label}.`,
    [spec.id],
    {
      endpointStatus: spec.status,
      required: spec.required,
    },
  );
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(stored, "endpoint_upserted", `Upserted endpoint ${spec.label}.`, {
    endpointId: spec.id,
    endpointStatus: spec.status,
  });

  return {
    endpoint: spec,
    snapshot: buildSnapshot(stored),
  };
}

export function advanceCycle(
  input: AdvanceCycleInput,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
  const direction = input.direction ?? "forward";
  const currentIndex = BEAT_SEQUENCE.indexOf(caseRecord.currentBeat);

  if (direction === "return") {
    if (currentIndex === 0) {
      throw new Error("Map is the first beat; the cycle cannot return further.");
    }
    const toBeat = BEAT_SEQUENCE[currentIndex - 1];
    const timestamp = nextTimestamp(caseRecord, `return:${toBeat}`);
    caseRecord.returnHistory.push({
      fromBeat: caseRecord.currentBeat,
      toBeat,
      reason: input.reason?.trim(),
      returnedAt: timestamp,
    });
    caseRecord.currentBeat = toBeat;
    caseRecord.status = "returned";
    pushTimeline(caseRecord, "case_returned", timestamp, `Returned cycle to ${toBeat}.`, [toBeat], {
      reason: input.reason?.trim(),
    });
    refreshCaseRecord(caseRecord, timestamp);
    const stored = store.upsertCase(caseRecord);
    emitCycleAudit(stored, "case_returned", `Returned cycle to ${toBeat}.`, {
      toBeat,
      reason: input.reason?.trim(),
    });
    return buildSnapshot(stored);
  }

  if (caseRecord.currentBeat === "verify") {
    throw new Error(
      "Verify is the terminal beat; use evaluate_promotion_gate instead of advancing.",
    );
  }

  const nextBeat = BEAT_SEQUENCE[currentIndex + 1];
  const timestamp = nextTimestamp(caseRecord, `advance:${nextBeat}`);
  caseRecord.currentBeat = nextBeat;
  caseRecord.status = nextBeat === "verify" ? "promotion_pending" : "active";
  pushTimeline(caseRecord, "beat_advanced", timestamp, `Advanced cycle to ${nextBeat}.`, [
    nextBeat,
  ]);
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(stored, "beat_advanced", `Advanced cycle to ${nextBeat}.`, {
    nextBeat,
  });
  return buildSnapshot(stored);
}

export function evaluatePromotionGate(
  caseId: string,
  store: EvolutionCycleStore = getEvolutionCycleStore(),
) {
  const caseRecord = validateCaseLookup(store.getCase(caseId), caseId);
  const timestamp = nextTimestamp(caseRecord, "promotion");
  refreshCaseRecord(caseRecord, timestamp, false);
  const gate = promotionDecision(caseRecord, timestamp);
  caseRecord.latestPromotionDecision = gate;
  caseRecord.promotionHistory.push(gate);

  if (gate.decision === "allow_promotion") {
    caseRecord.status = "promoted";
    pushTimeline(
      caseRecord,
      "promotion_allowed",
      timestamp,
      "Promotion gate passed.",
      ["promotion-gate"],
      {
        decision: gate.decision,
      },
    );
    emitCycleAudit(caseRecord, "promotion_allowed", "Promotion gate passed.", {
      decision: gate.decision,
    });
  } else {
    if (gate.decision === "hold_for_tighten") {
      caseRecord.returnHistory.push({
        fromBeat: "verify",
        toBeat: "tighten",
        reason: "Promotion gate requested tighten.",
        returnedAt: timestamp,
      });
      caseRecord.currentBeat = "tighten";
      caseRecord.status = "returned";
    } else if (gate.decision === "return_to_balance") {
      caseRecord.returnHistory.push({
        fromBeat: "verify",
        toBeat: "balance",
        reason: "Promotion gate requested balance.",
        returnedAt: timestamp,
      });
      caseRecord.currentBeat = "balance";
      caseRecord.status = "returned";
    }

    pushTimeline(
      caseRecord,
      "promotion_blocked",
      timestamp,
      `Promotion blocked: ${gate.decision}.`,
      ["promotion-gate"],
      {
        decision: gate.decision,
        reasons: gate.reasons,
      },
    );
    emitCycleAudit(caseRecord, "promotion_blocked", `Promotion blocked: ${gate.decision}.`, {
      decision: gate.decision,
      reasons: gate.reasons,
    });
  }

  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);

  // Trigger hook for cross-server routing (fire-and-forget to preserve sync API)
  void onPromotionGateEvaluated(caseRecord, gate);

  return {
    gate,
    snapshot: buildSnapshot(stored),
  };
}

export function hydrateExistingCases(
  store: EvolutionCycleStore = getEvolutionCycleStore(),
): EvolutionCase[] {
  return store.listCases();
}

export function updateCaseArgs(
  input: { caseId: string; args: Partial<RoutineArgs> },
  store: EvolutionCycleStore = getEvolutionCycleStore(),
): { updated: boolean; snapshot: CycleSnapshot } {
  const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
  const mergedArgs = normalizeRoutineArgs({ ...caseRecord.args, ...input.args });
  caseRecord.args = mergedArgs;
  const timestamp = new Date().toISOString();
  refreshCaseRecord(caseRecord, timestamp);
  const stored = store.upsertCase(caseRecord);
  emitCycleAudit(caseRecord, "beat_advanced", "args_updated", {
    updatedArgs: input.args,
  });
  return { updated: true, snapshot: buildSnapshot(stored) };
}

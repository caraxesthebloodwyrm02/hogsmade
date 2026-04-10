import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import * as z from "zod/v3";
import { getDefaultAttributeCatalog } from "./catalog.js";
import {
  advanceCycle,
  evaluatePromotionGate,
  getCycleSnapshot,
  listActiveCycles,
  openEvolutionCase,
  recordCycleSignal,
  recordHandoff,
  updateCaseArgs,
  upsertEndpointSpec,
} from "./evolution.js";
import { getFixtureCandidates } from "./examples.js";
import { initializeHooks } from "./hooks.js";
import { checkTheLine, holdTheLine } from "./line-audit.js";
import { explainHierarchy, resolveCandidates, safeEvaluateRoutine } from "./pipeline.js";
import { emitEligibilityAudit } from "./routing.js";
import type {
  CycleSignalKind,
  EligibilityCandidate,
  EligibilityProperty,
  EndpointStatus,
  HandoffStatus,
  RoutineArgs,
} from "./types.js";

const SERVER_NAME = "eligibility-server";
const VERSION = "1.0.0";

const SIGNAL_KIND_VALUES: [CycleSignalKind, ...CycleSignalKind[]] = [
  "endpoint_spec_changed",
  "integration_call_succeeded",
  "integration_call_failed",
  "handoff_submitted",
  "handoff_accepted",
  "handoff_rejected",
  "test_passed",
  "test_failed",
  "condition_escalated",
  "heartbeat_stale",
];

const ENDPOINT_STATUS_VALUES: [EndpointStatus, ...EndpointStatus[]] = [
  "draft",
  "ready",
  "blocked",
  "verified",
];

const HANDOFF_STATUS_VALUES: [HandoffStatus, ...HandoffStatus[]] = [
  "submitted",
  "accepted",
  "rejected",
];

const propertySchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().min(0).max(1),
  note: z.string().optional(),
  source: z.string().optional(),
});

const candidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  properties: z.array(propertySchema),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});

const argsSchema = z.object({
  governance: z.number().min(0.5).max(2).optional(),
  usability: z.number().min(0.5).max(2).optional(),
  integration: z.number().min(0.5).max(2).optional(),
  observability: z.number().min(0.5).max(2).optional(),
  operationalFit: z.number().min(0.5).max(2).optional(),
  seed: z.string().optional(),
  formTarget: z.enum(["server_tool", "rule", "agent", "skill", "reference", "all"]).optional(),
  tableScope: z.enum(["attributes", "dimensions", "all"]).optional(),
});

function toJsonText(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function shapeArgs(args?: Partial<RoutineArgs>): Partial<RoutineArgs> {
  return args ?? {};
}

function shapeCandidate(candidate?: EligibilityCandidate): EligibilityCandidate | undefined {
  if (!candidate) return undefined;
  return {
    ...candidate,
    properties: candidate.properties.map((property: EligibilityProperty) => ({ ...property })),
  };
}

function ensureCandidates(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
}): EligibilityCandidate[] {
  return resolveCandidates({
    candidate: shapeCandidate(input.candidate),
    fixtureId: input.fixtureId,
    fixtureIds: input.fixtureIds,
  });
}

function getEvaluationAuditStatus(validation: {
  ok: boolean;
  candidateCount: number;
}): "success" | "dry_run" | "failure" {
  if (validation.ok) {
    return "success";
  }
  if (validation.candidateCount === 0) {
    return "dry_run";
  }
  return "failure";
}

export function listAttributeCatalogHandler() {
  const attributes = getDefaultAttributeCatalog();
  const fixtures = getFixtureCandidates().map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    summary: candidate.summary,
  }));
  void emitEligibilityAudit("list_attribute_catalog", "success", {
    candidateCount: fixtures.length,
  } as Record<string, unknown>);
  return { attributes, fixtures };
}

export function evaluateCandidateHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const candidates = ensureCandidates(input);
  const evaluation = safeEvaluateRoutine(candidates, shapeArgs(input.args));
  const auditStatus = getEvaluationAuditStatus(evaluation.validation);
  void emitEligibilityAudit("evaluate_candidate", auditStatus, {
    candidateCount: candidates.length,
    reason: auditStatus === "dry_run" ? "no_candidates_provided" : undefined,
  } as Record<string, unknown>);
  return evaluation;
}

export function compileFormsHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const evaluation = evaluateCandidateHandler(input);
  const forms = evaluation.result?.forms ?? [];
  const auditStatus = getEvaluationAuditStatus(evaluation.validation);
  void emitEligibilityAudit("compile_forms", auditStatus, {
    candidateCount: evaluation.validation.candidateCount,
    reason: auditStatus === "dry_run" ? "no_candidates_provided" : undefined,
  } as Record<string, unknown>);
  return { validation: evaluation.validation, forms };
}

export function collectTableHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const evaluation = evaluateCandidateHandler(input);
  const auditStatus = getEvaluationAuditStatus(evaluation.validation);
  void emitEligibilityAudit("collect_table", auditStatus, {
    candidateCount: evaluation.validation.candidateCount,
    reason: auditStatus === "dry_run" ? "no_candidates_provided" : undefined,
  } as Record<string, unknown>);
  return {
    validation: evaluation.validation,
    table: evaluation.result?.table ?? null,
  };
}

export function explainHierarchyHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const evaluation = evaluateCandidateHandler(input);
  const auditStatus = getEvaluationAuditStatus(evaluation.validation);
  void emitEligibilityAudit("explain_hierarchy", auditStatus, {
    candidateCount: evaluation.validation.candidateCount,
    reason: auditStatus === "dry_run" ? "no_candidates_provided" : undefined,
  } as Record<string, unknown>);
  return {
    validation: evaluation.validation,
    explanation: evaluation.result ? explainHierarchy(evaluation.result) : null,
  };
}

export function openEvolutionCaseHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
  caseId?: string;
  label?: string;
  owner?: string;
}) {
  const candidates = ensureCandidates(input);
  const result = openEvolutionCase({
    caseId: input.caseId,
    label: input.label,
    owner: input.owner,
    candidates,
    args: input.args,
  });
  // Emit audit event for the evolution case operation
  void emitEligibilityAudit("open_evolution_case", result.created ? "success" : "dry_run", {
    caseId: input.caseId,
    candidateCount: candidates.length,
    created: result.created,
  } as Record<string, unknown>);
  return result;
}

export function listActiveCyclesHandler() {
  const result = listActiveCycles();
  void emitEligibilityAudit("list_active_cycles", "success", {
    candidateCount: result.cases.length,
  } as Record<string, unknown>);
  return result;
}

export function getCycleSnapshotHandler(input: { caseId: string }) {
  const snapshot = getCycleSnapshot(input.caseId);
  void emitEligibilityAudit("get_cycle_snapshot", "success", {
    caseId: input.caseId,
  } as Record<string, unknown>);
  return { snapshot };
}

export function recordCycleSignalHandler(input: {
  caseId: string;
  type: CycleSignalKind;
  source?: string;
  note?: string;
  weight?: number;
}) {
  const result = recordCycleSignal(input);
  // Emit audit event for the cycle signal operation
  void emitEligibilityAudit("record_cycle_signal", "success", {
    caseId: input.caseId,
    signalType: input.type,
    source: input.source,
    weight: input.weight,
  } as Record<string, unknown>);
  return result;
}

export function recordHandoffHandler(input: {
  caseId: string;
  from: string;
  to: string;
  status: HandoffStatus;
  summary: string;
}) {
  const result = recordHandoff(input);
  // Emit audit event for the handoff operation
  void emitEligibilityAudit("record_handoff", "success", {
    caseId: input.caseId,
    handoffFrom: input.from,
    handoffTo: input.to,
    status: input.status,
  } as Record<string, unknown>);
  return result;
}

export function upsertEndpointSpecHandler(input: {
  caseId: string;
  endpointId: string;
  label: string;
  owner?: string;
  contract?: string;
  status: EndpointStatus;
  required?: boolean;
  readiness?: number;
  notes?: string;
}) {
  const result = upsertEndpointSpec(input);
  // Emit audit event for the endpoint spec operation
  void emitEligibilityAudit("upsert_endpoint_spec", "success", {
    caseId: input.caseId,
    endpointId: input.endpointId,
    label: input.label,
    status: input.status,
  } as Record<string, unknown>);
  return result;
}

export function updateCaseArgsHandler(input: { caseId: string; args: Partial<RoutineArgs> }) {
  const result = updateCaseArgs(input);
  void emitEligibilityAudit("update_case_args", "success", {
    caseId: input.caseId,
    args: input.args,
  } as Record<string, unknown>);
  return result;
}

export function advanceCycleHandler(input: {
  caseId: string;
  direction?: "forward" | "return";
  reason?: string;
}) {
  const result = advanceCycle(input);
  // Emit audit event for the cycle advance operation
  void emitEligibilityAudit("advance_cycle", "success", {
    caseId: input.caseId,
    direction: input.direction ?? "forward",
    reason: input.reason,
    currentBeat: result.caseRecord.currentBeat,
  } as Record<string, unknown>);
  return { snapshot: result };
}

export function evaluatePromotionGateHandler(input: { caseId: string }) {
  const result = evaluatePromotionGate(input.caseId);
  // Emit audit event for the promotion gate evaluation
  void emitEligibilityAudit("evaluate_promotion_gate", "success", {
    caseId: input.caseId,
    gateDecision: result.gate.decision,
    gatePassed: result.gate.passed,
    score: result.gate.metrics.overallScore,
  } as Record<string, unknown>);
  return result;
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic instantiation in strict mode for large tool schemas.
  const tool = server.tool.bind(server) as any;

  tool(
    "list_attribute_catalog",
    "List the default eligibility attributes and built-in fixture candidates.",
    {},
    async () => toJsonText(listAttributeCatalogHandler()),
  );

  tool(
    "evaluate_candidate",
    "Evaluate one or more candidates into weighted hierarchy, notes, forms, and collection rows.",
    {
      candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
      fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
      fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
      args: argsSchema
        .optional()
        .describe("Conditional runtime arguments that bias the analog hierarchy."),
    },
    async (input: any) => toJsonText(evaluateCandidateHandler(input)),
  );

  tool(
    "compile_forms",
    "Compile the runtime result into server, rule, agent, skill, and reference artifacts.",
    {
      candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
      fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
      fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
      args: argsSchema
        .optional()
        .describe("Conditional runtime arguments that bias the analog hierarchy."),
    },
    async (input: any) => toJsonText(compileFormsHandler(input)),
  );

  tool(
    "collect_table",
    "Return row-and-column collection output with provenance credit and formula-ready fields.",
    {
      candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
      fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
      fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
      args: argsSchema
        .optional()
        .describe("Conditional runtime arguments that bias the analog hierarchy."),
    },
    async (input: any) => toJsonText(collectTableHandler(input)),
  );

  tool(
    "explain_hierarchy",
    "Explain the current top hierarchy, leading condition, and leading observation.",
    {
      candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
      fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
      fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
      args: argsSchema
        .optional()
        .describe("Conditional runtime arguments that bias the analog hierarchy."),
    },
    async (input: any) => toJsonText(explainHierarchyHandler(input)),
  );

  tool(
    "open_evolution_case",
    "Open a rolling evolution case that wraps the current eligibility routine.",
    {
      candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
      fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
      fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
      args: argsSchema
        .optional()
        .describe("Conditional runtime arguments that bias the analog hierarchy."),
      caseId: z.string().optional().describe("Optional deterministic case id."),
      label: z.string().optional().describe("Human-readable case label."),
    },
    async (input: any) => toJsonText(openEvolutionCaseHandler(input)),
  );

  tool(
    "list_active_cycles",
    "List active evolution cases with current beat, score, momentum, and drift.",
    {},
    async () => toJsonText(listActiveCyclesHandler()),
  );

  tool(
    "get_cycle_snapshot",
    "Fetch the full control-room snapshot for a single evolution case.",
    {
      caseId: z.string().describe("Case id to look up."),
    },
    async (input: any) => toJsonText(getCycleSnapshotHandler(input)),
  );

  tool(
    "record_cycle_signal",
    "Record a weighted runtime signal against an evolution case.",
    {
      caseId: z.string().describe("Case id to record signal against."),
      type: z.enum(SIGNAL_KIND_VALUES).describe("Signal type (maps to CycleSignalKind)."),
      weight: z.number().min(0).max(1).describe("Signal weight 0-1."),
      source: z.string().optional().describe("Signal source identifier."),
      note: z.string().optional().describe("Optional human note."),
    },
    async (input: any) => toJsonText(recordCycleSignalHandler(input)),
  );

  tool(
    "record_handoff",
    "Record a handoff event between actors or surfaces in the current cycle.",
    {
      caseId: z.string().describe("Case id to record handoff against."),
      from: z.string().describe("Source actor or surface."),
      to: z.string().describe("Target actor or surface."),
      status: z.enum(HANDOFF_STATUS_VALUES).describe("Handoff status."),
      summary: z.string().describe("Summary of the handoff."),
    },
    async (input: any) => toJsonText(recordHandoffHandler(input)),
  );

  tool(
    "upsert_endpoint_spec",
    "Insert or update an endpoint spec used by the promotion gate.",
    {
      caseId: z.string().describe("Case id owning this endpoint."),
      endpointId: z.string().describe("Endpoint identifier."),
      label: z.string().describe("Human-readable endpoint label."),
      owner: z.string().optional().describe("Owner of the endpoint."),
      contract: z.string().optional().describe("Contract reference."),
      status: z.enum(ENDPOINT_STATUS_VALUES).describe("Endpoint status."),
      required: z.boolean().optional().describe("Whether this endpoint is required for promotion."),
      readiness: z.number().min(0).max(1).optional().describe("Readiness score 0-1."),
      notes: z.string().optional().describe("Additional notes."),
    },
    async (input: any) => toJsonText(upsertEndpointSpecHandler(input)),
  );

  tool(
    "update_case_args",
    "Update the stored RoutineArgs for an evolution case, then refresh scores and conditions in memory.",
    {
      caseId: z.string().describe("Case id to update."),
      args: argsSchema.describe("New argument values to merge into the stored case args."),
    },
    async (input: any) => toJsonText(updateCaseArgsHandler(input)),
  );

  tool(
    "advance_cycle",
    "Advance the cycle one beat forward or return it one beat backward.",
    {
      caseId: z.string().describe("Case id to advance."),
      direction: z
        .enum(["forward", "return"])
        .describe("Direction to move: 'forward' or 'return'."),
      reason: z.string().optional().describe("Optional reason for the advance."),
    },
    async (input: any) => toJsonText(advanceCycleHandler(input)),
  );

  tool(
    "evaluate_promotion_gate",
    "Evaluate the promotion gate for a verify-beat cycle.",
    {
      caseId: z.string().describe("Case id to look up."),
    },
    async (input: any) => toJsonText(evaluatePromotionGateHandler(input)),
  );

  tool(
    "check_the_line",
    "Read-only structural audit: detect import mismatches, specifier drift, barrel gaps, mock alignment, audit coverage, and circular imports.",
    {},
    async () => {
      const result = checkTheLine();
      void emitEligibilityAudit("check_the_line", result.errorCount === 0 ? "success" : "failure", {
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        fixableCount: result.fixableCount,
      } as Record<string, unknown>);
      return toJsonText(result);
    },
  );

  tool(
    "hold_the_line",
    "Detect and auto-fix structural mismatches: rewrites bad specifiers, closes barrel gaps, aligns mock paths. Re-scans after fixing.",
    {},
    async () => {
      const result = holdTheLine();
      void emitEligibilityAudit("hold_the_line", result.errorCount === 0 ? "success" : "failure", {
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        fixedCount: result.fixedCount,
      } as Record<string, unknown>);
      return toJsonText(result);
    },
  );

  tool(
    "health_check",
    "Check eligibility-server health, data directory status, and active cycle count.",
    {},
    async () => {
      const cycles = listActiveCycles();
      return toJsonText({
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        dataDir: process.env.ELIGIBILITY_DATA_DIR ?? "~/.eligibility-server",
        activeCycles: cycles.cases.length,
        timestamp: new Date().toISOString(),
      });
    },
  );

  return server;
}

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting`);

  // Initialize trigger routing hooks
  initializeHooks();

  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      console.error(`[${SERVER_NAME}] failed to start`, error);
      process.exit(1);
    }
  }

  void main();
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import * as z from "zod";
import { getDefaultAttributeCatalog } from "./catalog.js";
import {
  advanceCycle,
  evaluatePromotionGate,
  getCycleSnapshot,
  listActiveCycles,
  openEvolutionCase,
  recordCycleSignal,
  recordHandoff,
  upsertEndpointSpec,
} from "./evolution.js";
import { getFixtureCandidates } from "./examples.js";
import {
  explainHierarchy,
  resolveCandidates,
  safeEvaluateRoutine,
} from "./pipeline.js";
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

const candidateInputSchema = {
  candidate: candidateSchema.optional().describe("Inline candidate to evaluate."),
  fixtureId: z.string().optional().describe("Single fixture id to evaluate."),
  fixtureIds: z.array(z.string()).optional().describe("Multiple fixture ids to evaluate."),
  args: argsSchema.optional().describe("Conditional runtime arguments that bias the analog hierarchy."),
};

const openEvolutionCaseSchema = {
  ...candidateInputSchema,
  caseId: z.string().optional().describe("Optional deterministic case id."),
  label: z.string().optional().describe("Human-readable case label."),
  owner: z.string().optional().describe("Optional human owner for the case."),
};

const signalSchema = {
  caseId: z.string().describe("Existing evolution case id."),
  type: z.enum(SIGNAL_KIND_VALUES),
  source: z.string().optional(),
  note: z.string().optional(),
  weight: z.number().min(0).max(1).optional(),
};

const handoffSchema = {
  caseId: z.string().describe("Existing evolution case id."),
  from: z.string(),
  to: z.string(),
  status: z.enum(HANDOFF_STATUS_VALUES),
  summary: z.string(),
};

const endpointSchema = {
  caseId: z.string().describe("Existing evolution case id."),
  endpointId: z.string(),
  label: z.string(),
  owner: z.string().optional(),
  contract: z.string().optional(),
  status: z.enum(ENDPOINT_STATUS_VALUES),
  required: z.boolean().optional(),
  readiness: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
};

const cycleMoveSchema = {
  caseId: z.string().describe("Existing evolution case id."),
  direction: z.enum(["forward", "return"]).optional(),
  reason: z.string().optional(),
};

const caseLookupSchema = {
  caseId: z.string().describe("Existing evolution case id."),
};

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

export function listAttributeCatalogHandler() {
  return {
    attributes: getDefaultAttributeCatalog(),
    fixtures: getFixtureCandidates().map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      summary: candidate.summary,
    })),
  };
}

export function evaluateCandidateHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const candidates = ensureCandidates(input);
  return safeEvaluateRoutine(candidates, shapeArgs(input.args));
}

export function compileFormsHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const evaluation = evaluateCandidateHandler(input);
  return {
    validation: evaluation.validation,
    forms: evaluation.result?.forms ?? [],
  };
}

export function collectTableHandler(input: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
  args?: Partial<RoutineArgs>;
}) {
  const evaluation = evaluateCandidateHandler(input);
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
  return openEvolutionCase({
    caseId: input.caseId,
    label: input.label,
    owner: input.owner,
    candidates,
    args: input.args,
  });
}

export function listActiveCyclesHandler() {
  return listActiveCycles();
}

export function getCycleSnapshotHandler(input: { caseId: string }) {
  return {
    snapshot: getCycleSnapshot(input.caseId),
  };
}

export function recordCycleSignalHandler(input: {
  caseId: string;
  type: CycleSignalKind;
  source?: string;
  note?: string;
  weight?: number;
}) {
  return recordCycleSignal(input);
}

export function recordHandoffHandler(input: {
  caseId: string;
  from: string;
  to: string;
  status: HandoffStatus;
  summary: string;
}) {
  return recordHandoff(input);
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
  return upsertEndpointSpec(input);
}

export function advanceCycleHandler(input: {
  caseId: string;
  direction?: "forward" | "return";
  reason?: string;
}) {
  return {
    snapshot: advanceCycle(input),
  };
}

export function evaluatePromotionGateHandler(input: { caseId: string }) {
  return evaluatePromotionGate(input.caseId);
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  server.tool(
    "list_attribute_catalog",
    "List the default eligibility attributes and built-in fixture candidates.",
    {},
    async () => toJsonText(listAttributeCatalogHandler()),
  );

  server.tool(
    "evaluate_candidate",
    "Evaluate one or more candidates into weighted hierarchy, notes, forms, and collection rows.",
    candidateInputSchema,
    async (input) => toJsonText(evaluateCandidateHandler(input)),
  );

  server.tool(
    "compile_forms",
    "Compile the runtime result into server, rule, agent, skill, and reference artifacts.",
    candidateInputSchema,
    async (input) => toJsonText(compileFormsHandler(input)),
  );

  server.tool(
    "collect_table",
    "Return row-and-column collection output with provenance credit and formula-ready fields.",
    candidateInputSchema,
    async (input) => toJsonText(collectTableHandler(input)),
  );

  server.tool(
    "explain_hierarchy",
    "Explain the current top hierarchy, leading condition, and leading observation.",
    candidateInputSchema,
    async (input) => toJsonText(explainHierarchyHandler(input)),
  );

  server.tool(
    "open_evolution_case",
    "Open a rolling evolution case that wraps the current eligibility routine.",
    openEvolutionCaseSchema,
    async (input) => toJsonText(openEvolutionCaseHandler(input)),
  );

  server.tool(
    "list_active_cycles",
    "List active evolution cases with current beat, score, momentum, and drift.",
    {},
    async () => toJsonText(listActiveCyclesHandler()),
  );

  server.tool(
    "get_cycle_snapshot",
    "Fetch the full control-room snapshot for a single evolution case.",
    caseLookupSchema,
    async (input) => toJsonText(getCycleSnapshotHandler(input)),
  );

  server.tool(
    "record_cycle_signal",
    "Record a weighted runtime signal against an evolution case.",
    signalSchema,
    async (input) => toJsonText(recordCycleSignalHandler(input)),
  );

  server.tool(
    "record_handoff",
    "Record a handoff event between actors or surfaces in the current cycle.",
    handoffSchema,
    async (input) => toJsonText(recordHandoffHandler(input)),
  );

  server.tool(
    "upsert_endpoint_spec",
    "Insert or update an endpoint spec used by the promotion gate.",
    endpointSchema,
    async (input) => toJsonText(upsertEndpointSpecHandler(input)),
  );

  server.tool(
    "advance_cycle",
    "Advance the cycle one beat forward or return it one beat backward.",
    cycleMoveSchema,
    async (input) => toJsonText(advanceCycleHandler(input)),
  );

  server.tool(
    "evaluate_promotion_gate",
    "Evaluate the promotion gate for a verify-beat cycle.",
    caseLookupSchema,
    async (input) => toJsonText(evaluatePromotionGateHandler(input)),
  );

  return server;
}

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}

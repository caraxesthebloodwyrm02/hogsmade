// Immersive eligibility pipeline demo: step-by-step transformation with "routers" (passes)
import {
    EvolutionCycleStore as DemoEvolutionCycleStore,
    advanceCycle,
    evaluatePromotionGate,
    openEvolutionCase,
    recordCycleSignal,
    recordHandoff,
    upsertEndpointSpec,
    type EvolutionCycleStore,
} from "./evolution.js";
import { getFixtureCandidateById } from "./examples.js";
import { evaluateRoutine, latestDeposit, normalizeRoutineArgs } from "./pipeline.js";
import type {
    CycleSnapshot,
    EligibilityCandidate,
    FormArtifact,
    HierarchySlice,
    RoutineArgs,
    RoutineResult,
} from "./types.js";

export interface ExecuteScenario {
    id: string;
    title: string;
    summary: string;
    candidates: EligibilityCandidate[];
    args: Partial<RoutineArgs>;
    cycle: {
        caseId: string;
        label: string;
        owner: string;
        endpoint: {
            endpointId: string;
            label: string;
            owner: string;
            contract: string;
            status: "ready" | "verified";
            readiness: number;
            notes: string;
        };
        signals: Array<{
            type: "integration_call_succeeded" | "test_passed";
            source: string;
            note: string;
        }>;
        handoff: {
            from: string;
            to: string;
            status: "accepted";
            summary: string;
        };
    };
}

export interface SupportBalanceAssist {
    supportScore: number;
    balanceScore: number;
    leadingDimension: string;
    guidance: string;
}

export interface RuntimeHighlight {
    step: string;
    detail: string;
    reference?: string;
}

export interface TopologyNode {
    id: string;
    label: string;
    tier: string;
    highlight: string;
    reference?: string;
}

export interface TopologyEdge {
    from: string;
    to: string;
    reason: string;
}

export interface TopologyArtifact {
    title: string;
    synopsis: string;
    nodes: TopologyNode[];
    edges: TopologyEdge[];
}

export interface ExecuteReport {
    scenario: ExecuteScenario;
    normalizedArgs: RoutineArgs;
    routine: RoutineResult;
    supportBalanceAssist: SupportBalanceAssist;
    runtimeHighlights: RuntimeHighlight[];
    runtimeStory: string;
    topologyArtifact: TopologyArtifact;
    topologyStory: string;
    cycleSnapshots: {
        opened: CycleSnapshot;
        endpointReady: CycleSnapshot;
        signalSnapshots: CycleSnapshot[];
        handoffAccepted: CycleSnapshot;
        beats: CycleSnapshot[];
        promotion: ReturnType<typeof evaluatePromotionGate>;
    };
}

export const DEFAULT_EXECUTE_SCENARIO: ExecuteScenario = {
    id: "immersive-alliance",
    title: "Alliance and common hypotheses",
    summary:
        "Demonstrates how a balanced routine candidate moves from weighted evaluation into a cycle with endpoint readiness, successful signals, accepted handoff, and promotion review.",
    candidates: [getFixtureCandidateById("balanced-bridge")!],
    args: {
        governance: 1.2,
        usability: 1.1,
        integration: 1.25,
        observability: 1.15,
        operationalFit: 1.1,
        formTarget: "all",
        tableScope: "all",
        seed: "immersive-alliance-seed",
    },
    cycle: {
        caseId: "immersive-alliance-cycle",
        label: "Alliance cycle",
        owner: "control-room",
        endpoint: {
            endpointId: "tool-bridge",
            label: "Tool bridge endpoint",
            owner: "ops",
            contract: "POST /tool-bridge",
            status: "verified",
            readiness: 0.94,
            notes: "Verified bridge for runtime-backed example flow.",
        },
        signals: [
            {
                type: "integration_call_succeeded",
                source: "tool-runtime",
                note: "Runtime tool call completed with the expected shaped output.",
            },
            {
                type: "test_passed",
                source: "topology-artifact",
                note: "Topology artifact remained aligned with the same execution state.",
            },
        ],
        handoff: {
            from: "mapper",
            to: "operator",
            status: "accepted",
            summary: "The cycle is ready to move from mapping into tighten and verify beats.",
        },
    },
};

function createDemoStore(): EvolutionCycleStore {
    const suffix = `${process.pid}-${Date.now()}`;
    const filePath = `/tmp/eligibility-demo-${suffix}.json`;
    return new DemoEvolutionCycleStore(filePath);
}

function round(value: number): number {
    return Number(value.toFixed(6));
}

function topOverall(result: RoutineResult): HierarchySlice | undefined {
    return result.hierarchy
        .filter((slice) => slice.dimension === "overall")
        .sort((left, right) => left.rank - right.rank)[0];
}

function formatForms(forms: FormArtifact[]): string {
    return forms.map((form) => `${form.kind}@${form.path}`).join(", ");
}

function buildRuntimeHighlights(report: {
    scenario: ExecuteScenario;
    normalizedArgs: RoutineArgs;
    routine: RoutineResult;
    supportBalanceAssist: SupportBalanceAssist;
    cycleSnapshots: ExecuteReport["cycleSnapshots"];
}): RuntimeHighlight[] {
    const leader = topOverall(report.routine);
    const normalizeDeposit = latestDeposit(report.routine.residue, "normalize-runtime-args");
    const hierarchyDeposit = latestDeposit(report.routine.residue, "project-vertical-hierarchy");

    return [
        {
            step: "Scenario",
            detail: `${report.scenario.title} starts with ${report.scenario.candidates.length} candidate(s) and seed ${report.normalizedArgs.seed}.`,
            reference: report.scenario.id,
        },
        {
            step: "Normalize",
            detail: `Runtime args stabilize into argv ${report.routine.argvSignature}.`,
            reference: String(normalizeDeposit?.["argvSignature"] ?? report.routine.argvSignature),
        },
        {
            step: "Weights",
            detail: `${report.routine.weights.length} analog weights were derived across ${report.routine.catalog.length} attributes.`,
            reference: "derive-analog-weights",
        },
        {
            step: "Hierarchy",
            detail: `${leader?.candidateId ?? "unknown"} leads the hierarchy with score ${leader?.score?.toFixed(3) ?? "0.000"}.`,
            reference: JSON.stringify(hierarchyDeposit?.["topCandidateIds"] ?? []),
        },
        {
            step: "Forms",
            detail: `The routine emitted ${report.routine.forms.length} forms: ${formatForms(report.routine.forms)}.`,
            reference: "compile-reusable-forms",
        },
        {
            step: "Runtime update",
            detail: `Cycle reached ${report.cycleSnapshots.beats[2]?.caseRecord.currentBeat ?? "verify"} and promotion decision is ${report.cycleSnapshots.promotion.gate.decision}.`,
            reference: report.cycleSnapshots.promotion.gate.caseId,
        },
        {
            step: "Support-balance assist",
            detail: `Support ${report.supportBalanceAssist.supportScore.toFixed(3)} | Balance ${report.supportBalanceAssist.balanceScore.toFixed(3)} | Lead ${report.supportBalanceAssist.leadingDimension}.`,
            reference: report.supportBalanceAssist.guidance,
        },
    ];
}

function buildRuntimeStory(highlights: RuntimeHighlight[], result: RoutineResult): string {
    return [
        `[EXECUTE] ${result.summary}`,
        ...highlights.map((highlight, index) => `${index + 1}. ${highlight.step}: ${highlight.detail}`),
    ].join("\n");
}

function buildTopologyArtifact(report: {
    scenario: ExecuteScenario;
    routine: RoutineResult;
    supportBalanceAssist: SupportBalanceAssist;
    cycleSnapshots: ExecuteReport["cycleSnapshots"];
}): TopologyArtifact {
    const leader = topOverall(report.routine);
    const promotion = report.cycleSnapshots.promotion.gate;
    const endpointSnapshot = report.cycleSnapshots.endpointReady.caseRecord;

    return {
        title: `${report.scenario.title} topology`,
        synopsis: "A debugger-style topology artifact showing how one execution source fans out into routine and cycle surfaces.",
        nodes: [
            {
                id: "scenario",
                label: report.scenario.title,
                tier: "ingress",
                highlight: report.scenario.summary,
                reference: report.scenario.id,
            },
            {
                id: "normalize",
                label: "normalize-runtime-args",
                tier: "runtime",
                highlight: report.routine.argvSignature,
                reference: report.routine.seed,
            },
            {
                id: "hierarchy",
                label: "project-vertical-hierarchy",
                tier: "runtime",
                highlight: `${leader?.candidateId ?? "unknown"} rank ${leader?.rank ?? 0} @ ${leader?.score?.toFixed(3) ?? "0.000"}`,
                reference: "project-vertical-hierarchy",
            },
            {
                id: "forms",
                label: "compile-reusable-forms",
                tier: "artifact",
                highlight: `${report.routine.forms.length} forms and ${report.routine.table.rows.length} rows`,
                reference: "emit-collection-table",
            },
            {
                id: "endpoint",
                label: report.scenario.cycle.endpoint.label,
                tier: "cycle",
                highlight: `Endpoint readiness ${endpointSnapshot.momentum.endpointReadiness.toFixed(3)}`,
                reference: report.scenario.cycle.endpoint.endpointId,
            },
            {
                id: "promotion",
                label: "promotion-gate",
                tier: "gate",
                highlight: `${promotion.decision} with drift ${promotion.metrics.sidewalkDrift.toFixed(3)}`,
                reference: promotion.caseId,
            },
            {
                id: "support-balance-assist",
                label: "support-balance-assist",
                tier: "assist",
                highlight: `Support ${report.supportBalanceAssist.supportScore.toFixed(3)} | Balance ${report.supportBalanceAssist.balanceScore.toFixed(3)}`,
                reference: report.supportBalanceAssist.guidance,
            },
        ],
        edges: [
            { from: "scenario", to: "normalize", reason: "Scenario args determine the runtime signature." },
            { from: "normalize", to: "hierarchy", reason: "Normalized biases shape weight derivation and ranking." },
            { from: "hierarchy", to: "forms", reason: "Hierarchy drives form compilation and collection rows." },
            { from: "forms", to: "endpoint", reason: "Runtime artifacts inform the endpoint readiness update." },
            { from: "endpoint", to: "promotion", reason: "Endpoint readiness and signals flow into the promotion gate." },
            { from: "promotion", to: "support-balance-assist", reason: "Assist summarizes support readiness and cross-dimension balance after gate evaluation." },
        ],
    };
}

function buildSupportBalanceAssist(routine: RoutineResult, cycle: ExecuteReport["cycleSnapshots"]): SupportBalanceAssist {
    const leader = topOverall(routine);
    const leaderId = leader?.candidateId;
    const readSlice = (dimension: HierarchySlice["dimension"]): number =>
        routine.hierarchy.find((slice) => slice.candidateId === leaderId && slice.dimension === dimension)?.score ?? 0;

    const governance = readSlice("governance");
    const usability = readSlice("usability");
    const integration = readSlice("integration");
    const observability = readSlice("observability");
    const momentum = cycle.promotion.snapshot.caseRecord.momentum;
    const supportScore = round(
        (momentum.endpointReadiness + momentum.handoffCompletion + momentum.integrationSuccessRate) / 3,
    );
    const average = round((governance + usability + integration + observability) / 4);
    const spread = Math.max(governance, usability, integration, observability) - Math.min(governance, usability, integration, observability);
    const balanceScore = round(Math.max(0, Math.min(1, average - spread * 0.35)));

    const dimensions = [
        { id: "governance", score: governance },
        { id: "usability", score: usability },
        { id: "integration", score: integration },
        { id: "observability", score: observability },
    ].sort((left, right) => right.score - left.score);
    const leadingDimension = dimensions[0]?.id ?? "overall";

    const guidance =
        balanceScore >= 0.65
            ? "Balance is stable; keep support channels green while scaling the same topology."
            : "Balance is uneven; reinforce weaker dimensions before broadening the runtime surface.";

    return {
        supportScore,
        balanceScore,
        leadingDimension,
        guidance,
    };
}

function buildTopologyStory(artifact: TopologyArtifact): string {
    return [
        `[TOPOLOGY] ${artifact.title}`,
        artifact.synopsis,
        ...artifact.nodes.map((node) => `- ${node.tier.toUpperCase()} :: ${node.label} -> ${node.highlight}`),
        ...artifact.edges.map((edge) => `  ${edge.from} -> ${edge.to}: ${edge.reason}`),
    ].join("\n");
}

export class EligibilityRouter {
    async execute(
        scenario: ExecuteScenario = DEFAULT_EXECUTE_SCENARIO,
        store: EvolutionCycleStore = createDemoStore(),
    ): Promise<ExecuteReport> {
        const normalizedArgs = normalizeRoutineArgs(scenario.args);
        const result = evaluateRoutine(scenario.candidates, normalizedArgs);

        const opened = openEvolutionCase(
            {
                caseId: scenario.cycle.caseId,
                label: scenario.cycle.label,
                owner: scenario.cycle.owner,
                candidates: scenario.candidates,
                args: normalizedArgs,
            },
            store,
        );

        if (!opened.snapshot) {
            throw new Error("Demo scenario failed to open an evolution case.");
        }

        const endpointReady = upsertEndpointSpec(
            {
                caseId: scenario.cycle.caseId,
                endpointId: scenario.cycle.endpoint.endpointId,
                label: scenario.cycle.endpoint.label,
                owner: scenario.cycle.endpoint.owner,
                contract: scenario.cycle.endpoint.contract,
                status: scenario.cycle.endpoint.status,
                required: true,
                readiness: scenario.cycle.endpoint.readiness,
                notes: scenario.cycle.endpoint.notes,
            },
            store,
        ).snapshot;

        const signalSnapshots = scenario.cycle.signals.map((signal) =>
            recordCycleSignal(
                {
                    caseId: scenario.cycle.caseId,
                    type: signal.type,
                    source: signal.source,
                    note: signal.note,
                },
                store,
            ).snapshot,
        );

        const handoffAccepted = recordHandoff(
            {
                caseId: scenario.cycle.caseId,
                from: scenario.cycle.handoff.from,
                to: scenario.cycle.handoff.to,
                status: scenario.cycle.handoff.status,
                summary: scenario.cycle.handoff.summary,
            },
            store,
        ).snapshot;

        const beats = [
            advanceCycle({ caseId: scenario.cycle.caseId }, store),
            advanceCycle({ caseId: scenario.cycle.caseId }, store),
            advanceCycle({ caseId: scenario.cycle.caseId }, store),
        ];

        const promotion = evaluatePromotionGate(scenario.cycle.caseId, store);
        const cycleSnapshots = {
            opened: opened.snapshot,
            endpointReady,
            signalSnapshots,
            handoffAccepted,
            beats,
            promotion,
        };

        const supportBalanceAssist = buildSupportBalanceAssist(result, cycleSnapshots);
        const runtimeHighlights = buildRuntimeHighlights({
            scenario,
            normalizedArgs,
            routine: result,
            supportBalanceAssist,
            cycleSnapshots,
        });
        const topologyArtifact = buildTopologyArtifact({
            scenario,
            routine: result,
            supportBalanceAssist,
            cycleSnapshots,
        });

        return {
            scenario,
            normalizedArgs,
            routine: result,
            supportBalanceAssist,
            runtimeHighlights,
            runtimeStory: buildRuntimeStory(runtimeHighlights, result),
            topologyArtifact,
            topologyStory: buildTopologyStory(topologyArtifact),
            cycleSnapshots,
        };
    }

    async evaluate(candidates: EligibilityCandidate[], args: Partial<RoutineArgs>) {
        const report = await this.execute({
            ...DEFAULT_EXECUTE_SCENARIO,
            id: "compat-evaluate",
            title: "Compatibility evaluate flow",
            summary: "Compatibility wrapper around the execute() demo flow.",
            candidates,
            args,
            cycle: {
                ...DEFAULT_EXECUTE_SCENARIO.cycle,
                caseId: "compat-evaluate-cycle",
                label: "Compatibility evaluate cycle",
            },
        });
        console.log(report.runtimeStory);
        console.log("\n" + report.topologyStory + "\n");
        return report;
    }
}

async function main() {
    const router = new EligibilityRouter();
    const report = await router.execute();
    console.log(report.runtimeStory);
    console.log("\n" + report.topologyStory + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}

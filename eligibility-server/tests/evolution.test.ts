import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: () => Promise.resolve(true),
}));

import {
  EvolutionCycleStore,
  advanceCycle,
  evaluatePromotionGate,
  getCycleSnapshot,
  getFixtureCandidateById,
  listActiveCycles,
  openEvolutionCase,
  recordCycleSignal,
  recordHandoff,
  upsertEndpointSpec,
} from "../src/index.js";

function createStore() {
  return new EvolutionCycleStore(path.join(mkdtempSync(path.join(tmpdir(), "eligibility-cycle-")), "cases.json"));
}

function openBalancedCase(store: EvolutionCycleStore, caseId = "balanced-case") {
  return openEvolutionCase({
    caseId,
    label: "Balanced case",
    candidates: [getFixtureCandidateById("balanced-bridge")!],
    args: {
      seed: "cycle-seed",
      governance: 1.2,
      usability: 1.1,
      integration: 1.2,
      observability: 1,
      operationalFit: 1,
      formTarget: "all",
      tableScope: "all",
    },
  }, store);
}

describe("evolution cycle", () => {
  it("opens with a deterministic initial snapshot and lists as active", async () => {
    const store = createStore();
    const opened = await openBalancedCase(store, "deterministic-cycle");

    expect(opened.validation.ok).toBe(true);
    expect(opened.created).toBe(true);
    expect(opened.snapshot?.caseRecord.currentBeat).toBe("map");
    expect(opened.snapshot?.caseRecord.snapshotHistory).toHaveLength(1);

    const listed = listActiveCycles(store);
    expect(listed.cases).toHaveLength(1);
    expect(listed.cases[0]?.caseId).toBe("deterministic-cycle");
    expect(listed.cases[0]?.status).toBe("active");
  });

  it("reproduces identical momentum and gate outcomes for the same event sequence", async () => {
    const executeSequence = async () => {
      const store = createStore();
      await openBalancedCase(store, "sequence-cycle");
      upsertEndpointSpec({
        caseId: "sequence-cycle",
        endpointId: "gateway",
        label: "Gateway endpoint",
        owner: "ops",
        contract: "POST /gateway",
        status: "ready",
        required: true,
        readiness: 0.85,
      }, store);
      await recordCycleSignal({ caseId: "sequence-cycle", type: "integration_call_succeeded" }, store);
      await recordCycleSignal({ caseId: "sequence-cycle", type: "test_passed" }, store);
      recordHandoff({
        caseId: "sequence-cycle",
        from: "mapper",
        to: "operator",
        status: "accepted",
        summary: "Ready for tighten.",
      }, store);
      advanceCycle({ caseId: "sequence-cycle" }, store);
      advanceCycle({ caseId: "sequence-cycle" }, store);
      advanceCycle({ caseId: "sequence-cycle" }, store);
      return await evaluatePromotionGate("sequence-cycle", store);
    };

    const first = await executeSequence();
    const second = await executeSequence();

    expect(first.gate).toEqual(second.gate);
    expect(first.snapshot.caseRecord.momentum).toEqual(second.snapshot.caseRecord.momentum);
    expect(first.snapshot.caseRecord.snapshotHistory).toEqual(second.snapshot.caseRecord.snapshotHistory);
  });

  it("advances through beats in order and returns one beat at a time", () => {
    const store = createStore();
    openBalancedCase(store, "beat-cycle");

    const balance = advanceCycle({ caseId: "beat-cycle" }, store);
    expect(balance.caseRecord.currentBeat).toBe("balance");

    const tighten = advanceCycle({ caseId: "beat-cycle" }, store);
    expect(tighten.caseRecord.currentBeat).toBe("tighten");

    const verify = advanceCycle({ caseId: "beat-cycle" }, store);
    expect(verify.caseRecord.currentBeat).toBe("verify");
    expect(verify.caseRecord.status).toBe("promotion_pending");

    const returned = advanceCycle({ caseId: "beat-cycle", direction: "return", reason: "Need more shaping" }, store);
    expect(returned.caseRecord.currentBeat).toBe("tighten");
    expect(returned.caseRecord.status).toBe("returned");
    expect(returned.caseRecord.returnHistory).toHaveLength(1);
  });

  it("blocks promotion before verify and when required endpoint fields are missing", async () => {
    const store = createStore();
    await openBalancedCase(store, "gate-cycle");

    const earlyGate = await evaluatePromotionGate("gate-cycle", store);
    expect(earlyGate.gate.decision).toBe("deny_promotion");

    advanceCycle({ caseId: "gate-cycle" }, store);
    advanceCycle({ caseId: "gate-cycle" }, store);
    advanceCycle({ caseId: "gate-cycle" }, store);

    upsertEndpointSpec({
      caseId: "gate-cycle",
      endpointId: "spec-a",
      label: "Spec A",
      status: "draft",
      required: true,
      readiness: 0.5,
    }, store);

    const blocked = await evaluatePromotionGate("gate-cycle", store);
    expect(blocked.gate.passed).toBe(false);
    expect(["hold_for_tighten", "return_to_balance", "deny_promotion"]).toContain(blocked.gate.decision);
  });

  it("accumulates repeated calls, signals, and handoffs into one rolling case", async () => {
    const store = createStore();
    await openBalancedCase(store, "rolling-cycle");

    await recordCycleSignal({ caseId: "rolling-cycle", type: "integration_call_succeeded" }, store);
    await recordCycleSignal({ caseId: "rolling-cycle", type: "integration_call_failed" }, store);
    await recordCycleSignal({ caseId: "rolling-cycle", type: "heartbeat_stale" }, store);
    recordHandoff({
      caseId: "rolling-cycle",
      from: "retriever",
      to: "synthesizer",
      status: "submitted",
      summary: "Initial handoff",
    }, store);
    recordHandoff({
      caseId: "rolling-cycle",
      from: "retriever",
      to: "synthesizer",
      status: "accepted",
      summary: "Accepted handoff",
    }, store);

    const snapshot = getCycleSnapshot("rolling-cycle", store);
    expect(snapshot.caseRecord.signals).toHaveLength(3);
    expect(snapshot.caseRecord.handoffs).toHaveLength(2);
    expect(snapshot.caseRecord.snapshotHistory.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.caseRecord.momentum.sidewalkDrift).toBeGreaterThan(0);
  });
});

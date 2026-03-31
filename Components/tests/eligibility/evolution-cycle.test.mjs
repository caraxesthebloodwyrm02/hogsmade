import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EvolutionCycleStore,
  advanceCycle,
  evaluatePromotionGate,
  getFixtureCandidateById,
  listActiveCycles,
  openEvolutionCase,
  recordCycleSignal,
  upsertEndpointSpec,
} from "../../eligibility-server/dist/index.js";

function createStore() {
  return new EvolutionCycleStore(path.join(mkdtempSync(path.join(tmpdir(), "eligibility-root-cycle-")), "cases.json"));
}

test("built package opens and lists an active evolution cycle", () => {
  const store = createStore();
  const opened = openEvolutionCase({
    caseId: "root-cycle",
    label: "Root cycle",
    candidates: [getFixtureCandidateById("balanced-bridge")],
    args: {
      governance: 1.2,
      usability: 1.1,
      integration: 1.2,
      observability: 1,
      operationalFit: 1,
      seed: "root-seed",
      formTarget: "all",
      tableScope: "all",
    },
  }, store);

  assert.equal(opened.validation.ok, true);
  assert.equal(opened.snapshot.caseRecord.currentBeat, "map");

  const listed = listActiveCycles(store);
  assert.equal(listed.cases.length, 1);
  assert.equal(listed.cases[0].caseId, "root-cycle");
});

test("built package evaluates a promotion gate after endpoint and signal accumulation", () => {
  const store = createStore();
  openEvolutionCase({
    caseId: "promotion-root-cycle",
    label: "Promotion root cycle",
    candidates: [getFixtureCandidateById("balanced-bridge")],
    args: {
      governance: 1.3,
      usability: 1.1,
      integration: 1.3,
      observability: 1,
      operationalFit: 1,
      seed: "promotion-root-seed",
      formTarget: "all",
      tableScope: "all",
    },
  }, store);

  upsertEndpointSpec({
    caseId: "promotion-root-cycle",
    endpointId: "edge-gateway",
    label: "Edge gateway",
    owner: "ops",
    contract: "POST /edge",
    status: "verified",
    required: true,
    readiness: 1,
  }, store);
  recordCycleSignal({ caseId: "promotion-root-cycle", type: "integration_call_succeeded" }, store);
  recordCycleSignal({ caseId: "promotion-root-cycle", type: "test_passed" }, store);
  advanceCycle({ caseId: "promotion-root-cycle" }, store);
  advanceCycle({ caseId: "promotion-root-cycle" }, store);
  advanceCycle({ caseId: "promotion-root-cycle" }, store);

  const evaluated = evaluatePromotionGate("promotion-root-cycle", store);
  assert.ok([
    "allow_promotion",
    "hold_for_tighten",
    "return_to_balance",
  ].includes(evaluated.gate.decision));
  assert.equal(typeof evaluated.snapshot.caseRecord.momentum.momentum, "number");
  assert.equal(evaluated.snapshot.caseRecord.promotionHistory.length > 0, true);
});

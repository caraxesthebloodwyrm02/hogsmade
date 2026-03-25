import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRoutine,
  getFixtureCandidateById,
} from "../../eligibility-server/dist/index.js";

test("compiled forms point back to the same candidate result ids", () => {
  const result = evaluateRoutine(
    [getFixtureCandidateById("balanced-bridge")],
    {
      governance: 1,
      usability: 1,
      integration: 1,
      observability: 1,
      operationalFit: 1,
      seed: "forms-seed",
      formTarget: "all",
      tableScope: "all",
    },
  );

  assert.equal(result.forms.length, 5);
  const expectedCandidateIds = ["balanced-bridge"];

  for (const artifact of result.forms) {
    assert.deepEqual(artifact.candidateIds, expectedCandidateIds);
    assert.ok(artifact.credit.sourceIds.includes("balanced-bridge"));
    assert.ok(artifact.content.includes("forms-seed"));
  }
});

test("rule, agent, and skill artifacts remain projections while server and reference stay runtime-backed", () => {
  const result = evaluateRoutine(
    [getFixtureCandidateById("balanced-bridge")],
    {
      governance: 1,
      usability: 1,
      integration: 1,
      observability: 1,
      operationalFit: 1,
      seed: "runtime-backed-seed",
      formTarget: "all",
      tableScope: "all",
    },
  );

  const byKind = Object.fromEntries(result.forms.map((artifact) => [artifact.kind, artifact]));
  assert.equal(byKind.server_tool.runtimeBacked, true);
  assert.equal(byKind.reference.runtimeBacked, true);
  assert.equal(byKind.rule.runtimeBacked, false);
  assert.equal(byKind.agent.runtimeBacked, false);
  assert.equal(byKind.skill.runtimeBacked, false);
});

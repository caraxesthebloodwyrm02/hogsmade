import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRoutine, getFixtureCandidateById } from "../../eligibility-server/dist/index.js";

test("collection table retains provenance credit and formula-ready columns", () => {
  const result = evaluateRoutine(
    [getFixtureCandidateById("balanced-bridge"), getFixtureCandidateById("governance-lattice")],
    {
      governance: 1.2,
      usability: 1,
      integration: 1.1,
      observability: 1.3,
      operationalFit: 1.1,
      seed: "collection-seed",
      formTarget: "all",
      tableScope: "all",
    },
  );

  assert.ok(result.table.columns.includes("creditLabel"));
  assert.ok(result.table.columns.includes("sourcePass"));
  assert.ok(result.table.columns.includes("argvSignature"));
  assert.ok(result.table.rows.length > 0);

  for (const row of result.table.rows) {
    assert.ok(row.creditLabel.length > 0);
    assert.ok(row.sourcePass.length > 0);
    assert.equal(row.seed, "collection-seed");
    assert.equal(row.argvSignature, result.argvSignature);
  }
});

test("same seed and args reproduce identical collection rows", () => {
  const args = {
    governance: 1.05,
    usability: 1.1,
    integration: 1.2,
    observability: 1,
    operationalFit: 1,
    seed: "repeatable-collection",
    formTarget: "all",
    tableScope: "all",
  };

  const candidates = [
    getFixtureCandidateById("balanced-bridge"),
    getFixtureCandidateById("usability-orbit"),
  ];

  const first = evaluateRoutine(candidates, args);
  const second = evaluateRoutine(candidates, args);

  assert.deepEqual(first.table.rows, second.table.rows);
});

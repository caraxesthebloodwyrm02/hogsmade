import assert from "node:assert/strict";
import test from "node:test";

import { validatePipelineCeremony } from "../core/ceremony-validator.js";

test("allows pipeline from phase 1 with data and master", () => {
  const r = validatePipelineCeremony({ phase: 1, hasRawData: true, hasMaster: true });
  assert.equal(r.valid, true);
});

test("allows re-run from phase 4", () => {
  const r = validatePipelineCeremony({ phase: 4, hasRawData: true, hasMaster: true });
  assert.equal(r.valid, true);
});

test("rejects phase 0", () => {
  const r = validatePipelineCeremony({ phase: 0, hasRawData: true, hasMaster: true });
  assert.equal(r.valid, false);
});

test("rejects phase 2 busy", () => {
  const r = validatePipelineCeremony({ phase: 2, hasRawData: true, hasMaster: true });
  assert.equal(r.valid, false);
  assert.equal(r.reason, "pipeline_busy");
});

test("rejects missing master", () => {
  const r = validatePipelineCeremony({ phase: 1, hasRawData: true, hasMaster: false });
  assert.equal(r.valid, false);
});

test("rejects missing raw data", () => {
  const r = validatePipelineCeremony({ phase: 1, hasRawData: false, hasMaster: true });
  assert.equal(r.valid, false);
});

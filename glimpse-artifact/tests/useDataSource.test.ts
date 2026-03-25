import test from "node:test";
import assert from "node:assert/strict";

import { resolveDataSourceFailure } from "../src/hooks/useDataSource.ts";

test("resolveDataSourceFailure falls back to mock data when provided", () => {
  const fallback = resolveDataSourceFailure(new Error("offline"), [1, 2, 3]);

  assert.equal(fallback.usedMockFallback, true);
  assert.equal(fallback.error, null);
  assert.deepEqual(fallback.data, [1, 2, 3]);
});

test("resolveDataSourceFailure preserves the error when no mock is available", () => {
  const failure = resolveDataSourceFailure(new Error("offline"));

  assert.equal(failure.usedMockFallback, false);
  assert.equal(failure.error, "offline");
  assert.equal(failure.data, undefined);
});

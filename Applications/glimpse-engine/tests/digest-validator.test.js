import assert from "node:assert/strict";
import test from "node:test";

import {
  digestAgeStale,
  sha256HexUniversal,
  validateDigestPrefix,
} from "../core/digest-validator.js";

const FULL = "abababababababababababababababababababababababababababababababab";

test("validateDigestPrefix accepts matching prefix", () => {
  const r = validateDigestPrefix(FULL, FULL.slice(0, 12));
  assert.equal(r.valid, true);
});

test("validateDigestPrefix rejects wrong prefix", () => {
  const r = validateDigestPrefix(FULL, "ffffffff");
  assert.equal(r.valid, false);
  assert.equal(r.reason, "digest_mismatch");
});

test("validateDigestPrefix rejects missing", () => {
  const r = validateDigestPrefix(FULL, null);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing_digest");
});

test("validateDigestPrefix rejects short session hash", () => {
  const shortFull = "ab".repeat(31); // 62 hex chars — session not considered bound
  const r = validateDigestPrefix(shortFull, "abcdabcd");
  assert.equal(r.valid, false);
  assert.equal(r.reason, "session_not_bound");
});

test("sha256HexUniversal is deterministic in Node", async () => {
  const a = await sha256HexUniversal("glimpse");
  const b = await sha256HexUniversal("glimpse");
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test("digestAgeStale detects old timestamps", () => {
  const old = Date.now() - 7200_000;
  assert.equal(digestAgeStale(old, 3600_000), true);
  assert.equal(digestAgeStale(Date.now(), 3600_000), false);
});

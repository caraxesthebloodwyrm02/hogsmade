import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPathwayEntry,
  PATHWAY_ENGINE_VERSION,
  PATHWAY_REDACT_DEFAULT,
  PATHWAY_SCHEMA_VERSION,
} from "../pathway-logger.js";

test("PATHWAY_REDACT_DEFAULT is true", () => {
  assert.equal(PATHWAY_REDACT_DEFAULT, true);
});

test("buildPathwayEntry redacts filename by default", async () => {
  const fakeCtx = {
    profile: { descriptors: [], flags: {}, recordCount: 1 },
    contextLenses: [],
    primaryLens: null,
    viewPreferences: {},
    ruleTraces: [],
    records: [],
    entities: [],
    relations: [],
  };
  const entry = await buildPathwayEntry(fakeCtx, "/home/user/secret-project/data.json");
  assert.ok(entry);
  assert.equal(entry.telemetry_redacted, true);
  assert.ok(entry.file.startsWith("sha256:"));
  assert.ok(!entry.file.includes("secret-project"));
});

test("buildPathwayEntry includes schema and engine version", async () => {
  const fakeCtx = {
    profile: { descriptors: [], flags: {}, recordCount: 1 },
    contextLenses: [],
    primaryLens: null,
    viewPreferences: {},
    ruleTraces: [],
    records: [],
    entities: [],
    relations: [],
  };
  const entry = await buildPathwayEntry(fakeCtx, "x.json", { redact: false });
  assert.equal(entry.schemaVersion, PATHWAY_SCHEMA_VERSION);
  assert.equal(entry.glimpseVersion, PATHWAY_ENGINE_VERSION);
});

test("buildPathwayEntry adds digest_prefix when session digest bound", async () => {
  const fakeCtx = {
    profile: { descriptors: [], flags: {}, recordCount: 1 },
    contextLenses: [],
    primaryLens: null,
    viewPreferences: {},
    ruleTraces: [],
    records: [],
    entities: [],
    relations: [],
  };
  const full = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const entry = await buildPathwayEntry(fakeCtx, "x.json", {
    redact: false,
    sessionDigestHex: full,
  });
  assert.equal(entry.digest_prefix, "abcdef012345");
});

test("buildPathwayEntry omits digest_prefix when no session digest", async () => {
  const fakeCtx = {
    profile: { descriptors: [], flags: {}, recordCount: 1 },
    contextLenses: [],
    primaryLens: null,
    viewPreferences: {},
    ruleTraces: [],
    records: [],
    entities: [],
    relations: [],
  };
  const entry = await buildPathwayEntry(fakeCtx, "x.json", { redact: false });
  assert.equal(Object.hasOwn(entry, "digest_prefix"), false);
});

test("buildPathwayEntry preserves filename when redact false", async () => {
  const fakeCtx = {
    profile: { descriptors: [], flags: {}, recordCount: 1 },
    contextLenses: [],
    primaryLens: null,
    viewPreferences: {},
    ruleTraces: [],
    records: [],
    entities: [],
    relations: [],
  };
  const entry = await buildPathwayEntry(fakeCtx, "my-file.json", { redact: false });
  assert.ok(entry);
  assert.equal(entry.telemetry_redacted, false);
  assert.equal(entry.file, "my-file.json");
});

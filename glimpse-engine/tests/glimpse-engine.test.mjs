import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseMasterConfig } from "../glimpse-engine/master-config.js";
import { DEFAULT_MASTER_YAML } from "../glimpse-engine/default-master.js";
import { runContextPipeline, compileRuleFromConversation, parseQueryIntent, validateConfigWithRegistry } from "../glimpse-engine/core/engine.js";
import { rankViews } from "../glimpse-engine/view-specs.js";

const config = parseMasterConfig(DEFAULT_MASTER_YAML);
const execFileAsync = promisify(execFile);

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("historical innovation dataset yields a primary lens with supporting secondary lenses", async () => {
  const data = await loadJson("/mnt/c/Users/USER/CascadeProjects/sample-innovations.json");
  const ctx = runContextPipeline(data, "json", config, { presetId: "researcher" });

  assert.ok(ctx);
  assert.equal(ctx.primaryLens.id, "innovation");
  assert.ok(ctx.secondaryLenses.length >= 1);
  assert.ok(ctx.evidences.length > 0);
});

test("narrative dataset uses the same pipeline and surfaces narrative plus geography", async () => {
  const data = await loadJson("/mnt/c/Users/USER/CascadeProjects/sample-scenario.json");
  const ctx = runContextPipeline(data, "json", config, { presetId: "storyteller" });

  assert.ok(ctx);
  assert.equal(ctx.primaryLens.id, "narrative");
  assert.ok(ctx.secondaryLenses.length >= 1);
  assert.ok(ctx.profile.flags.has_space_dimension);
});

test("mixed ambiguous data remains stable across repeated runs", () => {
  const data = [
    { title: "Port Signal", region: "Bay", year: 1890, mood: "uneasy", score: 8 },
    { title: "Cable Exchange", region: "Bay", year: 1891, mood: "determined", score: 7 },
  ];

  const first = runContextPipeline(data, "json", config, { presetId: "analyst" });
  const second = runContextPipeline(data, "json", config, { presetId: "analyst" });

  assert.deepEqual(first.contextLenses.map((lens) => lens.id), second.contextLenses.map((lens) => lens.id));
  assert.deepEqual(rankViews(first, config, "analyst"), rankViews(second, config, "analyst"));
});

test("conversational rule creation compiles into a valid map-support rule", () => {
  const result = compileRuleFromConversation(
    "When records share the same country, favor the map view and treat geography as a supporting context.",
    config
  );

  assert.ok(result);
  assert.equal(result.ambiguous, false);
  assert.ok(result.rule.derive.some((action) => action.action === "boost_lens" && action.lens === "geography"));
  assert.ok(result.rule.derive.some((action) => action.action === "prefer_view" && action.view === "map"));
});

test("semantic query aliases map region-style language to spatial clustering", () => {
  const intent = parseQueryIntent("cluster by region", config);
  assert.equal(intent.kind, "cluster_by");
  assert.equal(intent.dimension, "space");
});

test("disabling a rule removes its effect without breaking the rest of the pipeline", async () => {
  const data = await loadJson("/mnt/c/Users/USER/CascadeProjects/sample-scenario.json");
  const withoutGeoRule = parseMasterConfig(DEFAULT_MASTER_YAML);
  withoutGeoRule.rules = withoutGeoRule.rules.map((rule) =>
    ["geography-support", "geography-semantic-support"].includes(rule.id) ? { ...rule, enabled: false } : rule
  );

  const ctx = runContextPipeline(data, "json", withoutGeoRule, { presetId: "storyteller" });

  assert.ok(ctx);
  assert.equal(ctx.primaryLens.id, "narrative");
  assert.equal(ctx.contextLenses.some((lens) => lens.id === "geography"), false);
});

test("function-backed rules fire and leave trace output", async () => {
  const data = await loadJson("/mnt/c/Users/USER/CascadeProjects/sample-innovations.json");
  const ctx = runContextPipeline(data, "json", config, { presetId: "researcher" });

  const trace = ctx.ruleTraces.find((item) => item.ruleId === "innovation-keyword-support" && item.status === "fired");
  assert.ok(trace);
  assert.equal(trace.mode, "function");
  assert.equal(trace.functionName, "taxonomy_score");
});

test("invalid function names fail closed and appear in diagnostics", () => {
  const broken = parseMasterConfig(DEFAULT_MASTER_YAML);
  broken.rules = [
    ...broken.rules,
    {
      id: "broken-function",
      label: "Broken function",
      applies_to: "dataset",
      enabled: true,
      priority: 110,
      function: "does_not_exist",
      args: {},
      returns: "boolean",
      weight_strategy: "boolean_boost",
      derive: [{ action: "boost_lens", lens: "analytics", score: 1 }],
      affects: ["context_lens"],
      because: "Intentional test failure",
      promotion: "experimental",
    },
  ];

  const ctx = runContextPipeline([{ token: "alpha" }], "json", broken, { presetId: "analyst" });
  assert.ok(ctx.validationReport.missingFunctions.includes("does_not_exist"));
  assert.ok(ctx.evidences.some((evidence) => evidence.payload?.diagnostic));
});

test("invalid argument shapes fail closed and do not mutate scoring", () => {
  const broken = parseMasterConfig(DEFAULT_MASTER_YAML);
  broken.rules = broken.rules.map((rule) =>
    rule.id === "innovation-keyword-support"
      ? { ...rule, args: { ...rule.args, min_score: "bad-value" } }
      : rule
  );

  const report = validateConfigWithRegistry(broken);
  assert.ok(report.invalidArgs.some((entry) => entry.includes("innovation-keyword-support")));

  const ctx = runContextPipeline([{ name: "Signal", description: "telegraph network" }], "json", broken, { presetId: "analyst" });
  assert.ok(ctx.validationReport.invalidArgs.some((entry) => entry.includes("taxonomy_score.min_score")));
  assert.equal(ctx.contextLenses.some((lens) => lens.id === "innovation"), false);
});

test("no-match datasets fall back safely to a general lens and explorer-friendly views", () => {
  const data = [{ token: "alpha" }, { token: "beta" }];
  const ctx = runContextPipeline(data, "json", config, { presetId: "analyst" });
  const views = rankViews(ctx, config, "analyst");

  assert.equal(ctx.primaryLens.id, "general");
  assert.ok(views.some((view) => view.id === "explorer"));
  assert.notEqual(views[0]?.id, "timeline");
});

test("signal_signature detects acoustic field names after d.name fix", () => {
  const data = [
    { frequency: 440, amplitude: 0.8, phase: 90, delay: 12, label: "tone A" },
    { frequency: 880, amplitude: 0.6, phase: 180, delay: 24, label: "tone B" },
  ];
  const ctx = runContextPipeline(data, "json", config, { presetId: "signature" });
  const trace = ctx.ruleTraces.find(t => t.ruleId === "signal-signature-detection");
  assert.ok(trace, "signal-signature-detection should have a trace");
  assert.equal(trace.status, "fired", "should fire when acoustic fields present");
  assert.ok(trace.output.value >= 2, "should match at least 2 signal fields");
});

test("growth_pattern detects branching field names after d.name fix", () => {
  const data = [
    { parent: "root", child: "leaf-1", depth: 0, label: "node A" },
    { parent: "root", child: "leaf-2", depth: 1, label: "node B" },
  ];
  const ctx = runContextPipeline(data, "json", config, { presetId: "signature" });
  const trace = ctx.ruleTraces.find(t => t.ruleId === "growth-pattern-detection");
  assert.ok(trace, "growth-pattern-detection should have a trace");
  assert.equal(trace.status, "fired", "should fire when branch fields present");
  assert.ok(trace.output.value >= 2, "should match at least 2 branching signals");
});

test("bootstrap validation report catches missing registry entries before runtime use", async () => {
  const reportPath = "/mnt/c/Users/USER/CascadeProjects/tmp/jupyter-notebook/test-validation-report.json";
  await execFileAsync("node", [
    "/mnt/c/Users/USER/CascadeProjects/scripts/bootstrap_glimpse_logic.mjs",
    "--report-json",
    reportPath,
    "--quiet",
  ]);

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.ok(report.registry.count >= 10);
  assert.equal(report.sampleRuns.length, 3);
  assert.equal(Array.isArray(report.validationReport.invalidArgs), true);
});

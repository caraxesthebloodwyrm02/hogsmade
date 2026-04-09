/**
 * Harness Server — Smoke Tests
 *
 * Validates MCP tool registration, scenario seeding, runner execution,
 * signal collection, and Python bridge configuration.
 */

import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Stub audit client before importing source modules
vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: () => Promise.resolve(true),
}));

// Stub merit guard — returns passthrough registerGuardedTool
vi.mock("@cascade/shared-types", () => ({
  ActionClass: { PUBLIC_BASIC: "PUBLIC_BASIC" },
  createHardenedMeritGuard: () => ({
    registerGuardedTool: (server: any, name: string, opts: any, handler: any) => {
      server.registerTool(name, { description: opts.description, inputSchema: {} }, handler);
    },
    getCircuitState: () => "closed",
    getMetrics: () => ({}),
  }),
}));

import { buildServer } from "../src/server.js";

// ── Helpers ──

function toolHandler(server: any, toolName: string): (args: any) => Promise<any> {
  const tools = server._registeredTools as Record<string, any>;
  const entry = tools?.[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler;
}

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

// ── Test Suites ──

let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `harness-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  // Redirect data dir to temp
  process.env.HARNESS_DATA_DIR = tmpDir;
  process.env.HARNESS_MANIFEST_DIR = path.join(tmpDir, "manifests");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.HARNESS_DATA_DIR;
  delete process.env.HARNESS_MANIFEST_DIR;
});

describe("MCP server tool registration", () => {
  it("builds a server with all expected tools", () => {
    const server = buildServer();
    const tools = (server as any)._registeredTools as Record<string, any>;
    const registeredNames = Object.keys(tools);

    const expectedTools = [
      "health_check",
      "harness_run",
      "harness_status",
      "harness_probe",
      "harness_manifest",
      "scenario_list",
      "scenario_register",
      "collect_signals",
      "get_scenario_insights",
      "agent_arm",
      "agent_cycle",
      "agent_disarm",
      "agent_status",
    ];

    for (const name of expectedTools) {
      expect(registeredNames, `missing tool: ${name}`).toContain(name);
    }
    expect(registeredNames.length).toBe(expectedTools.length);
  });
});

describe("health_check tool", () => {
  it("returns ok status with server metadata", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "health_check");
    const result = await handler({});
    expect(result).toHaveProperty("status", "ok");
    expect(result).toHaveProperty("server", "harness-server");
    expect(result).toHaveProperty("version", "0.1.0");
    expect(result).toHaveProperty("scenarioCount");
  });
});

describe("scenario seeding and listing", () => {
  it("scenario_list returns core scenarios after seeding", async () => {
    const { seedCoreScenarios } = await import("../src/scenarios.js");
    const { ensureDataDirs } = await import("../src/storage.js");
    await ensureDataDirs();
    await seedCoreScenarios();

    const server = buildServer();
    const handler = toolHandler(server, "scenario_list");
    const result = await handler({});
    const data = parseToolJson(result);

    expect(data.total).toBeGreaterThanOrEqual(3);

    const names = data.scenarios.map((s: any) => s.name);
    expect(names).toContain("bastiodon");
    expect(names).toContain("talonflame");
    expect(names).toContain("exeggutor-a");
  });

  it("scenario_register rejects core scenario names", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "scenario_register");
    const result = await handler({
      name: "bastiodon",
      display_name: "Override",
      quantization_zone: "buildup",
      domain_function: "test",
    });
    const data = parseToolJson(result);
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/Cannot re-register core scenario/);
  });

  it("scenario_register accepts a custom scenario", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "scenario_register");
    const result = await handler({
      name: "test-custom",
      display_name: "Test Custom Scenario",
      layer: "Custom",
      quantization_zone: "drop",
      types: ["Normal"],
      fast_move: "Quick Attack",
      charged_moves: ["Hyper Beam"],
      domain_function: "Smoke test custom scenario registration",
    });
    const data = parseToolJson(result);
    expect(data).toHaveProperty("registered", true);
    expect(data).toHaveProperty("name", "test-custom");
    expect(data).toHaveProperty("zone", "drop");
  });
});

describe("harness_run tool", () => {
  it("runs bastiodon scenario and returns result", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "harness_run");
    const result = await handler({ scenario: "bastiodon", cycle: 0 });
    const data = parseToolJson(result);

    expect(data).toHaveProperty("scenarioName", "bastiodon");
    expect(data).toHaveProperty("status", "complete");
    expect(data).toHaveProperty("stepsExecuted");
    expect(data.stepsExecuted).toBe(44); // buildup zone: 0-43
    expect(data).toHaveProperty("transistorsFired");
    expect(data).toHaveProperty("signalsEmitted");
    expect(data).toHaveProperty("durationMs");
  });

  it("returns error for nonexistent scenario", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "harness_run");
    const result = await handler({ scenario: "nonexistent" });
    expect(result).toHaveProperty("isError", true);
    const data = parseToolJson(result);
    expect(data).toHaveProperty("error");
  });
});

describe("harness_probe tool", () => {
  it("probes bastiodon scenario for signals", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "harness_probe");
    const result = await handler({ scenario_id: "bastiodon", signal_type: "all" });
    const data = parseToolJson(result);

    expect(data).toHaveProperty("scenarioName", "bastiodon");
    expect(data).toHaveProperty("totalSignals");
    expect(data).toHaveProperty("transistorGates");
    expect(data).toHaveProperty("decoratedVars");
  });
});

describe("collect_signals tool", () => {
  it("collects all signals from completed runs", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "collect_signals");
    const result = await handler({});
    const data = parseToolJson(result);

    expect(data).toHaveProperty("totalSignals");
    expect(data.totalSignals).toBeGreaterThan(0);
    expect(data).toHaveProperty("byZone");
    expect(data.byZone).toHaveProperty("buildup");
    expect(data.byZone).toHaveProperty("silence");
    expect(data.byZone).toHaveProperty("drop");
  });
});

describe("agent state tools", () => {
  it("agent_status returns idle state when not armed", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "agent_status");
    const result = await handler({});
    const data = parseToolJson(result);

    expect(data).toHaveProperty("state");
    expect(data).toHaveProperty("cyclesCompleted");
    expect(data).toHaveProperty("cycleHistory");
  });
});

describe("Python bridge configuration", () => {
  it("config resolves pythonHarnessRoot correctly", async () => {
    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.pythonHarnessRoot).toContain("harness");
    expect(config.manifestDir).toContain("manifests");
    expect(config.gateDir).toContain("GATE");
  });
});

describe("type utilities", () => {
  it("zoneForStep maps buildup correctly", async () => {
    const { zoneForStep, intensityForStep } = await import("../src/types.js");

    expect(zoneForStep(0)).toBe("buildup");
    expect(zoneForStep(43)).toBe("buildup");
    expect(zoneForStep(44)).toBe("silence");
    expect(zoneForStep(47)).toBe("silence");
    expect(zoneForStep(48)).toBe("drop");
    expect(zoneForStep(67)).toBe("drop");
  });

  it("intensityForStep returns correct values per zone", async () => {
    const { intensityForStep } = await import("../src/types.js");

    // Buildup: 0.1 → 0.7
    expect(intensityForStep(0)).toBeCloseTo(0.1, 1);
    expect(intensityForStep(43)).toBeCloseTo(0.7, 1);

    // Silence: 0.0
    expect(intensityForStep(44)).toBe(0.0);

    // Drop: 1.0
    expect(intensityForStep(48)).toBe(1.0);
    expect(intensityForStep(67)).toBe(1.0);
  });
});

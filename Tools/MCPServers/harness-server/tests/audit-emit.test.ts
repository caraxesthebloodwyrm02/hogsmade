/**
 * Harness Server — Audit Emission Tests
 *
 * Verifies that harness_run (success), agent_arm, and agent_disarm each append
 * a correctly-shaped AuditEvent to the NDJSON audit file when the tool handler runs.
 *
 * Uses a tmp-directory override via ECHOES_AUDIT_PATH — never writes to ~/.echoes/.
 * audit-client is NOT mocked here; these are integration-level emission checks.
 */

import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Merit guard stub — does not interact with audit
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
vi.mock("@cascade/shared-types/trace-context", () => ({
  createRootSpan: () => ({ traceId: "test-trace", spanId: "test-span" }),
  createChildSpan: (t: any) => t,
  extractTrace: () => null,
}));

let tmpDir: string;
let auditPath: string;
// Loaded via dynamic import after env is set
let buildServer: () => any;
let seedCoreScenarios: () => Promise<void>;
let ensureDataDirs: () => Promise<void>;
let disarmAgent: () => Promise<any>;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `harness-audit-emit-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  auditPath = path.join(tmpDir, "audit.ndjson");

  // Set BEFORE importing audit-client (module-level const reads this env var)
  process.env.ECHOES_AUDIT_PATH = auditPath;
  process.env.HARNESS_DATA_DIR = tmpDir;
  process.env.HARNESS_MANIFEST_DIR = path.join(tmpDir, "manifests");

  const serverMod = await import("../src/server.js");
  buildServer = serverMod.buildServer;

  const storageMod = await import("../src/storage.js");
  ensureDataDirs = storageMod.ensureDataDirs;

  const scenariosMod = await import("../src/scenarios.js");
  seedCoreScenarios = scenariosMod.seedCoreScenarios;

  const agentMod = await import("../src/agent.js");
  disarmAgent = agentMod.disarmAgent;

  await ensureDataDirs();
  await seedCoreScenarios();
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.ECHOES_AUDIT_PATH;
  delete process.env.HARNESS_DATA_DIR;
  delete process.env.HARNESS_MANIFEST_DIR;
});

// ── Helpers ──

async function readAuditEvents(): Promise<any[]> {
  try {
    const content = await fs.readFile(auditPath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function toolHandler(server: any, toolName: string): (args: any) => Promise<any> {
  const tools = (server as any)._registeredTools as Record<string, any>;
  const entry = tools?.[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler;
}

// audit-client uses an async write queue; give it a tick to drain
const drainQueue = () => new Promise<void>((r) => setTimeout(r, 150));

// ── Tests ──

describe("harness_run audit emission", () => {
  it("emits a success event with scenario metadata after a successful run", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "harness_run");
    const before = (await readAuditEvents()).length;

    await handler({ scenario: "bastiodon", cycle: 0 });
    await drainQueue();

    const events = await readAuditEvents();
    const runEvent = events
      .slice(before)
      .find((e) => e.source === "harness-server" && e.tool === "harness_run");

    expect(runEvent, "no harness_run audit event found").toBeDefined();
    expect(runEvent.status).toBe("success");
    expect(runEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(runEvent.metadata).toMatchObject({
      scenario: "bastiodon",
      cycle: 0,
    });
    expect(typeof runEvent.metadata.stepsExecuted).toBe("number");
    expect(typeof runEvent.metadata.transistorsFired).toBe("number");
  });
});

describe("agent_arm audit emission", () => {
  it("emits a success event with arm metadata when agent is armed", async () => {
    const server = buildServer();
    const handler = toolHandler(server, "agent_arm");
    const before = (await readAuditEvents()).length;

    await handler({ interval_seconds: 30, max_cycles: 1 });
    await drainQueue();

    const events = await readAuditEvents();
    const armEvent = events
      .slice(before)
      .find((e) => e.source === "harness-server" && e.tool === "agent_arm");

    expect(armEvent, "no agent_arm audit event found").toBeDefined();
    expect(armEvent.status).toBe("success");
    expect(armEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(armEvent.metadata).toMatchObject({
      intervalSeconds: 30,
      maxCycles: 1,
    });
    expect(armEvent.metadata.armedAt).toBeDefined();

    // Clean up: disarm so state is not armed for subsequent tests
    await disarmAgent();
  });
});

describe("agent_disarm audit emission", () => {
  it("emits a success event with cycle count when agent is disarmed", async () => {
    // Arm first so disarm has something to operate on
    const server = buildServer();
    const armHandler = toolHandler(server, "agent_arm");
    await armHandler({ interval_seconds: 60, max_cycles: 1 });
    await drainQueue();

    const disarmHandler = toolHandler(server, "agent_disarm");
    const before = (await readAuditEvents()).length;

    await disarmHandler({});
    await drainQueue();

    const events = await readAuditEvents();
    const disarmEvent = events
      .slice(before)
      .find((e) => e.source === "harness-server" && e.tool === "agent_disarm");

    expect(disarmEvent, "no agent_disarm audit event found").toBeDefined();
    expect(disarmEvent.status).toBe("success");
    expect(disarmEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof disarmEvent.metadata.cyclesCompleted).toBe("number");
  });
});

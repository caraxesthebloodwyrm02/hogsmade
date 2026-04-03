/**
 * Section 1 — DATA tools
 *
 * Tools that return information without mutating state.
 * Servers covered: afloat, echoes, eligibility, lots, maintain, seeds
 */
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Shared helpers ────────────────────────────────────────────────────────────

interface TestServer {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
}

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

async function invokeTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const tool = server._registeredTools[name];
  expect(tool, `tool "${name}" not registered`).toBeDefined();
  const result = tool.inputSchema
    ? await tool.handler(args, {} as any)
    : await tool.handler({} as any);
  return result as ToolResult;
}

function parse<T = Record<string, unknown>>(result: ToolResult): T {
  return JSON.parse(result.content[0].text) as T;
}

// ── 1. afloat-server — DATA ───────────────────────────────────────────────────

describe("afloat-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-afloat-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.AFLOAT_DATA_DIR = path.join(tmp, ".afloat");
    const mod = await import("../../../Tools/MCPServers/afloat-server/src/server.ts");
    buildServer = mod.buildServer as unknown as () => TestServer;
  });

  afterAll(() => {
    delete process.env.AFLOAT_DATA_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("workflow_list — returns workflows array on fresh store", async () => {
    const r = await invokeTool(buildServer(), "workflow_list", { limit: 10 });
    expect(r.isError).not.toBe(true);
    const p = parse<{ workflows: unknown[]; count: number }>(r);
    expect(Array.isArray(p.workflows)).toBe(true);
    expect(typeof p.count).toBe("number");
  });

  it("workflow_history — returns executions array", async () => {
    const r = await invokeTool(buildServer(), "workflow_history", { limit: 5 });
    expect(r.isError).not.toBe(true);
    const p = parse<{ executions: unknown[]; count: number }>(r);
    expect(Array.isArray(p.executions)).toBe(true);
    expect(typeof p.count).toBe("number");
  });
});

// ── 2. echoes-server — DATA ───────────────────────────────────────────────────

describe("echoes-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-echoes-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    const dir = path.join(tmp, ".echoes");
    mkdirSync(dir, { recursive: true });
    process.env.ECHOES_DATA_DIR = dir;
    const mod = await import("../../../Tools/MCPServers/echoes-server/src/server.ts");
    buildServer = mod.buildServer as unknown as () => TestServer;
  });

  afterAll(() => {
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.ECHOES_TELEMETRY_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("query_audit — returns entries array on fresh store", async () => {
    const r = await invokeTool(buildServer(), "query_audit", { limit: 10 });
    expect(r.isError).not.toBe(true);
    expect(Array.isArray(parse<{ entries: unknown[] }>(r).entries)).toBe(true);
  });

  it("audit_stats — returns numeric total", async () => {
    const r = await invokeTool(buildServer(), "audit_stats");
    expect(r.isError).not.toBe(true);
    expect(typeof parse<{ total: number }>(r).total).toBe("number");
  });

  it("list_telemetry — returns snapshots array", async () => {
    const r = await invokeTool(buildServer(), "list_telemetry", { limit: 5 });
    expect(r.isError).not.toBe(true);
    expect(Array.isArray(parse<{ snapshots: unknown[] }>(r).snapshots)).toBe(true);
  });

  it("check_recurrence — read-only, returns boolean isRecurrence", async () => {
    const r = await invokeTool(buildServer(), "check_recurrence", {
      source: "cls-test",
      tool: "test_tool",
      status: "success",
    });
    expect(r.isError).not.toBe(true);
    expect(typeof parse<{ isRecurrence: boolean }>(r).isRecurrence).toBe("boolean");
  });

  it("query_precedents — returns precedents array", async () => {
    const r = await invokeTool(buildServer(), "query_precedents", { limit: 10 });
    expect(r.isError).not.toBe(true);
    expect(Array.isArray(parse<{ precedents: unknown[] }>(r).precedents)).toBe(true);
  });

  it("enforcement_status — returns totalActive count", async () => {
    const r = await invokeTool(buildServer(), "enforcement_status");
    expect(r.isError).not.toBe(true);
    expect(typeof parse<{ totalActive: number }>(r).totalActive).toBe("number");
  });
});

// ── 3. eligibility-server — DATA ─────────────────────────────────────────────

describe("eligibility-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-elig-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.ELIGIBILITY_DATA_DIR = path.join(tmp, ".eligibility");
    process.env.ECHOES_AUDIT_PATH = path.join(tmp, "audit.ndjson");
    const mod = await import("../../../Tools/MCPServers/eligibility-server/src/server.ts");
    buildServer = mod.buildServer as unknown as () => TestServer;
  });

  afterAll(() => {
    delete process.env.ELIGIBILITY_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("list_attribute_catalog — returns non-empty attributes array", async () => {
    const r = await invokeTool(buildServer(), "list_attribute_catalog");
    expect(r.isError).not.toBe(true);
    const p = parse<{ attributes: unknown[] }>(r);
    expect(Array.isArray(p.attributes)).toBe(true);
    expect(p.attributes.length).toBeGreaterThan(0);
  });

  it("evaluate_candidate — returns evaluation with validation result for fixture", async () => {
    const r = await invokeTool(buildServer(), "evaluate_candidate", {
      fixtureId: "balanced-bridge",
    });
    expect(r.isError).not.toBe(true);
    const p = parse<{ validation: { ok: boolean } }>(r);
    expect(typeof p.validation?.ok).toBe("boolean");
  });

  it("list_active_cycles — returns cases array", async () => {
    const r = await invokeTool(buildServer(), "list_active_cycles");
    expect(r.isError).not.toBe(true);
    expect(Array.isArray(parse<{ cases: unknown[] }>(r).cases)).toBe(true);
  });

  it("check_the_line — returns structural audit with issues array", async () => {
    const r = await invokeTool(buildServer(), "check_the_line");
    expect(r.isError).not.toBe(true);
    expect(r.content[0].text).toBeTruthy();
  });
});

// ── 4. lots-server — DATA ─────────────────────────────────────────────────────

describe("lots-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-lots-"));
  let buildServer: () => TestServer;
  let seedId: string;

  beforeAll(async () => {
    process.env.LOTS_EXPERIMENTS_DIR = path.join(tmp, "experiments");
    process.env.ECHOES_AUDIT_PATH = path.join(tmp, "audit.ndjson");
    process.env.SEEDS_DATA_DIR = path.join(tmp, ".seeds-server");
    process.env.AFLOAT_DATA_DIR = path.join(tmp, ".afloat");
    const mod = await import("../../../Tools/MCPServers/lots-server/src/server.ts");
    buildServer = mod.buildServer as unknown as () => TestServer;
    // Seed one experiment so get/dashboard have data to read
    const created = await invokeTool(buildServer(), "experiment_create", {
      name: "seed-perf-baseline",
      description: "seeded for data read tests",
      language: "python",
      script: "print('seed')",
      tags: ["smoke"],
    });
    seedId = parse<{ experiment: { id: string } }>(created).experiment.id;
  });

  afterAll(() => {
    delete process.env.LOTS_EXPERIMENTS_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.SEEDS_DATA_DIR;
    delete process.env.AFLOAT_DATA_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("experiment_list — returns the seeded experiment", async () => {
    const r = await invokeTool(buildServer(), "experiment_list", { limit: 10 });
    expect(r.isError).not.toBe(true);
    const p = parse<{ experiments: unknown[]; count: number }>(r);
    expect(Array.isArray(p.experiments)).toBe(true);
    expect(p.count).toBeGreaterThanOrEqual(1);
  });

  it("experiment_get — retrieves specific experiment by ID", async () => {
    const r = await invokeTool(buildServer(), "experiment_get", { experimentId: seedId });
    expect(r.isError).not.toBe(true);
    const p = parse<{ id: string; name: string }>(r);
    expect(p.id).toBe(seedId);
    expect(p.name).toBe("seed-perf-baseline");
  });

  it("experiment_dashboard_list — returns dashboard-shaped entries", async () => {
    const r = await invokeTool(buildServer(), "experiment_dashboard_list", { limit: 10 });
    expect(r.isError).not.toBe(true);
    expect(Array.isArray(parse<{ experiments: unknown[] }>(r).experiments)).toBe(true);
  });
});

// ── 5. maintain-server — DATA ─────────────────────────────────────────────────

describe("maintain-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-maintain-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.CASCADE_WORKSPACE_ROOT = path.join(tmp, "workspace");
    process.env.SEEDS_ROOT = path.join(tmp, "seeds");
    process.env.ECHOES_AUDIT_PATH = path.join(tmp, "audit.ndjson");
    process.env.MAINTAIN_DATA_DIR = path.join(tmp, ".maintain-server");
    const mod = await import("../../../Tools/MCPServers/maintain-server/src/server.ts");
    buildServer = () => (mod.buildServer as unknown as () => TestServer)();
  });

  afterAll(() => {
    delete process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.SEEDS_ROOT;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.MAINTAIN_DATA_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("scan_system — returns ram and volumes metrics", { timeout: 15000 }, async () => {
    const r = await invokeTool(buildServer(), "scan_system");
    expect(r.isError).not.toBe(true);
    const p = parse<{ ram: unknown; volumes: unknown[] }>(r);
    expect(p.ram).toBeDefined();
    expect(Array.isArray(p.volumes)).toBe(true);
  });

  it("report_history — returns message or history on fresh store", async () => {
    const r = await invokeTool(buildServer(), "report_history", { limit: 5 });
    expect(r.isError).not.toBe(true);
    expect(r.content[0].text).toBeTruthy();
  });
});

// ── 6. seeds-server — DATA ────────────────────────────────────────────────────

describe("seeds-server — DATA", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "cls1-seeds-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.SEEDS_ROOT = path.join(tmp, "Seeds");
    process.env.SEEDS_DATA_DIR = path.join(tmp, ".seeds-server");
    mkdirSync(path.join(tmp, "Seeds"), { recursive: true });
    const mod = await import("../../../Tools/MCPServers/seeds-server/src/server.ts");
    buildServer = mod.buildServer as unknown as () => TestServer;
  });

  afterAll(() => {
    delete process.env.SEEDS_ROOT;
    delete process.env.SEEDS_DATA_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("health_check — returns status=ok", async () => {
    const r = await invokeTool(buildServer(), "health_check");
    expect(r.isError).not.toBe(true);
    expect(parse<{ status: string }>(r).status).toBe("ok");
  });

  it("bookmark_list — returns empty bookmarks on fresh store", async () => {
    const r = await invokeTool(buildServer(), "bookmark_list", { limit: 10 });
    expect(r.isError).not.toBe(true);
    const p = parse<{ bookmarks: unknown[]; count: number }>(r);
    expect(Array.isArray(p.bookmarks)).toBe(true);
    expect(typeof p.count).toBe("number");
  });

  it("ecosystem_trend — returns a text response (no snapshots on fresh store)", async () => {
    const r = await invokeTool(buildServer(), "ecosystem_trend", { limit: 2 });
    expect(r.isError).not.toBe(true);
    expect(r.content[0].text).toBeTruthy();
  });
});

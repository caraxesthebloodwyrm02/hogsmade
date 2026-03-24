import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ToolHandler = (args: Record<string, unknown>, extra: unknown) => Promise<{ isError?: boolean; content?: Array<{ text?: string }> }>;

type TestServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: ToolHandler }>;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}): Promise<{ isError?: boolean; content?: Array<{ text?: string }> }> {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {}) : await tool.handler({} as Record<string, unknown>, {});
}

describe("maintain-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "maintain-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { workspaceRoot: string; seedsRoot: string; scanRoots: string[] };

  beforeAll(async () => {
    process.env.CASCADE_WORKSPACE_ROOT = path.join(tempRoot, "workspace");
    process.env.SEEDS_ROOT = path.join(tempRoot, "seeds");
    process.env.ECHOES_AUDIT_PATH = path.join(tempRoot, "echoes", "audit.ndjson");
    process.env.MAINTAIN_DATA_DIR = path.join(tempRoot, ".maintain-server");
    const mod = await import("../src/server.ts");
    buildServer = () => mod.buildServer() as unknown as TestServer;
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.SEEDS_ROOT;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.MAINTAIN_DATA_DIR;
    delete process.env.MAINTAIN_SCAN_ROOTS;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires explicit scan roots inputs", () => {
    const originalWorkspace = process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.CASCADE_WORKSPACE_ROOT;
    expect(() => getConfig()).toThrow(/CASCADE_WORKSPACE_ROOT/);
    process.env.CASCADE_WORKSPACE_ROOT = originalWorkspace;
  });

  it("registers expected tools and runs scan_system", { timeout: 15000 }, async () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(expect.arrayContaining([
      "health_check",
      "scan_temp",
      "scan_workspaces",
      "scan_git_repos",
      "scan_system",
      "full_diagnostic",
      "cleanup_execute",
      "report_history",
    ]));

    const health = await invokeTool(server, "health_check");
    const system = await invokeTool(server, "scan_system", {});
    expect(health.isError).not.toBe(true);
    expect(system.isError).not.toBe(true);
  });

  it("cleanup_execute: dry-run returns previewToken; execute without token is rejected", async () => {
    const server = buildServer();
    const dryResult = await invokeTool(server, "cleanup_execute", {
      actions: [{ type: "temp_clean" }],
      dryRun: true,
    });
    expect(dryResult.isError).not.toBe(true);
    const dryText = (dryResult as { content?: Array<{ text?: string }> }).content?.[0]?.text;
    const dryJson = JSON.parse(dryText ?? "{}");
    expect(dryJson.previewToken).toBeDefined();
    expect(typeof dryJson.previewToken).toBe("string");

    const executeNoToken = await invokeTool(server, "cleanup_execute", {
      actions: [{ type: "temp_clean" }],
      dryRun: false,
      confirmPhrase: "CONFIRM-CLEANUP",
    });
    const noTokenText = (executeNoToken as { content?: Array<{ text?: string }> }).content?.[0]?.text;
    const noTokenJson = JSON.parse(noTokenText ?? "{}");
    expect(noTokenJson.error).toMatch(/Multi-step|previewToken|dry-run first/i);
  });

  it("cleanup_execute rejects incorrect confirm phrase for non-dry-run", async () => {
    const server = buildServer();
    const rejected = await invokeTool(server, "cleanup_execute", {
      actions: [{ type: "temp_clean" }],
      dryRun: false,
      confirmPhrase: "NOPE",
    });
    const payload = JSON.parse(rejected.content?.[0]?.text ?? "{}");
    expect(payload.error).toMatch(/Safety check failed/i);
    expect(payload.message).toMatch(/CONFIRM-CLEANUP/);
  });

  it("cleanup_execute rejects mismatched preview token", async () => {
    const server = buildServer();
    const dryRun = await invokeTool(server, "cleanup_execute", {
      actions: [{ type: "temp_clean" }],
      dryRun: true,
    });
    const dryPayload = JSON.parse(dryRun.content?.[0]?.text ?? "{}");
    expect(dryPayload.previewToken).toBeDefined();

    const executeBadToken = await invokeTool(server, "cleanup_execute", {
      actions: [{ type: "temp_clean" }],
      dryRun: false,
      confirmPhrase: "CONFIRM-CLEANUP",
      previewToken: "deadbeef",
    });
    const payload = JSON.parse(executeBadToken.content?.[0]?.text ?? "{}");
    expect(payload.error).toMatch(/Multi-step safety/i);
  });

  it("full_diagnostic persists a report and report_history returns trend data", { timeout: 20000 }, async () => {
    const server = buildServer();
    const diagnostic = await invokeTool(server, "full_diagnostic", {
      saveReport: true,
    });
    const diagPayload = JSON.parse(diagnostic.content?.[0]?.text ?? "{}");
    expect(diagPayload.overallScore).toBeDefined();

    const history = await invokeTool(server, "report_history", { limit: 5 });
    const historyPayload = JSON.parse(history.content?.[0]?.text ?? "{}");
    expect(historyPayload.reportsAvailable).toBeGreaterThan(0);
    expect(historyPayload.history.length).toBeGreaterThan(0);
  });

  it("cleanup_execute executes with valid preview token and appends cleanup log", async () => {
    const server = buildServer();
    const cleanupTarget = path.join(process.env.CASCADE_WORKSPACE_ROOT!, "cleanup-target");
    mkdirSync(cleanupTarget, { recursive: true });
    const staleFile = path.join(cleanupTarget, "old.log");
    writeFileSync(staleFile, "stale");
    const staleDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    utimesSync(staleFile, staleDate, staleDate);

    const actions = [{ type: "temp_clean", target: cleanupTarget, maxAgeDays: 1 }];

    const dry = await invokeTool(server, "cleanup_execute", {
      actions,
      dryRun: true,
    });
    const dryPayload = JSON.parse(dry.content?.[0]?.text ?? "{}");
    const token = dryPayload.previewToken as string;
    expect(typeof token).toBe("string");

    const execute = await invokeTool(server, "cleanup_execute", {
      actions,
      dryRun: false,
      confirmPhrase: "CONFIRM-CLEANUP",
      previewToken: token,
    });
    const execPayload = JSON.parse(execute.content?.[0]?.text ?? "{}");
    expect(execPayload.mode).toBe("executed");

    const cleanupLogPath = path.join(process.env.MAINTAIN_DATA_DIR!, "cleanup-log.json");
    expect(existsSync(cleanupLogPath)).toBe(true);
    const logs = JSON.parse(readFileSync(cleanupLogPath, "utf-8")) as Array<{ dryRun: boolean; type: string }>;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((entry) => entry.type === "temp_clean" && entry.dryRun === false)).toBe(true);
  });
});

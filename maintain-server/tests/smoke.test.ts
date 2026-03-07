import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

type TestServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

describe("maintain-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "maintain-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { workspaceRoot: string; seedsRoot: string; scanRoots: string[] };

  beforeAll(async () => {
    process.env.CASCADE_WORKSPACE_ROOT = path.join(tempRoot, "workspace");
    process.env.SEEDS_ROOT = path.join(tempRoot, "seeds");
    process.env.ECHOES_AUDIT_PATH = path.join(tempRoot, "echoes", "audit.ndjson");
    ({ buildServer } = await import("../src/server.ts"));
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.SEEDS_ROOT;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.MAINTAIN_SCAN_ROOTS;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires explicit scan roots inputs", () => {
    const originalWorkspace = process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.CASCADE_WORKSPACE_ROOT;
    expect(() => getConfig()).toThrow(/CASCADE_WORKSPACE_ROOT/);
    process.env.CASCADE_WORKSPACE_ROOT = originalWorkspace;
  });

  it("registers expected tools and runs scan_system", async () => {
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
});

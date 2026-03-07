import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
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

describe("grid-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "grid-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { gateDir: string; workspaceRoot: string };

  beforeAll(async () => {
    process.env.CASCADE_WORKSPACE_ROOT = tempRoot;
    process.env.GATE_DIR = path.join(tempRoot, "GATE");
    mkdirSync(process.env.GATE_DIR, { recursive: true });
    ({ buildServer } = await import("../src/server.ts"));
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.GATE_DIR;
    delete process.env.GRID_API_URL;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires machine-specific env vars", () => {
    const originalGateDir = process.env.GATE_DIR;
    delete process.env.GATE_DIR;
    expect(() => getConfig()).toThrow(/GATE_DIR/);
    process.env.GATE_DIR = originalGateDir;
  });

  it("registers expected tools and runs list_targets", async () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(expect.arrayContaining([
      "health_check",
      "list_targets",
      "validate_envelope",
      "gate_audit",
      "nonce_status",
      "check_permission",
    ]));

    const health = await invokeTool(server, "health_check");
    const targets = await invokeTool(server, "list_targets", {});
    expect(health.isError).not.toBe(true);
    expect(targets.isError).not.toBe(true);
  });
});

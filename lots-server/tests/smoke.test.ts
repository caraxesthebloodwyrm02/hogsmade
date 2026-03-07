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

describe("lots-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lots-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { experimentsDir: string };

  beforeAll(async () => {
    process.env.LOTS_EXPERIMENTS_DIR = path.join(tempRoot, "experiments");
    process.env.ECHOES_AUDIT_PATH = path.join(tempRoot, "echoes", "audit.ndjson");
    ({ buildServer } = await import("../src/server.ts"));
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.LOTS_EXPERIMENTS_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires an experiments root", () => {
    const original = process.env.LOTS_EXPERIMENTS_DIR;
    delete process.env.LOTS_EXPERIMENTS_DIR;
    expect(() => getConfig()).toThrow(/LOTS_EXPERIMENTS_DIR/);
    process.env.LOTS_EXPERIMENTS_DIR = original;
  });

  it("registers expected tools and runs experiment_list", async () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(expect.arrayContaining([
      "health_check",
      "experiment_create",
      "experiment_list",
      "experiment_run",
      "experiment_get",
      "experiment_compare",
    ]));

    const health = await invokeTool(server, "health_check");
    const list = await invokeTool(server, "experiment_list", { limit: 5 });
    expect(health.isError).not.toBe(true);
    expect(list.isError).not.toBe(true);
  });
});

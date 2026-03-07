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

describe("afloat-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "afloat-server-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.AFLOAT_DATA_DIR = path.join(tempRoot, ".afloat");
    ({ buildServer } = await import("../src/server.ts"));
  });

  afterAll(() => {
    delete process.env.AFLOAT_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers expected tools", () => {
    expect(getToolNames(buildServer())).toEqual(expect.arrayContaining([
      "health_check",
      "workflow_create",
      "workflow_list",
      "workflow_get",
      "workflow_execute",
      "workflow_history",
    ]));
  });

  it("runs health_check and workflow_list", async () => {
    const server = buildServer();
    const health = await invokeTool(server, "health_check");
    const list = await invokeTool(server, "workflow_list", { limit: 5 });
    expect(health.isError).not.toBe(true);
    expect(list.isError).not.toBe(true);
  });
});

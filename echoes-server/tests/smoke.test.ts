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

describe("echoes-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "echoes-server-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.ECHOES_DATA_DIR = path.join(tempRoot, ".echoes");
    ({ buildServer } = await import("../src/server.ts"));
  });

  afterAll(() => {
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.ECHOES_TELEMETRY_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers expected tools", () => {
    expect(getToolNames(buildServer())).toEqual(expect.arrayContaining([
      "health_check",
      "record_audit",
      "query_audit",
      "audit_stats",
      "save_telemetry",
      "list_telemetry",
    ]));
  });

  it("records audit data and returns telemetry", async () => {
    const server = buildServer();
    const health = await invokeTool(server, "health_check");
    const record = await invokeTool(server, "record_audit", {
      source: "smoke-test",
      tool: "health_check",
      status: "success",
      durationMs: 7,
      metadata: { suite: "smoke" },
    });
    const query = await invokeTool(server, "query_audit", { limit: 5 });
    const telemetry = await invokeTool(server, "save_telemetry", {
      workspace: "CascadeProjects",
      projects: 3,
      activeServers: ["echoes-server"],
      metrics: { healthScore: 1 },
    });

    expect(health.isError).not.toBe(true);
    expect(record.isError).not.toBe(true);
    expect(query.isError).not.toBe(true);
    expect(telemetry.isError).not.toBe(true);
  });
});

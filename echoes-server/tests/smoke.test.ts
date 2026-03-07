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
    process.env.ECHOES_DATA_DIR = path.join(tempRoot, "echoes");
    process.env.ECHOES_AUDIT_PATH = path.join(process.env.ECHOES_DATA_DIR, "audit.ndjson");
    ({ buildServer } = await import("../src/server.ts"));
  });

  afterAll(() => {
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers expected tools", () => {
    const names = getToolNames(buildServer());
    expect(names).toEqual(expect.arrayContaining([
      "health_check",
      "record_audit",
      "query_audit",
      "audit_stats",
      "save_telemetry",
      "list_telemetry",
    ]));
  });

  it("runs health_check and query_audit", async () => {
    const server = buildServer();
    const health = await invokeTool(server, "health_check");
    const query = await invokeTool(server, "query_audit", { limit: 5 });
    expect(health.isError).not.toBe(true);
    expect(query.isError).not.toBe(true);
  });
});

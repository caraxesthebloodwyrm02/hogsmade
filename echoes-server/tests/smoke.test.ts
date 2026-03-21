import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import os from "os";
import path from "path";

// Type assertion for testing - bypass private property access
interface TestServer {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
}

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
    mkdirSync(process.env.ECHOES_DATA_DIR, { recursive: true });
    const serverModule = await import("../src/server.ts");
    buildServer = serverModule.buildServer as unknown as () => TestServer;
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

  it("runs health_check successfully", async () => {
    const server = buildServer();
    const result = await invokeTool(server, "health_check") as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(result.isError).not.toBe(true);
    const text = result.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.status).toBe("ok");
    expect(parsed.server).toBe("echoes-server");
  });

  it("records and queries audit entries", async () => {
    const server = buildServer();

    // Record an audit entry
    const recordResult = await invokeTool(server, "record_audit", {
      source: "test-suite",
      tool: "test_tool",
      status: "success",
      durationMs: 42,
      metadata: { test: true },
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(recordResult.isError).not.toBe(true);

    const recordText = recordResult.content?.[0]?.text;
    const recordParsed = JSON.parse(recordText as string);
    expect(recordParsed.recorded).toBe(true);
    expect(recordParsed.id).toBeDefined();

    // Query the audit log
    const queryResult = await invokeTool(server, "query_audit", {
      limit: 10,
      tool: "test_tool",
      status: "success",
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(queryResult.isError).not.toBe(true);

    const queryText = queryResult.content?.[0]?.text;
    const queryParsed = JSON.parse(queryText as string);
    expect(queryParsed.count).toBeGreaterThanOrEqual(1);
    expect(queryParsed.entries[0].tool).toBe("test_tool");
    expect(queryParsed.entries[0].status).toBe("success");
  });

  it("returns audit statistics", async () => {
    const server = buildServer();

    // Record a few entries for stats
    await invokeTool(server, "record_audit", {
      source: "stats-test",
      tool: "tool_a",
      status: "success",
      durationMs: 100,
    });
    await invokeTool(server, "record_audit", {
      source: "stats-test",
      tool: "tool_b",
      status: "failure",
      durationMs: 200,
    });

    const statsResult = await invokeTool(server, "audit_stats", {}) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(statsResult.isError).not.toBe(true);

    const statsText = statsResult.content?.[0]?.text;
    const statsParsed = JSON.parse(statsText as string);
    expect(statsParsed.total).toBeGreaterThanOrEqual(2);
    expect(statsParsed.byStatus).toBeDefined();
    expect(statsParsed.byTool).toBeDefined();
    expect(statsParsed.avgDurationMs).toBeDefined();
  });

  it("saves and lists telemetry snapshots", async () => {
    const server = buildServer();

    // Save a telemetry snapshot
    const saveResult = await invokeTool(server, "save_telemetry", {
      workspace: "test-workspace",
      projects: 5,
      activeServers: ["echoes", "grid"],
      metrics: { healthScore: 95, commitCount: 42 },
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(saveResult.isError).not.toBe(true);

    const saveText = saveResult.content?.[0]?.text;
    const saveParsed = JSON.parse(saveText as string);
    expect(saveParsed.saved).toBe(true);
    expect(saveParsed.path).toBeDefined();

    // List telemetry snapshots
    const listResult = await invokeTool(server, "list_telemetry", { limit: 5 }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(listResult.isError).not.toBe(true);

    const listText = listResult.content?.[0]?.text;
    const listParsed = JSON.parse(listText as string);
    expect(listParsed.count).toBeGreaterThanOrEqual(1);
    expect(listParsed.snapshots[0].workspace).toBe("test-workspace");
    expect(listParsed.snapshots[0].projects).toBe(5);
  });

  it("filters audit log by status", async () => {
    const server = buildServer();

    // Record entries with different statuses
    await invokeTool(server, "record_audit", {
      source: "filter-test",
      tool: "filter_tool",
      status: "blocked",
    });
    await invokeTool(server, "record_audit", {
      source: "filter-test",
      tool: "filter_tool",
      status: "dry_run",
    });

    // Query for blocked only
    const blockedResult = await invokeTool(server, "query_audit", {
      limit: 10,
      tool: "filter_tool",
      status: "blocked",
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };

    const blockedText = blockedResult.content?.[0]?.text;
    const blockedParsed = JSON.parse(blockedText as string);

    // All returned entries should be blocked
    for (const entry of blockedParsed.entries) {
      expect(entry.status).toBe("blocked");
    }
  });

  it("filters audit log by timestamp", async () => {
    const server = buildServer();

    // Record an entry
    await invokeTool(server, "record_audit", {
      source: "time-test",
      tool: "time_tool",
      status: "success",
    });

    // Query with since filter (1 hour ago should include it)
    const since = new Date(Date.now() - 3600000).toISOString();
    const queryResult = await invokeTool(server, "query_audit", {
      limit: 10,
      since,
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };

    expect(queryResult.isError).not.toBe(true);
  });
});

/**
 * Craft-server smoke test.
 *
 * Tests that the MCP server builds correctly, registers the expected tools,
 * and that health_check returns a valid response (even when gruff DB is not
 * fully bootstrapped — degraded status is acceptable in smoke tests).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Type assertion for testing — bypass private property access
interface TestServer {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
}

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return (
    tool.inputSchema ? await tool.handler(args, {} as unknown) : await tool.handler({} as unknown)
  ) as Record<string, unknown>;
}

describe("craft-server smoke", () => {
  let buildServer: () => TestServer;
  let getConfig: () => { gruffWorkspacePath: string; echoesBridgeUrl: string };

  beforeAll(async () => {
    // Use original workspace path so smoke test runs against real gruff if available.
    // NODE_ENV=test keeps audit emission lightweight.
    process.env.NODE_ENV = "test";

    const serverModule = (await import("../src/server.ts")) as unknown as {
      buildServer: () => TestServer;
    };
    ({ buildServer } = serverModule);
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
  });

  it("returns config defaults when no env vars are set", () => {
    const config = getConfig();
    expect(config.gruffWorkspacePath).toBe("/home/irfankabir/gruff/workspace");
    expect(config.echoesBridgeUrl).toBe("http://localhost:8001");
  });

  it("registers all expected tools", () => {
    const server = buildServer();
    const toolNames = getToolNames(server);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "health_check",
        "list_actors",
        "route_tool",
        "list_routines",
        "run_routine",
        "generate_snapshot",
        "send_proportion",
      ]),
    );
    expect(toolNames.length).toBe(7);
  });

  it("health_check returns a valid response", async () => {
    const server = buildServer();
    const health = await invokeTool(server, "health_check");

    expect(health).toBeDefined();
    expect(health.content).toBeDefined();

    const content = health.content as Array<{ type: string; text?: string }>;
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThanOrEqual(1);
    expect(content[0].type).toBe("text");

    const parsed = JSON.parse(content[0].text!);
    expect(parsed.server).toBe("craft-server");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.gruffPath).toBeDefined();
    // Accept "ok" or "degraded" — gruff DB may not be bootstrapped in test env
    expect(["ok", "degraded"]).toContain(parsed.status);
    expect(parsed.timestamp).toBeDefined();
  });

  it("list_actors handles uninitialized DB gracefully", async () => {
    const server = buildServer();
    const result = await invokeTool(server, "list_actors", { limit: 5 });

    expect(result).toBeDefined();
    if (result.isError) {
      // DB not initialized — should return a clear error message
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toMatch(/trust database|initialize|gruff/i);
    } else {
      // DB is initialized — should return actors array
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.actors).toBeDefined();
      expect(Array.isArray(parsed.actors)).toBe(true);
    }
  });

  it("list_routines returns routine inventory", async () => {
    const server = buildServer();
    const result = await invokeTool(server, "list_routines");

    expect(result).toBeDefined();
    if (result.isError) {
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.error).toMatch(/routine|not found|Failed to load/i);
    } else {
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.routines).toBeDefined();
      expect(parsed.total).toBeDefined();
      expect(parsed.active).toBeDefined();
      expect(parsed.draft).toBeDefined();
    }
  });

  it("route_tool validates input and handles missing actors", async () => {
    const server = buildServer();
    const result = await invokeTool(server, "route_tool", {
      tool: "record_audit",
      actor: "nonexistent-actor",
    });

    expect(result).toBeDefined();
    if (result.isError) {
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.error).toBeDefined();
    } else {
      const content = result.content as Array<{ type: string; text?: string }>;
      const parsed = JSON.parse(content[0].text!);
      expect(parsed.route).toBeDefined();
      // Unknown actors get hold tier with score 0
    }
  });
});

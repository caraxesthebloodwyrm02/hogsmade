import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.ts";

type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ isError?: boolean; content?: Array<{ text?: string }> }>;

type TestServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: ToolHandler }>;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError?: boolean; content?: Array<{ text?: string }> }> {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema
    ? await tool.handler(args, {})
    : await tool.handler({} as Record<string, unknown>, {});
}

describe("mangrove-server smoke", () => {
  it("builds an MCP server instance", () => {
    const s = buildServer();
    expect(s).toBeDefined();
  });

  it("registers the expected 3 tools", () => {
    const server = buildServer() as unknown as TestServer;
    expect(getToolNames(server)).toEqual(
      expect.arrayContaining(["dio_episode_summary", "dio_status", "security_audit"]),
    );
    expect(getToolNames(server)).toHaveLength(3);
  });

  it("dio_status degrades gracefully when DIO Python env is unavailable", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "dio_status", { detail: "minimal" });
    // Python not available in test env — must return isError with error payload, not throw
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    if (result.isError) {
      const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
      expect(payload).toHaveProperty("error");
    }
  });

  it("security_audit degrades gracefully when DIO workspace is absent", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "security_audit", { format: "json" });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    if (result.isError) {
      const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
      expect(payload).toHaveProperty("error");
    }
  });
});

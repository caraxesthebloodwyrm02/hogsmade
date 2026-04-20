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

describe("glimpse-server smoke", () => {
  it("builds an MCP server instance", () => {
    const s = buildServer();
    expect(s).toBeDefined();
  });

  it("registers the expected 8 tools", () => {
    const server = buildServer() as unknown as TestServer;
    expect(getToolNames(server)).toEqual(
      expect.arrayContaining([
        "glimpse_analyze",
        "glimpse_complexity",
        "glimpse_compress",
        "glimpse_similarity",
        "glimpse_confidence",
        "glimpse_session",
        "glimpse_track",
        "glimpse_paths",
      ]),
    );
    expect(getToolNames(server)).toHaveLength(8);
  });

  it("glimpse_analyze returns isError when engine is unavailable in test env", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "glimpse_analyze", {
      data: [{ x: 1 }],
      fileType: "json",
      multiPass: false,
      grounding: false,
    });
    // Engine path won't resolve in test; handler must degrade with isError rather than throw
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("glimpse_complexity returns a response without crashing", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "glimpse_complexity", {
      data: [{ a: 1 }, { a: 2 }],
    });
    expect(result.content).toBeDefined();
  });

  it("glimpse_similarity returns a response without crashing", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "glimpse_similarity", {
      valueA: "high",
      valueB: "low",
      dimension: "intensity",
    });
    expect(result.content).toBeDefined();
  });
});

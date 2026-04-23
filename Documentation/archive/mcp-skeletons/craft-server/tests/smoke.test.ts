import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

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

describe("craft-server smoke", () => {
  it("registers the expected 6 tools", () => {
    const server = buildServer() as unknown as TestServer;
    expect(getToolNames(server)).toEqual(
      expect.arrayContaining([
        "health_check",
        "list_modules",
        "render",
        "run_template",
        "get_recommendations",
        "fold_contrast",
      ]),
    );
    expect(getToolNames(server)).toHaveLength(6);
  });

  it("health_check degrades gracefully when python-craft root is absent", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "health_check");
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
    expect(payload).toHaveProperty("server", "craft-server");
    expect(payload).toHaveProperty("rootExists");
  });

  it("list_modules returns a non-empty module list", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "list_modules", {});
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
    expect(Array.isArray(payload.modules)).toBe(true);
    expect(payload.modules.length).toBeGreaterThan(0);
  });

  it("render rejects unknown module with isError", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "render", { module: "__nonexistent__" });
    expect(result.isError).toBe(true);
  });

  it("fold_contrast returns graceful error for unknown geo anchor", async () => {
    const server = buildServer() as unknown as TestServer;
    const result = await invokeTool(server, "fold_contrast", {
      geoA: "unknown_anchor",
      geoB: "prince",
    });
    // Either isError flag or payload.error string — both are valid graceful degradation
    const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
    expect(result.isError === true || typeof payload.error === "string").toBe(true);
  });
});

import { beforeAll, describe, expect, it } from "vitest";

// Type assertion for testing — bypass private property access
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

describe("mangrove-server smoke", () => {
  let buildServer: () => TestServer;

  beforeAll(async () => {
    const serverModule = (await import("../src/server.ts")) as unknown as {
      buildServer: () => TestServer;
    };
    ({ buildServer } = serverModule);
  });

  it("registers only health_check tool", () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(["health_check"]);
  });

  it("health_check returns ok status", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "health_check")) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    expect(result.isError).not.toBe(true);

    const text = result.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.status).toBe("ok");
    expect(parsed.server).toBe("mangrove-server");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.mangroveWorkspaceRoot).toBeDefined();
    expect(parsed.gruffWorkspacePath).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
  });
});

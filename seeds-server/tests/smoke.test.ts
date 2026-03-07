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

describe("seeds-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "seeds-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { seedsRoot: string; dataDir: string };

  beforeAll(async () => {
    process.env.SEEDS_ROOT = path.join(tempRoot, "Seeds");
    process.env.SEEDS_DATA_DIR = path.join(tempRoot, ".seeds-server");
    ({ buildServer } = await import("../src/server.ts"));
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.SEEDS_ROOT;
    delete process.env.SEEDS_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires a seeds root", () => {
    const original = process.env.SEEDS_ROOT;
    delete process.env.SEEDS_ROOT;
    expect(() => getConfig()).toThrow(/SEEDS_ROOT/);
    process.env.SEEDS_ROOT = original;
  });

  it("registers expected tools and runs bookmark_list", async () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(expect.arrayContaining([
      "health_check",
      "ecosystem_scan",
      "repo_detail",
      "bookmark_add",
      "bookmark_list",
      "ecosystem_trend",
    ]));

    const health = await invokeTool(server, "health_check");
    const bookmarks = await invokeTool(server, "bookmark_list", { limit: 5 });
    expect(health.isError).not.toBe(true);
    expect(bookmarks.isError).not.toBe(true);
  });
});

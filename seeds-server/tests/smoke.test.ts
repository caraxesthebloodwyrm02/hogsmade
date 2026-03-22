import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
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

describe("seeds-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "seeds-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { seedsRoot: string; dataDir: string };

  beforeAll(async () => {
    process.env.SEEDS_ROOT = path.join(tempRoot, "Seeds");
    process.env.SEEDS_DATA_DIR = path.join(tempRoot, ".seeds-server");
    const serverModule = await import("../src/server.ts") as unknown as { buildServer: () => TestServer };
    ({ buildServer } = serverModule);
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

    const health = await invokeTool(server, "health_check") as { isError?: boolean };
    const bookmarks = await invokeTool(server, "bookmark_list", { limit: 5 }) as { isError?: boolean };
    expect(health.isError).not.toBe(true);
    expect(bookmarks.isError).not.toBe(true);
  });

  it("runs ecosystem_scan and returns repository data", async () => {
    const server = buildServer();
    
    // Create a test repository structure
    const seedsRoot = process.env.SEEDS_ROOT!;
    const testRepo = path.join(seedsRoot, "test-project");
    require("fs").mkdirSync(testRepo, { recursive: true });
    require("fs").writeFileSync(path.join(testRepo, "package.json"), '{"name": "test"}');
    require("fs").mkdirSync(path.join(testRepo, ".git"), { recursive: true });
    require("fs").writeFileSync(path.join(testRepo, ".git", "HEAD"), "ref: refs/heads/main\n");
    require("fs").mkdirSync(path.join(seedsRoot, "archive"), { recursive: true });
    require("fs").mkdirSync(path.join(seedsRoot, "templates"), { recursive: true });
    
    const result = await invokeTool(server, "ecosystem_scan", { saveSnapshot: false }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(result.isError).not.toBe(true);
    
    const text = result.content?.[0]?.text;
    const parsed = JSON.parse(text as string);
    expect(parsed.summary.totalRepos).toBeGreaterThanOrEqual(1);
    expect(parsed.repos).toBeDefined();
    
    // Find our test repo
    const testRepoData = parsed.repos.find((r: any) => r.name === "test-project");
    expect(testRepoData).toBeDefined();
    expect(testRepoData.healthScore).toBeDefined();
    expect(parsed.repos.find((r: any) => r.name === "archive")).toBeUndefined();
    expect(parsed.repos.find((r: any) => r.name === "templates")).toBeUndefined();
  });

  it("runs ecosystem_trend and returns historical data", async () => {
    const server = buildServer();
    
    // First run scans to create snapshots (need at least 2 for trend analysis)
    await invokeTool(server, "ecosystem_scan", { saveSnapshot: true });
    await invokeTool(server, "ecosystem_scan", { saveSnapshot: true });
    
    const result = await invokeTool(server, "ecosystem_trend", { limit: 5 }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    expect(result.isError).not.toBe(true);
    
    const text = result.content?.[0]?.text;
    const parsed = JSON.parse(text as string);
    // Trend analysis requires at least 2 snapshots
    expect(parsed.snapshotsCompared).toBeGreaterThanOrEqual(2);
    expect(parsed.overallScoreTrend).toBeDefined();
    expect(parsed.improving).toBeDefined();
    expect(parsed.degrading).toBeDefined();
    expect(parsed.stable).toBeDefined();
  });
});

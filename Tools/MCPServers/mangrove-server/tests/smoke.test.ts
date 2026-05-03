import { execFile } from "child_process";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

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
  let workspaceRoot: string;
  let repoPath: string;

  beforeAll(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "mangrove-server-test-"));
    process.env.MANGROVE_WORKSPACE_ROOT = workspaceRoot;
    process.env.GRUFF_WORKSPACE_PATH = workspaceRoot;
    repoPath = path.join(workspaceRoot, "repo");
    await execFileAsync("git", ["init", repoPath]);
    await writeFile(path.join(repoPath, "tracked.txt"), "changed\n", "utf-8");
    const serverModule = (await import("../src/server.ts")) as unknown as {
      buildServer: () => TestServer;
    };
    ({ buildServer } = serverModule);
  });

  it("registers ecosystem janitor tools", () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual([
      "health_check",
      "check_git_hygiene",
      "find_loose_objects",
    ]);
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

  it("check_git_hygiene identifies untracked files without mutating them", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "check_git_hygiene", { targetPath: repoPath })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    expect(result.isError).not.toBe(true);

    const text = result.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.targetPath).toBe(repoPath);
    expect(parsed.isGitRepo).toBe(true);
    expect(parsed.clean).toBe(false);
    expect(parsed.untracked).toBe(1);
    expect(parsed.issues).toContain("untracked_files");
  });

  it("find_loose_objects reports git object counts", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "find_loose_objects", { targetPath: repoPath })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    expect(result.isError).not.toBe(true);

    const text = result.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.targetPath).toBe(repoPath);
    expect(parsed.looseObjects).toBeGreaterThanOrEqual(0);
    expect(parsed.looseSizeKiB).toBeGreaterThanOrEqual(0);
    expect(parsed.timestamp).toBeDefined();
  });
});

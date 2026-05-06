import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

type TestServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
};

function parseToolJson(raw: ToolResult) {
  const first = JSON.parse(raw.content[0].text);
  if (raw.isError) return first;
  if (first && typeof first === "object" && "result" in first && "_meta" in first) {
    const inner = (first as { result: { content?: Array<{ text: string }> } }).result;
    if (inner?.content?.[0]?.text) return JSON.parse(inner.content[0].text);
    return inner as Record<string, unknown>;
  }
  return first;
}

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

describe("ori-server registry", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-registry-"));
  let buildServer!: () => unknown;
  let loadRegistry!: () => Promise<any>;
  let saveRegistry!: (reg: any) => Promise<void>;
  let getProject!: (id: string) => Promise<any>;
  let listProjects!: (filter?: any) => Promise<any[]>;
  let unstubFetch: (() => void) | undefined;

  function server() {
    return buildServer() as TestServer;
  }

  beforeAll(async () => {
    const origFetch = globalThis.fetch;
    process.env.GRID_API_URL = "http://127.0.0.1:59998";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admission/check-permission")) {
        return new Response(
          JSON.stringify({
            allowed: true,
            entity_id: "mcp:ori-server:test",
            action_class: "analysis_read",
            required_badge: "B1_TRUSTED",
            actual_badge: "B1_TRUSTED",
            has_badge: true,
            required_scopes: ["read"],
            eligible_scopes: ["read", "write"],
            has_scopes: true,
            has_specific_scope: true,
            score: 100,
            roll_number: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return origFetch(input);
    }) as typeof fetch;
    unstubFetch = () => {
      globalThis.fetch = origFetch;
      delete process.env.GRID_API_URL;
    };

    const echoesDataDir = path.join(tempRoot, ".echoes");
    process.env.ORI_DATA_DIR = path.join(tempRoot, ".ori");
    process.env.ECHOES_DATA_DIR = echoesDataDir;
    process.env.ECHOES_AUDIT_PATH = path.join(echoesDataDir, "audit.ndjson");

    mkdirSync(echoesDataDir, { recursive: true });
    writeFileSync(process.env.ECHOES_AUDIT_PATH, "", "utf-8");

    ({ buildServer } = (await import("../src/server.ts")) as { buildServer: () => unknown });
    ({ loadRegistry, saveRegistry, getProject, listProjects } = await import("../src/registry.ts"));
  });

  afterAll(() => {
    unstubFetch?.();
    delete process.env.ORI_DATA_DIR;
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  describe("tool registration", () => {
    it("registers registry tools alongside existing tools", () => {
      const tools = Object.keys(server()._registeredTools);
      expect(tools).toEqual(
        expect.arrayContaining(["list_projects", "get_project", "discover_tests"]),
      );
      expect(tools.length).toBe(29);
    });
  });

  describe("registry module", () => {
    it("loads default registry when no file exists", async () => {
      const registry = await loadRegistry();
      expect(registry.schemaVersion).toBe("1.0.0");
      expect(registry.projects.length).toBeGreaterThan(10);
      expect(registry.updatedAt).toBeDefined();
    });

    it("round-trips registry to disk", async () => {
      const registry = await loadRegistry();
      const originalCount = registry.projects.length;

      registry.projects[0].healthStatus = "healthy";
      await saveRegistry(registry);

      const reloaded = await loadRegistry();
      expect(reloaded.projects.length).toBe(originalCount);
      expect(reloaded.projects[0].healthStatus).toBe("healthy");
    });

    it("getProject returns correct entry", async () => {
      const project = await getProject("grid-main");
      expect(project).not.toBeNull();
      expect(project!.name).toBe("GRID-main");
      expect(project!.runner.type).toBe("pytest");
      expect(project!.runner.command).toBe("uv");
      expect(project!.tags).toContain("python");
      expect(project!.threatModelIds).toContain("TM-001");
    });

    it("getProject returns null for unknown ID", async () => {
      expect(await getProject("nonexistent-project")).toBeNull();
    });

    it("listProjects returns all projects unfiltered", async () => {
      const projects = await listProjects();
      expect(projects.length).toBeGreaterThan(10);
    });

    it("listProjects filters by tags", async () => {
      const pythonProjects = await listProjects({ tags: ["python"] });
      expect(pythonProjects.length).toBeGreaterThan(0);
      expect(pythonProjects.every((p) => p.tags.includes("python"))).toBe(true);

      const mcpProjects = await listProjects({ tags: ["mcp"] });
      expect(mcpProjects.length).toBeGreaterThan(5);
      expect(mcpProjects.every((p) => p.tags.includes("mcp"))).toBe(true);
    });

    it("listProjects filters by health status", async () => {
      const registry = await loadRegistry();
      registry.projects[0].healthStatus = "healthy";
      await saveRegistry(registry);

      const healthy = await listProjects({ healthStatus: "healthy" });
      expect(healthy.length).toBe(1);
      expect(healthy[0].healthStatus).toBe("healthy");
    });
  });

  describe("MCP tool integration", () => {
    it("list_projects returns project entries", async () => {
      const result = (await invokeTool(server(), "list_projects", {})) as ToolResult;
      const payload = parseToolJson(result);
      expect(payload.totalProjects).toBeGreaterThan(10);
      expect(payload.projects[0].id).toBeDefined();
      expect(payload.projects[0].runnerType).toBeDefined();
      expect(payload.projects[0].tags).toBeDefined();
    });

    it("list_projects filters by tag", async () => {
      const result = (await invokeTool(server(), "list_projects", {
        tags: ["typescript"],
      })) as ToolResult;
      const payload = parseToolJson(result);
      expect(payload.totalProjects).toBeGreaterThan(0);
      expect(payload.projects.every((p: { tags: string[] }) => p.tags.includes("typescript"))).toBe(
        true,
      );
    });

    it("get_project returns detailed info", async () => {
      const result = (await invokeTool(server(), "get_project", {
        projectId: "grid-main",
      })) as ToolResult;
      const payload = parseToolJson(result);
      expect(payload.id).toBe("grid-main");
      expect(payload.name).toBe("GRID-main");
      expect(payload.runner.type).toBe("pytest");
      expect(payload.runner.cwd).toContain("GRID-main");
    });

    it("get_project returns error for unknown ID", async () => {
      const result = (await invokeTool(server(), "get_project", {
        projectId: "does-not-exist",
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(parseToolJson(result).error).toContain("not found");
    });

    it("discover_tests validates project on disk", async () => {
      const oriDir = path.join(process.cwd(), "..", "MCPServers", "ori-server");
      if (!existsSync(oriDir)) return;

      const result = (await invokeTool(server(), "discover_tests", {
        projectId: "mcp-ori-server",
      })) as ToolResult;
      const payload = parseToolJson(result);
      expect(payload.found).toBe(true);
      expect(payload.testFiles).toBeGreaterThan(0);
    });

    it("discover_tests returns not found for unknown project", async () => {
      const result = (await invokeTool(server(), "discover_tests", {
        projectId: "nonexistent",
      })) as ToolResult;
      expect(parseToolJson(result).found).toBe(false);
    });
  });
});

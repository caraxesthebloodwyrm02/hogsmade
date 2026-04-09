import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

function parseToolJson(raw: { content: Array<{ text: string }>; isError?: boolean }) {
  const first = JSON.parse(raw.content[0].text);
  if (raw.isError) return first;
  if (first && typeof first === "object" && "result" in first && "_meta" in first) {
    const inner = (first as { result: { content?: Array<{ text: string }> } }).result;
    if (inner?.content?.[0]?.text) {
      return JSON.parse(inner.content[0].text);
    }
    return inner as Record<string, unknown>;
  }
  return first;
}

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

describe("runner adapters", () => {
  let getAdapter: (type: string) => any;

  beforeAll(async () => {
    ({ getAdapter } = await import("../src/runner-adapters.ts"));
  });

  // ── Pytest adapter ──

  it("parses pytest summary line", () => {
    const adapter = getAdapter("pytest");
    const stdout = `
tests/unit/test_auth.py::test_login PASSED
tests/unit/test_auth.py::test_logout PASSED
tests/unit/test_api.py::test_get FAILED
tests/unit/test_api.py::test_post PASSED

============================== 3 passed, 1 failed in 2.45s ==============================
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.durationMs).toBe(2450);
  });

  it("parses pytest with skipped and errors", () => {
    const adapter = getAdapter("pytest");
    const stdout = `
============================== 5 passed, 2 failed, 3 skipped, 1 error in 10.00s ==============================
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(3);
    expect(result.errors).toBe(1);
    expect(result.durationMs).toBe(10000);
  });

  it("falls back to counting PASSED/FAILED lines", () => {
    const adapter = getAdapter("pytest");
    const stdout = `
tests/test_a.py PASSED
tests/test_b.py PASSED
tests/test_c.py FAILED
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
  });

  // ── Vitest adapter ──

  it("parses vitest summary output", () => {
    const adapter = getAdapter("vitest");
    const stdout = `
 RUN  v4.1.2 /some/project

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  13:16:49
   Duration  285ms (transform 75ms, setup 0ms, import 25ms, tests 201ms, environment 0ms)
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.durationMs).toBe(285);
  });

  it("parses vitest with failures", () => {
    const adapter = getAdapter("vitest");
    const stdout = `
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 7 passed (10)
   Duration  1.23s
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(7);
    expect(result.failed).toBe(3);
    expect(result.durationMs).toBe(1230);
  });

  // ── Node test adapter ──

  it("parses node test runner TAP output", () => {
    const adapter = getAdapter("node-test");
    const stdout = `
TAP version 13
ok 1 - test one
ok 2 - test two
not ok 3 - test three
# tests 3
# pass 2
# fail 1
# skipped 0
# duration_ms 456
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.durationMs).toBe(456);
  });

  it("falls back to TAP ok/not ok lines", () => {
    const adapter = getAdapter("node-test");
    const stdout = `
ok 1 - alpha
ok 2 - beta
not ok 3 - gamma
ok 4 - delta
`;
    const result = adapter.parseOutput(stdout, "");
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
  });

  it("throws for unknown runner type", () => {
    expect(() => getAdapter("unknown-runner")).toThrow("No adapter for runner type");
  });
});

describe("executor tools", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-executor-"));
  let buildServer!: () => unknown;
  let unstubFetch: (() => void) | undefined;

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

    const oriDataDir = path.join(tempRoot, ".ori");
    const echoesDataDir = path.join(tempRoot, ".echoes");
    process.env.ORI_DATA_DIR = oriDataDir;
    process.env.ECHOES_DATA_DIR = echoesDataDir;
    process.env.ECHOES_AUDIT_PATH = path.join(echoesDataDir, "audit.ndjson");

    mkdirSync(echoesDataDir, { recursive: true });
    writeFileSync(process.env.ECHOES_AUDIT_PATH, "", "utf-8");

    ({ buildServer } = (await import("../src/server.ts")) as {
      buildServer: () => unknown;
    });
  });

  afterAll(() => {
    unstubFetch?.();
    delete process.env.ORI_DATA_DIR;
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers execution tools", () => {
    const tools = getToolNames(buildServer() as TestServer);
    expect(tools).toEqual(
      expect.arrayContaining(["run_tests", "run_all_tests", "get_run_result", "list_runs"]),
    );
    expect(tools.length).toBe(23);
  });

  it("run_tests executes ori-server smoke tests (filtered to avoid recursion)", async () => {
    const server = buildServer() as TestServer;
    // Use filter to run only smoke.test.ts — running all tests would recurse into executor.test.ts
    const result = (await invokeTool(server, "run_tests", {
      projectId: "mcp-ori-server",
      filter: "tests/smoke.test.ts",
      timeoutSeconds: 30,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).not.toBe(true);
    const payload = parseToolJson(result);
    expect(payload.runId).toBeDefined();
    expect(payload.projectId).toBe("mcp-ori-server");
    expect(payload.status).toBe("passed");
    expect(payload.summary.passed).toBeGreaterThan(0);
    expect(payload.summary.durationMs).toBeGreaterThan(0);
  }, 60000);

  it("run_tests returns error for unknown project", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "run_tests", {
      projectId: "nonexistent",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const payload = parseToolJson(result);
    expect(payload.error).toContain("not found");
  });

  it("get_run_result retrieves a completed run", async () => {
    const server = buildServer() as TestServer;

    // First run a test to get a run ID (filtered to avoid recursion)
    const runResult = (await invokeTool(server, "run_tests", {
      projectId: "mcp-ori-server",
      filter: "tests/smoke.test.ts",
      timeoutSeconds: 30,
    })) as { content: Array<{ text: string }> };
    const runPayload = parseToolJson(runResult);
    const runId = runPayload.runId;

    // Now retrieve it
    const getResult = (await invokeTool(server, "get_run_result", {
      runId,
      includeStdout: true,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(getResult);
    expect(payload.id).toBe(runId);
    expect(payload.projectId).toBe("mcp-ori-server");
    expect(payload.summary).toBeDefined();
    expect(payload.rawStdout).toBeDefined();
    expect(payload.rawStdout.length).toBeGreaterThan(0);
  }, 60000);

  it("get_run_result returns error for unknown run", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "get_run_result", {
      runId: "run_nonexistent",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
  });

  it("list_runs shows completed runs", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "list_runs", {
      limit: 10,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.runs.length).toBeGreaterThan(0);
    expect(payload.runs[0].runId).toBeDefined();
    expect(payload.runs[0].projectId).toBeDefined();
    expect(payload.runs[0].status).toBeDefined();
  });

  it("list_runs filters by projectId", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "list_runs", {
      projectId: "mcp-ori-server",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.runs.every((r: { projectId: string }) => r.projectId === "mcp-ori-server")).toBe(
      true,
    );
  });

  it("registry health updated after test run", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "get_project", {
      projectId: "mcp-ori-server",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.healthStatus).toBe("healthy");
    expect(payload.lastRunTimestamp).toBeDefined();
    expect(payload.lastRunSummary).toBeDefined();
    expect(payload.lastRunSummary.passed).toBeGreaterThan(0);
  });
});

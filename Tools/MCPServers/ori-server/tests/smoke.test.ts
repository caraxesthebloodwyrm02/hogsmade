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

const SAMPLE_LOG_LINES = [
  "PASS tests/unit/auth.test.ts",
  "FAIL tests/integration/api.test.ts",
  "AssertionError: expected 200 but received 500",
  "TimeoutError: Exceeded timeout of 5000ms",
  "console.warn: DeprecationWarning: use of legacy API",
  "TypeError: Cannot read properties of undefined (reading 'map')",
  "ECONNREFUSED 127.0.0.1:8080",
  "UnhandledPromiseRejection: something went wrong",
  "Test skipped: pending migration",
  "Flaky test retried 3 times before passing",
  "Possible memory leak detected in event emitter",
  "Race condition: concurrent modification on shared state",
  "console.error: Unhandled error in middleware",
  "PASS tests/unit/utils.test.ts",
  "WARN: This method will be removed in v3.0",
];

describe("ori-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-server-"));
  let buildServer!: () => unknown;
  let unstubFetch: (() => void) | undefined;

  beforeAll(async () => {
    const origFetch = globalThis.fetch;
    process.env.GRID_API_URL = "http://127.0.0.1:59998";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/admission/check-permission")) {
        return new Response(
          JSON.stringify({
            allowed: true,
            entity_id: "mcp:ori-server:smoke",
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
      return origFetch(input, init);
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

  it("registers expected tools", () => {
    expect(getToolNames(buildServer() as TestServer)).toEqual(
      expect.arrayContaining([
        "health_check",
        "collect_logs",
        "filter_logs",
        "probe_test_suite",
        "get_recommendations",
        "list_collected",
        "clear_logs",
      ]),
    );
  });

  it("reports healthy status on health_check", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "health_check", {})) as {
      content: Array<{ text: string }>;
    };
    const payload = parseToolJson(result);
    expect(payload.status).toBe("ok");
    expect(payload.server).toBe("ori-server");
    expect(payload.riskPatterns.length).toBeGreaterThan(0);
  });

  it("collects and classifies log lines", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "collect_logs", {
      lines: SAMPLE_LOG_LINES,
      source: "smoke-test-suite",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).not.toBe(true);
    const payload = parseToolJson(result);
    expect(payload.collected).toBe(true);
    expect(payload.linesIngested).toBe(SAMPLE_LOG_LINES.length);
    expect(payload.signalsDetected).toBeGreaterThan(0);
    expect(payload.criticalCount).toBeGreaterThan(0);
    expect(payload.warningCount).toBeGreaterThan(0);
  });

  it("filters logs by severity", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "filter_logs", {
      severity: ["critical"],
      sortBy: "severity",
      sortOrder: "desc",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.totalMatched).toBeGreaterThan(0);
    expect(payload.entries.every((e: { severity: string }) => e.severity === "critical")).toBe(
      true,
    );
  });

  it("filters logs by pattern ID", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "filter_logs", {
      patternIds: ["deprecation"],
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.totalMatched).toBeGreaterThan(0);
    expect(
      payload.entries.every((e: { matchedPatterns: string[] }) =>
        e.matchedPatterns.includes("deprecation"),
      ),
    ).toBe(true);
  });

  it("probes test suite and returns risk summary", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "probe_test_suite", {
      source: "smoke-test-suite",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.totalLines).toBeGreaterThan(0);
    expect(payload.riskSignals).toBeGreaterThan(0);
    expect(payload.topPatterns.length).toBeGreaterThan(0);
    expect(payload.timeWindow.start).toBeDefined();
    expect(payload.timeWindow.end).toBeDefined();
  });

  it("generates actionable recommendations", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "get_recommendations", {
      save: false,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.totalRecommendations).toBeGreaterThan(0);
    expect(payload.recommendations.length).toBeGreaterThan(0);

    const first = payload.recommendations[0];
    expect(first.title).toBeDefined();
    expect(first.read).toBeDefined();
    expect(first.reason).toBeDefined();
    expect(first.action).toBeDefined();
    expect(first.reproducibility).toBeDefined();
    expect(first.severity).toBeDefined();
    expect(first.relatedPatterns.length).toBeGreaterThan(0);
  });

  it("lists collected logs with sorting and pagination", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "list_collected", {
      sortBy: "severity",
      sortOrder: "desc",
      limit: 5,
      offset: 0,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.total).toBe(SAMPLE_LOG_LINES.length);
    expect(payload.showing).toBeLessThanOrEqual(5);
    expect(payload.offset).toBe(0);
    expect(payload.limit).toBe(5);
  });

  it("clears logs with confirmation phrase", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "clear_logs", {
      confirm: "CLEAR-ORI-LOGS",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.cleared).toBe(true);
    expect(payload.entriesRemoved).toBe(SAMPLE_LOG_LINES.length);

    const afterClear = (await invokeTool(server, "list_collected", {})) as {
      content: Array<{ text: string }>;
    };
    const afterPayload = parseToolJson(afterClear);
    expect(afterPayload.total).toBe(0);
  });

  it("produces recommendations after fresh collection", async () => {
    const server = buildServer() as TestServer;

    await invokeTool(server, "collect_logs", {
      lines: [
        "AssertionError: expected true to be false",
        "TimeoutError: Exceeded timeout of 3000ms",
        "PASS tests/basic.test.ts",
        "console.warn: deprecated API usage",
      ],
      source: "fresh-suite",
    });

    const probe = (await invokeTool(server, "probe_test_suite", {
      source: "fresh-suite",
    })) as { content: Array<{ text: string }> };
    const probePayload = parseToolJson(probe);
    expect(probePayload.criticalCount).toBeGreaterThanOrEqual(2);

    const recs = (await invokeTool(server, "get_recommendations", {
      source: "fresh-suite",
      save: true,
    })) as { content: Array<{ text: string }> };
    const recPayload = parseToolJson(recs);
    expect(recPayload.totalRecommendations).toBeGreaterThan(0);
    expect(recPayload.criticalCount).toBeGreaterThan(0);
  });
});

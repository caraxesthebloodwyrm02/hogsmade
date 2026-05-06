import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProjectEntry } from "../src/types.js";

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

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

// ── Unit tests: threat-model module ──

describe("threat model parser", () => {
  let parseThreatModel: typeof import("../src/threat-model.js").parseThreatModel;
  let buildCoverageMap: typeof import("../src/threat-model.js").buildCoverageMap;
  let routeThreatToTests: typeof import("../src/threat-model.js").routeThreatToTests;

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-threat-"));

  beforeAll(async () => {
    process.env.ORI_DATA_DIR = path.join(tempRoot, ".ori");
    mkdirSync(process.env.ORI_DATA_DIR, { recursive: true });

    ({ parseThreatModel, buildCoverageMap, routeThreatToTests } =
      await import("../src/threat-model.ts"));
  });

  afterAll(() => {
    delete process.env.ORI_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("parses threat model from fixture markdown", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    writeFileSync(
      fixture,
      [
        "# CascadeProjects Threat Model",
        "",
        "| ID | Source | Prerequisites | Action | Impact | Assets | Controls | Gaps | Mitigations | Detection | Likelihood | Severity | Priority |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        "| TM-001 | External | None | Exploit API | Data loss | API server | Auth | None | Rate limit | Logs | High | Critical | High |",
        "| TM-002 | Internal | Admin access | Modify config | Service outage | Config store | RBAC | Audit lag | Review process | Alert | Medium | High | Medium |",
        "| TM-003 | [Vendor](https://example.com) | API key | Supply chain | Integrity breach | Pipeline | Checksum | Key rotation | Pin versions | Monitor | Low | Medium | Low |",
        "",
        "## Focus paths",
        "",
        "| Path | Reason | Related threats |",
        "|---|---|---|",
        "| [/src/api/auth.ts](link) | Authentication entry point | TM-001, TM-002 |",
        "| /src/config/loader.ts | Config mutation surface | TM-002 |",
        "",
      ].join("\n"),
      "utf-8",
    );

    const model = await parseThreatModel(fixture);

    expect(model.threats).toHaveLength(3);
    expect(model.threats[0].id).toBe("TM-001");
    expect(model.threats[0].source).toBe("External");
    expect(model.threats[0].priority).toBe("High");
    expect(model.threats[0].mitigations).toBe("Rate limit");
    expect(model.threats[1].id).toBe("TM-002");
    expect(model.threats[1].impact).toBe("Service outage");
    expect(model.threats[2].id).toBe("TM-003");
    // Markdown link stripped
    expect(model.threats[2].source).toBe("Vendor");
    expect(model.parsedAt).toBeDefined();
  });

  it("parses focus paths with markdown links and threat IDs", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    // Reuse fixture from above — already written
    const model = await parseThreatModel(fixture);

    expect(model.focusPaths).toHaveLength(2);
    expect(model.focusPaths[0].path).toBe("/src/api/auth.ts");
    expect(model.focusPaths[0].threatIds).toEqual(["TM-001", "TM-002"]);
    expect(model.focusPaths[1].path).toBe("/src/config/loader.ts");
    expect(model.focusPaths[1].threatIds).toEqual(["TM-002"]);
  });

  it("handles empty threat model gracefully", async () => {
    const empty = path.join(tempRoot, "empty-threats.md");
    writeFileSync(empty, "# No threats here\n\nJust some text.\n", "utf-8");

    const model = await parseThreatModel(empty);
    expect(model.threats).toHaveLength(0);
    expect(model.focusPaths).toHaveLength(0);
  });

  it("caches parsed model to disk", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    await parseThreatModel(fixture);

    const { readFileSync } = await import("fs");
    const cachePath = path.join(process.env.ORI_DATA_DIR!, "threat-model", "parsed.json");
    const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(cached.threats).toHaveLength(3);
    expect(cached.parsedAt).toBeDefined();
  });

  // ── Coverage map ──

  it("builds coverage map with full coverage", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    const model = await parseThreatModel(fixture);

    const projects: ProjectEntry[] = [
      {
        id: "proj-a",
        name: "Project A",
        location: "/tmp/a",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp/a" },
        approxTestFiles: 5,
        tags: ["typescript"],
        threatModelIds: ["TM-001", "TM-002"],
        healthStatus: "healthy",
        lastRunTimestamp: new Date().toISOString(),
      },
      {
        id: "proj-b",
        name: "Project B",
        location: "/tmp/b",
        runner: { type: "pytest", command: "uv", args: ["run", "pytest"], cwd: "/tmp/b" },
        approxTestFiles: 3,
        tags: ["python"],
        threatModelIds: ["TM-003"],
        healthStatus: "healthy",
        lastRunTimestamp: new Date().toISOString(),
      },
    ];

    const coverage = buildCoverageMap(projects, model);
    expect(coverage.totalThreats).toBe(3);
    expect(coverage.threatsWithCoverage).toBe(3);
    expect(coverage.threatsWithoutCoverage).toBe(0);
  });

  it("identifies threats without project coverage", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    const model = await parseThreatModel(fixture);

    // Only cover TM-001, leave TM-002 and TM-003 uncovered
    const projects: ProjectEntry[] = [
      {
        id: "proj-a",
        name: "Project A",
        location: "/tmp/a",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp/a" },
        approxTestFiles: 5,
        tags: ["typescript"],
        threatModelIds: ["TM-001"],
        healthStatus: "healthy",
        lastRunTimestamp: new Date().toISOString(),
      },
    ];

    const coverage = buildCoverageMap(projects, model);
    expect(coverage.threatsWithCoverage).toBe(1);
    expect(coverage.threatsWithoutCoverage).toBe(2);

    const uncovered = coverage.mappings.filter((m) => m.coveredByProjects.length === 0);
    expect(uncovered).toHaveLength(2);
    expect(uncovered.map((m) => m.threatId)).toEqual(["TM-002", "TM-003"]);
  });

  it("flags covering projects with no recent healthy run", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    const model = await parseThreatModel(fixture);

    const projects: ProjectEntry[] = [
      {
        id: "proj-stale",
        name: "Stale Project",
        location: "/tmp/stale",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp/stale" },
        approxTestFiles: 2,
        tags: ["typescript"],
        threatModelIds: ["TM-001"],
        healthStatus: "failing",
      },
    ];

    const coverage = buildCoverageMap(projects, model);
    const tm001 = coverage.mappings.find((m) => m.threatId === "TM-001")!;
    expect(tm001.coveredByProjects).toContain("proj-stale");
    expect(tm001.uncoveredGaps.length).toBeGreaterThan(0);
    expect(tm001.uncoveredGaps[0]).toContain("no recent healthy run");
  });

  // ── Threat routing ──

  it("routes threat to matching projects and focus paths", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    const model = await parseThreatModel(fixture);

    const projects: ProjectEntry[] = [
      {
        id: "proj-a",
        name: "Project A",
        location: "/tmp/a",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp/a" },
        approxTestFiles: 5,
        tags: ["typescript"],
        threatModelIds: ["TM-001", "TM-002"],
      },
    ];

    const result = routeThreatToTests("TM-001", projects, model);
    expect(result.threat).not.toBeNull();
    expect(result.threat!.id).toBe("TM-001");
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe("proj-a");
    expect(result.focusPaths.length).toBeGreaterThan(0);
    expect(result.focusPaths[0].threatIds).toContain("TM-001");
  });

  it("returns null threat for unknown ID", async () => {
    const fixture = path.join(tempRoot, "threat-model.md");
    const model = await parseThreatModel(fixture);

    const result = routeThreatToTests("TM-999", [], model);
    expect(result.threat).toBeNull();
    expect(result.projects).toHaveLength(0);
    expect(result.focusPaths).toHaveLength(0);
  });
});

// ── MCP tool integration tests ──

describe("threat model tools", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-threat-tools-"));
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

  it("registers Phase 3 tools", () => {
    const server = buildServer() as TestServer;
    const tools = Object.keys(server._registeredTools);
    expect(tools).toEqual(
      expect.arrayContaining([
        "parse_threat_model",
        "map_threats",
        "get_threat_coverage_heatmap",
        "generate_report",
        "get_coverage_gaps",
      ]),
    );
    expect(tools.length).toBe(29);
  });

  it("get_threat_coverage_heatmap returns grid payload", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "get_threat_coverage_heatmap", {
      maxThreats: 20,
      maxProjects: 15,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.kind).toBe("threat_project_coverage");
    expect(payload.axes?.rowKind).toBe("threat");
    expect(payload.axes?.colKind).toBe("project");
    expect(Array.isArray(payload.axes?.rowIds)).toBe(true);
    expect(Array.isArray(payload.axes?.colIds)).toBe(true);
    expect(Array.isArray(payload.cells)).toBe(true);
    expect(payload.cells.length).toBe(payload.axes.rowIds.length * payload.axes.colIds.length);
    expect(Array.isArray(payload.legend)).toBe(true);
    expect(payload.truncated).toBeDefined();
  });

  it("map_threats returns coverage map via tool", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "map_threats", {})) as {
      content: Array<{ text: string }>;
    };

    const payload = parseToolJson(result);
    // Returns full coverage map when no filters given
    expect(payload.totalThreats).toBeDefined();
    expect(payload.mappings).toBeDefined();
    expect(Array.isArray(payload.mappings)).toBe(true);
  });

  it("map_threats filters by projectId", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "map_threats", {
      projectId: "grid-main",
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.projectId).toBe("grid-main");
    expect(payload.projectName).toBe("GRID-main");
    expect(payload.threatCount).toBeGreaterThan(0);
    expect(payload.threats).toBeDefined();
  });

  it("map_threats returns error for unknown project", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "map_threats", {
      projectId: "nonexistent",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const payload = parseToolJson(result);
    expect(payload.error).toContain("not found");
  });

  it("get_coverage_gaps returns gap analysis", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "get_coverage_gaps", {})) as {
      content: Array<{ text: string }>;
    };

    const payload = parseToolJson(result);
    expect(payload.totalThreats).toBeDefined();
    expect(payload.threatsWithGaps).toBeDefined();
    expect(Array.isArray(payload.gaps)).toBe(true);
  });

  it("generate_report produces a report", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "generate_report", {
      publish: false,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.reportPath).toBeDefined();
    expect(payload.sections).toBeGreaterThan(0);
    expect(payload.totalLines).toBeGreaterThan(0);
    expect(payload.projectCount).toBeGreaterThan(0);
  });
});

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

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

// ── Unit tests: notebook module ──

describe("notebook module", () => {
  let appendNote: typeof import("../src/notebook.js").appendNote;
  let queryNotes: typeof import("../src/notebook.js").queryNotes;
  let getRecentNotes: typeof import("../src/notebook.js").getRecentNotes;
  let getNotesByTag: typeof import("../src/notebook.js").getNotesByTag;
  let getNotesByProject: typeof import("../src/notebook.js").getNotesByProject;
  let getNotebookSummary: typeof import("../src/notebook.js").getNotebookSummary;

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-notebook-"));

  beforeAll(async () => {
    process.env.ORI_DATA_DIR = path.join(tempRoot, ".ori");
    mkdirSync(process.env.ORI_DATA_DIR, { recursive: true });

    ({
      appendNote,
      queryNotes,
      getRecentNotes,
      getNotesByTag,
      getNotesByProject,
      getNotebookSummary,
    } = await import("../src/notebook.ts"));
  });

  afterAll(() => {
    delete process.env.ORI_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("appends and retrieves a note", async () => {
    const note = await appendNote({
      category: "observation",
      title: "Test observation",
      body: "Saw a flaky test in proj-alpha",
      tags: ["flaky", "alpha"],
      source: "test",
    });

    expect(note.id).toMatch(/^note-/);
    expect(note.timestamp).toBeDefined();
    expect(note.category).toBe("observation");

    const all = await queryNotes();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.find((n) => n.id === note.id)).toBeDefined();
  });

  it("appends notes with different categories", async () => {
    await appendNote({
      category: "decision",
      title: "Chose vitest over jest",
      body: "vitest is faster for ESM projects",
      tags: ["tooling"],
      source: "user",
    });

    await appendNote({
      category: "anomaly",
      title: "Memory spike in beta",
      body: "Test suite used 2GB unexpectedly",
      tags: ["memory", "beta"],
      projectId: "proj-beta",
      source: "executor",
    });

    const all = await queryNotes();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("filters by category", async () => {
    const decisions = await queryNotes({ category: "decision" });
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions.every((n) => n.category === "decision")).toBe(true);
  });

  it("filters by tags", async () => {
    const flaky = await getNotesByTag(["flaky"]);
    expect(flaky.length).toBeGreaterThanOrEqual(1);
    expect(flaky.every((n) => n.tags.includes("flaky"))).toBe(true);
  });

  it("filters by project ID", async () => {
    const betaNotes = await getNotesByProject("proj-beta");
    expect(betaNotes.length).toBeGreaterThanOrEqual(1);
    expect(betaNotes.every((n) => n.projectId === "proj-beta")).toBe(true);
  });

  it("returns recent notes in reverse chronological order", async () => {
    const recent = await getRecentNotes(10);
    expect(recent.length).toBeGreaterThanOrEqual(1);

    // Verify order: most recent first
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1].timestamp >= recent[i].timestamp).toBe(true);
    }
  });

  it("respects limit parameter", async () => {
    const limited = await queryNotes({ limit: 1 });
    expect(limited.length).toBe(1);
  });

  it("returns empty for non-matching filters", async () => {
    const empty = await queryNotes({ projectId: "nonexistent-project" });
    expect(empty).toHaveLength(0);
  });

  it("summary returns correct aggregation", async () => {
    const summary = await getNotebookSummary();

    expect(summary.totalNotes).toBeGreaterThanOrEqual(3);
    expect(summary.byCategory["observation"]).toBeGreaterThanOrEqual(1);
    expect(summary.byCategory["decision"]).toBeGreaterThanOrEqual(1);
    expect(summary.byCategory["anomaly"]).toBeGreaterThanOrEqual(1);
    expect(summary.oldestTimestamp).toBeDefined();
    expect(summary.newestTimestamp).toBeDefined();
    expect(summary.uniqueTags.length).toBeGreaterThan(0);
  });

  it("filters by time range", async () => {
    const farFuture = await queryNotes({ since: "2099-01-01T00:00:00.000Z" });
    expect(farFuture).toHaveLength(0);

    const farPast = await queryNotes({ until: "2000-01-01T00:00:00.000Z" });
    expect(farPast).toHaveLength(0);

    const allTime = await queryNotes({
      since: "2020-01-01T00:00:00.000Z",
      until: "2099-01-01T00:00:00.000Z",
    });
    expect(allTime.length).toBeGreaterThanOrEqual(3);
  });
});

// ── MCP tool integration tests ──

describe("notebook tools", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-notebook-tools-"));
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

  it("registers Phase 4 tools", () => {
    const server = buildServer() as TestServer;
    const tools = Object.keys(server._registeredTools);
    expect(tools).toEqual(
      expect.arrayContaining([
        "notebook_add",
        "notebook_query",
        "notebook_summary",
        "ecosystem_context",
      ]),
    );
    expect(tools.length).toBe(25);
  });

  it("notebook_add creates a note via tool", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "notebook_add", {
      category: "observation",
      title: "Tool test note",
      body: "Created via MCP tool",
      tags: ["test", "mcp"],
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.id).toMatch(/^note-/);
    expect(payload.category).toBe("observation");
    expect(payload.title).toBe("Tool test note");
  });

  it("notebook_query retrieves notes via tool", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "notebook_query", {
      category: "observation",
      limit: 5,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.total).toBeGreaterThanOrEqual(1);
    expect(payload.notes[0].category).toBe("observation");
  });

  it("notebook_summary returns overview via tool", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "notebook_summary", {})) as {
      content: Array<{ text: string }>;
    };

    const payload = parseToolJson(result);
    expect(payload.totalNotes).toBeGreaterThanOrEqual(1);
    expect(payload.byCategory).toBeDefined();
  });

  it("ecosystem_context returns aggregated data via tool", async () => {
    const server = buildServer() as TestServer;
    const result = (await invokeTool(server, "ecosystem_context", {
      includeRecentEvents: false,
    })) as { content: Array<{ text: string }> };

    const payload = parseToolJson(result);
    expect(payload.collectedAt).toBeDefined();
    expect(payload.echoes).toBeDefined();
    expect(payload.seeds).toBeDefined();
    expect(payload.seeds.snapshotCount).toBeDefined();
  });
});

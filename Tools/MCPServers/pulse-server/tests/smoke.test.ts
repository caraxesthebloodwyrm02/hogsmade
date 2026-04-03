import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Unwrap merit-guard `{ result, _meta }` when present; otherwise parse handler JSON body. */
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

describe("pulse-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pulse-server-"));
  let buildServer!: () => unknown;
  let unstubFetch: (() => void) | undefined;

  beforeAll(async () => {
    const origFetch = globalThis.fetch;
    process.env.GRID_API_URL = "http://127.0.0.1:59999";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/admission/check-permission")) {
        return new Response(
          JSON.stringify({
            allowed: true,
            entity_id: "mcp:pulse-server:smoke",
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

    const pulseDataDir = path.join(tempRoot, ".pulse");
    const echoesDataDir = path.join(tempRoot, ".echoes");
    const afloatDataDir = path.join(tempRoot, ".afloat");
    const seedsDataDir = path.join(tempRoot, ".seeds-server");

    process.env.PULSE_DATA_DIR = pulseDataDir;
    process.env.ECHOES_DATA_DIR = echoesDataDir;
    process.env.ECHOES_AUDIT_PATH = path.join(echoesDataDir, "audit.ndjson");
    process.env.AFLOAT_DATA_DIR = afloatDataDir;
    process.env.SEEDS_DATA_DIR = seedsDataDir;

    mkdirSync(path.join(echoesDataDir, "telemetry"), { recursive: true });
    mkdirSync(path.join(afloatDataDir, "history"), { recursive: true });
    mkdirSync(path.join(seedsDataDir, "snapshots"), { recursive: true });

    writeFileSync(
      process.env.ECHOES_AUDIT_PATH,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "lots-server",
        tool: "experiment_run",
        status: "failure",
        metadata: { relatedRepo: "GRID-main", name: "rag-perf-test" },
      })}\n`,
      "utf-8",
    );
    const now = Date.now();
    writeFileSync(
      path.join(seedsDataDir, "snapshots", "snapshot-zzzz-old.json"),
      JSON.stringify({
        timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        overallScore: 10,
        repos: [
          {
            name: "GRID-main",
            healthScore: 10,
            issues: ["legacy stale snapshot"],
          },
        ],
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(seedsDataDir, "snapshots", "snapshot-0001-new.json"),
      JSON.stringify({
        timestamp: new Date(now).toISOString(),
        overallScore: 55,
        repos: [
          {
            name: "GRID",
            healthScore: 55,
            issues: ["stale branch", "uncommitted changes"],
          },
        ],
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(afloatDataDir, "history", "execution-1.json"),
      JSON.stringify({
        executionId: "exec-1",
        workflowId: "wf-maintenance",
        status: "failed",
        startedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    ({ buildServer } = (await import("../src/server.ts")) as {
      buildServer: () => unknown;
    });
  });

  afterAll(() => {
    unstubFetch?.();
    delete process.env.PULSE_DATA_DIR;
    delete process.env.ECHOES_DATA_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.AFLOAT_DATA_DIR;
    delete process.env.SEEDS_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers expected tools", () => {
    expect(getToolNames(buildServer() as TestServer)).toEqual(
      expect.arrayContaining([
        "health_check",
        "morning_briefing",
        "check_alerts",
        "what_should_i_work_on",
        "journal_add",
        "journal_list",
        "focus_start",
        "focus_status",
        "focus_interrupt",
        "focus_end",
        "daily_digest",
      ]),
    );
  });

  it("correlates health, failures, and workflows", async () => {
    const server = buildServer() as TestServer;
    const briefing = (await invokeTool(server, "morning_briefing", {})) as {
      content: Array<{ text: string }>;
    };
    const alerts = (await invokeTool(server, "check_alerts", {
      healthThreshold: 70,
    })) as { content: Array<{ text: string }> };
    const priorities = (await invokeTool(server, "what_should_i_work_on", {})) as {
      content: Array<{ text: string }>;
    };

    const briefingPayload = parseToolJson(briefing);
    const alertsPayload = parseToolJson(alerts);
    const prioritiesPayload = parseToolJson(priorities);

    expect(briefingPayload.priorities.length).toBeGreaterThan(0);
    expect(briefingPayload.correlations.length).toBeGreaterThan(0);
    expect(alertsPayload.alertCount).toBeGreaterThan(0);
    expect(prioritiesPayload.items.length).toBeGreaterThan(0);
    expect(briefingPayload.ecosystem.snapshot.sourceFile).toBe("snapshot-0001-new.json");
    expect(prioritiesPayload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          priority: "high",
          title: expect.stringContaining("failure linked to GRID"),
        }),
      ]),
    );
  });

  it("skips briefing sections listed in preferences", async () => {
    const server = buildServer() as TestServer;
    // Set preferences to skip overnightActivity and correlations
    await invokeTool(server, "briefing_preferences_set", {
      skippedBriefingSections: ["overnightActivity", "correlations"],
      promotedSignals: [],
    });

    const briefing = (await invokeTool(server, "morning_briefing", {})) as {
      content: Array<{ text: string }>;
    };
    const payload = parseToolJson(briefing);

    // Skipped sections should be absent
    expect(payload).not.toHaveProperty("overnightActivity");
    expect(payload).not.toHaveProperty("correlations");
    // Non-skipped sections should still be present
    expect(payload).toHaveProperty("ecosystem");
    expect(payload).toHaveProperty("currentState");
    expect(payload).toHaveProperty("priorities");
    expect(payload).toHaveProperty("warnings");
    // Preferences should always be included
    expect(payload).toHaveProperty("preferences");
  });

  it("promotes matching priorities via promotedSignals", async () => {
    const server = buildServer() as TestServer;
    // Set preferences to promote "ecosystem" signals
    await invokeTool(server, "briefing_preferences_set", {
      skippedBriefingSections: [],
      promotedSignals: ["ecosystem"],
    });

    const briefing = (await invokeTool(server, "morning_briefing", {})) as {
      content: Array<{ text: string }>;
    };
    const payload = parseToolJson(briefing) as { priorities: string[] };
    const priorities: string[] = payload.priorities;

    // Find the ecosystem-related priority and verify it comes first
    const ecosystemIndex = priorities.findIndex((p) => p.toLowerCase().includes("ecosystem"));
    const nonEcosystemIndex = priorities.findIndex((p) => !p.toLowerCase().includes("ecosystem"));
    // If both exist, ecosystem should come before non-ecosystem
    if (ecosystemIndex >= 0 && nonEcosystemIndex >= 0) {
      expect(ecosystemIndex).toBeLessThan(nonEcosystemIndex);
    }
  });

  it("tracks focus lifecycle with interruption and archive behavior", async () => {
    const server = buildServer() as TestServer;

    const start = (await invokeTool(server, "focus_start", {
      task: "Implement high-risk tests",
      project: "CascadeProjects",
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(start.isError).not.toBe(true);

    const duplicateStart = (await invokeTool(server, "focus_start", {
      task: "Should fail while active",
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(duplicateStart.isError).toBe(true);

    const interrupt = (await invokeTool(server, "focus_interrupt", {})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    const interruptPayload = parseToolJson(interrupt);
    expect(interruptPayload.recorded).toBe(true);
    expect(interruptPayload.interruptions).toBe(1);

    const end = (await invokeTool(server, "focus_end", {
      outcome: "Added regression tests",
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(end.isError).not.toBe(true);
    const endPayload = parseToolJson(end);
    expect(endPayload.completed).toBe(true);
    expect(endPayload.session.interruptions).toBe(1);
    expect(endPayload.journalUpdated).toBe(true);

    const postEndInterrupt = (await invokeTool(server, "focus_interrupt", {})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(postEndInterrupt.isError).toBe(true);
  });

  it("reports focus status with and without an active session", async () => {
    const server = buildServer() as TestServer;

    const idle = (await invokeTool(server, "focus_status", {})) as {
      content: Array<{ text: string }>;
    };
    const idlePayload = parseToolJson(idle);
    expect(idlePayload.active).toBe(false);
    expect(idlePayload.session).toBeNull();

    await invokeTool(server, "focus_start", {
      task: "Implement dashboard sync",
      project: "glimpse-artifact",
    });

    const active = (await invokeTool(server, "focus_status", {})) as {
      content: Array<{ text: string }>;
    };
    const activePayload = parseToolJson(active);
    expect(activePayload.active).toBe(true);
    expect(activePayload.session).toMatchObject({
      workflowName: "glimpse-artifact — Implement dashboard sync",
      status: "running",
    });
    expect(activePayload.session.steps.map((step: { name: string }) => step.name)).toEqual([
      "Declared focus",
      "Deep work",
      "Archive session",
    ]);

    await invokeTool(server, "focus_end", {
      outcome: "Completed dashboard wiring",
    });
  });

  it("persists journal entries and returns them via journal_list", async () => {
    const server = buildServer() as TestServer;
    const add = (await invokeTool(server, "journal_add", {
      entry: "Hardened maintenance cleanup tests",
      mood: "focused",
      tags: ["test", "coverage"],
      linkedServer: "maintain-server",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(add.isError).not.toBe(true);
    const addPayload = parseToolJson(add);
    expect(addPayload.recorded).toBe(true);
    expect(addPayload.id).toBeTruthy();

    const list = (await invokeTool(server, "journal_list", {})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(list.isError).not.toBe(true);
    const listPayload = parseToolJson(list);
    expect(listPayload.count).toBeGreaterThan(0);
    expect(
      listPayload.entries.some(
        (entry: { id: string; entry: string }) =>
          entry.id === addPayload.id && entry.entry.includes("Hardened"),
      ),
    ).toBe(true);
  });

  it("generates daily_digest including focus/journal activity", async () => {
    const server = buildServer() as TestServer;

    await invokeTool(server, "focus_start", {
      task: "Digest prep session",
      project: "pulse-server",
    });
    await invokeTool(server, "focus_end", {
      outcome: "Prepared digest coverage",
    });

    await invokeTool(server, "journal_add", {
      entry: "Encountered minor blocker and resolved it",
      mood: "blocked",
      tags: ["digest"],
    });

    const digest = (await invokeTool(server, "daily_digest", {
      save: false,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(digest.isError).not.toBe(true);
    const payload = parseToolJson(digest);
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.journalEntries).toBeGreaterThan(0);
    expect(payload.focusSessions).toBeGreaterThan(0);
    expect(payload.totalFocusMinutes).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.highlights)).toBe(true);
    expect(Array.isArray(payload.tomorrowSuggestions)).toBe(true);
  });
});

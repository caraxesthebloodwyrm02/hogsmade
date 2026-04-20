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

  it("filters synthetic noise from work queue and morning briefing", async () => {
    const auditPath = process.env.ECHOES_AUDIT_PATH!;
    const now = new Date().toISOString();

    // Inject a mix of noise (9 entries) + real failure (1 entry)
    const entries = [
      // Noise: metadata.noise emitter tag (heuristic #1 — standalone)
      JSON.stringify({
        id: "aud-emitter-noise-1",
        timestamp: now,
        source: "grid-server",
        tool: "validate_envelope",
        status: "failure",
        metadata: {
          noise: "test-harness-probe",
          envelopePath: "/home/caraxes/GATE/incoming/e.json",
        },
      }),
      // Noise: synth- prefix (heuristic #2)
      JSON.stringify({
        id: "synth-noise-1",
        timestamp: now,
        source: "grid-server",
        tool: "validate_envelope",
        status: "failure",
        metadata: { envelopePath: "/home/caraxes/GATE/incoming/envelope_bad.json" },
      }),
      // Noise: known probe tool (heuristic #3)
      JSON.stringify({
        id: "aud-probe-1",
        timestamp: now,
        source: "echoes-server",
        tool: "tool_b",
        status: "failure",
        durationMs: 200,
      }),
      // Noise: /tmp/ envelopePath with normal id (heuristic #4 — isolated)
      JSON.stringify({
        id: "aud-tmp-path-1",
        timestamp: now,
        source: "grid-server",
        tool: "validate_envelope",
        status: "failure",
        metadata: { envelopePath: "/tmp/grid-server-xyz/GATE/incoming/envelope_test.json" },
      }),
      // Noise: GRID_BACKEND_UNAVAILABLE (reason_code variant)
      JSON.stringify({
        id: "aud-unavail-1",
        timestamp: now,
        source: "grid-server",
        tool: "admission_stats",
        status: "blocked",
        metadata: { reason_code: "GRID_BACKEND_UNAVAILABLE" },
      }),
      // Noise: instant mock scan
      JSON.stringify({
        id: "aud-scan-1",
        timestamp: now,
        source: "seeds-server",
        tool: "ecosystem_scan",
        status: "failure",
        durationMs: 0,
        metadata: { overallScore: 35 },
      }),
      // Noise: error message variant (no reason_code, older format)
      JSON.stringify({
        id: "aud-fetchfail-1",
        timestamp: now,
        source: "grid-server",
        tool: "admission_bannered_entities",
        status: "blocked",
        metadata: { error: "TypeError: fetch failed" },
      }),
      // Noise: merit_check pre-fix NO_GRID_API (score=0, verdict=denied)
      JSON.stringify({
        id: "aud-merit-stale-1",
        timestamp: now,
        source: "grid-server-merit-guard",
        tool: "merit_check",
        status: "blocked",
        metadata: { score: 0, verdict: "denied", actual_badge: "B0_RESTRICTED" },
      }),
      // Noise: evolution_promotion_blocked (cycle management, not defect)
      JSON.stringify({
        id: "aud-evo-1",
        timestamp: now,
        source: "eligibility-server",
        tool: "evolution_promotion_blocked",
        status: "blocked",
        metadata: { caseId: "test-cycle", beat: "balance" },
      }),
      // REAL: actual failure without noise markers
      JSON.stringify({
        id: "aud-real-1",
        timestamp: now,
        source: "lots-server",
        tool: "experiment_run",
        status: "failure",
        metadata: { relatedRepo: "GRID-main", name: "real-failure" },
      }),
    ];
    writeFileSync(auditPath, entries.join("\n") + "\n", "utf-8");

    const server = buildServer() as TestServer;

    // Test what_should_i_work_on
    const priorities = (await invokeTool(server, "what_should_i_work_on", {})) as {
      content: Array<{ text: string }>;
    };
    const pPayload = parseToolJson(priorities);
    expect(pPayload.noiseFiltered).toBe(9);
    // The 1 real failure should appear in items
    expect(pPayload.items.length).toBeGreaterThan(0);
    const realItem = pPayload.items.find(
      (item: Record<string, unknown>) =>
        typeof item.title === "string" && item.title.includes("experiment_run"),
    );
    expect(realItem).toBeDefined();

    // Test morning_briefing
    const briefing = (await invokeTool(server, "morning_briefing", {})) as {
      content: Array<{ text: string }>;
    };
    const bPayload = parseToolJson(briefing);
    // Noise count should be reported in warnings
    const noiseWarning = bPayload.warnings?.find(
      (w: string) => typeof w === "string" && w.includes("noise"),
    );
    expect(noiseWarning).toBeDefined();
    expect(noiseWarning).toContain("9");

    // Test check_alerts surfaces noise count
    const alerts = (await invokeTool(server, "check_alerts", {
      healthThreshold: 70,
    })) as { content: Array<{ text: string }> };
    const aPayload = parseToolJson(alerts);
    expect(aPayload.noiseFiltered).toBe(9);
  });
});

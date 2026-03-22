import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestServer = {
  _registeredTools: Record<
    string,
    { inputSchema?: unknown; handler: (...args: any[]) => unknown }
  >;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {},
) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema
    ? await tool.handler(args, {} as any)
    : await tool.handler({} as any);
}

describe("pulse-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "pulse-server-"));
  let buildServer!: () => unknown;

  beforeAll(async () => {
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
    const priorities = (await invokeTool(
      server,
      "what_should_i_work_on",
      {},
    )) as { content: Array<{ text: string }> };

    const briefingPayload = JSON.parse(briefing.content[0].text);
    const alertsPayload = JSON.parse(alerts.content[0].text);
    const prioritiesPayload = JSON.parse(priorities.content[0].text);

    expect(briefingPayload.priorities.length).toBeGreaterThan(0);
    expect(briefingPayload.correlations.length).toBeGreaterThan(0);
    expect(alertsPayload.alertCount).toBeGreaterThan(0);
    expect(prioritiesPayload.items.length).toBeGreaterThan(0);
    expect(briefingPayload.ecosystem.snapshot.sourceFile).toBe(
      "snapshot-0001-new.json",
    );
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
    const payload = JSON.parse(briefing.content[0].text);

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
    const payload = JSON.parse(briefing.content[0].text);
    const priorities: string[] = payload.priorities;

    // Find the ecosystem-related priority and verify it comes first
    const ecosystemIndex = priorities.findIndex((p) =>
      p.toLowerCase().includes("ecosystem"),
    );
    const nonEcosystemIndex = priorities.findIndex(
      (p) => !p.toLowerCase().includes("ecosystem"),
    );
    // If both exist, ecosystem should come before non-ecosystem
    if (ecosystemIndex >= 0 && nonEcosystemIndex >= 0) {
      expect(ecosystemIndex).toBeLessThan(nonEcosystemIndex);
    }
  });
});

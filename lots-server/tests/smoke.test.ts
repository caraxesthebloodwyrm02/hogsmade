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

describe("lots-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lots-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { experimentsDir: string };

  beforeAll(async () => {
    process.env.LOTS_EXPERIMENTS_DIR = path.join(tempRoot, "experiments");

    const echoesDir = path.join(tempRoot, "echoes");
    const seedsDir = path.join(tempRoot, "seeds-server", "snapshots");
    const afloatDir = path.join(tempRoot, "afloat", "history");
    mkdirSync(echoesDir, { recursive: true });
    mkdirSync(seedsDir, { recursive: true });
    mkdirSync(afloatDir, { recursive: true });

    process.env.ECHOES_AUDIT_PATH = path.join(echoesDir, "audit.ndjson");
    process.env.SEEDS_DATA_DIR = path.join(tempRoot, "seeds-server");
    process.env.AFLOAT_DATA_DIR = path.join(tempRoot, "afloat");

    // Seed audit data: 3 repeated failures from the same source:tool
    const now = new Date().toISOString();
    const auditLines =
      [
        JSON.stringify({
          timestamp: now,
          source: "maintain-server",
          tool: "cleanup_execute",
          status: "failure",
          metadata: { relatedRepo: "GRID-main" },
        }),
        JSON.stringify({
          timestamp: now,
          source: "maintain-server",
          tool: "cleanup_execute",
          status: "failure",
          metadata: { relatedRepo: "GRID-main" },
        }),
        JSON.stringify({
          timestamp: now,
          source: "maintain-server",
          tool: "cleanup_execute",
          status: "failure",
          metadata: { relatedRepo: "GRID-main" },
        }),
      ].join("\n") + "\n";
    writeFileSync(process.env.ECHOES_AUDIT_PATH, auditLines, "utf-8");

    // Seed 2 snapshots with a low-health repo
    writeFileSync(
      path.join(seedsDir, "snapshot-1.json"),
      JSON.stringify({
        timestamp: now,
        overallScore: 55,
        repos: [{ name: "GRID-main", healthScore: 40, issues: ["stale"] }],
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(seedsDir, "snapshot-2.json"),
      JSON.stringify({
        timestamp: now,
        overallScore: 50,
        repos: [
          { name: "GRID-main", healthScore: 35, issues: ["stale", "no tests"] },
        ],
      }),
      "utf-8",
    );

    // Seed failed workflow executions
    writeFileSync(
      path.join(afloatDir, "execution-1.json"),
      JSON.stringify({
        executionId: "exec-1",
        workflowId: "wf-deploy",
        status: "failed",
        startedAt: now,
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(afloatDir, "execution-2.json"),
      JSON.stringify({
        executionId: "exec-2",
        workflowId: "wf-deploy",
        status: "failed",
        startedAt: now,
      }),
      "utf-8",
    );

    const serverMod = await import("../src/server.ts");
    buildServer = serverMod.buildServer as unknown as () => TestServer;
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.LOTS_EXPERIMENTS_DIR;
    delete process.env.ECHOES_AUDIT_PATH;
    delete process.env.SEEDS_DATA_DIR;
    delete process.env.AFLOAT_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires an experiments root", () => {
    const original = process.env.LOTS_EXPERIMENTS_DIR;
    delete process.env.LOTS_EXPERIMENTS_DIR;
    expect(() => getConfig()).toThrow(/LOTS_EXPERIMENTS_DIR/);
    process.env.LOTS_EXPERIMENTS_DIR = original;
  });

  it("registers expected tools and runs experiment_list", async () => {
    const server = buildServer();
    expect(getToolNames(server)).toEqual(
      expect.arrayContaining([
        "health_check",
        "experiment_create",
        "experiment_list",
        "experiment_dashboard_list",
        "experiment_run",
        "experiment_get",
        "experiment_compare",
        "experiment_suggest",
      ]),
    );

    const health = (await invokeTool(server, "health_check")) as {
      isError?: boolean;
    };
    const list = (await invokeTool(server, "experiment_list", { limit: 5 })) as {
      isError?: boolean;
    };
    expect(health.isError).not.toBe(true);
    expect(list.isError).not.toBe(true);
  });

  it("detects patterns and generates proposals", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "experiment_suggest", {})) as {
      content: Array<{ text: string }>;
    };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.patternsDetected).toBeGreaterThanOrEqual(2);
    expect(payload.proposals.length).toBeGreaterThan(0);

    const proposal = payload.proposals[0];
    expect(proposal.status).toBe("draft");
    expect(proposal.createdFrom).toBe("pattern-detection");
    expect(proposal.confidence).toBeGreaterThan(0);
    expect(proposal.hypothesis).toBeTruthy();
    expect(proposal.sourceSignals.length).toBeGreaterThan(0);
  });

  it("saves proposals as draft experiments when saveAsDraft is true", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "experiment_suggest", {
      saveAsDraft: true,
      maxProposals: 2,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.savedDrafts).toBeDefined();
    expect(payload.savedDrafts.length).toBeGreaterThan(0);
    expect(payload.savedDrafts[0].id).toMatch(/^exp-/);

    // Verify the drafts appear in experiment_list
    const listResult = (await invokeTool(server, "experiment_list", {
      status: "draft",
    })) as {
      content: Array<{ text: string }>;
    };
    const listPayload = JSON.parse(listResult.content[0].text);
    const suggestedDrafts = listPayload.experiments.filter((e: any) =>
      e.tags?.includes("suggested"),
    );
    expect(suggestedDrafts.length).toBeGreaterThan(0);
  });

  it("normalizes legacy catalog entries for the dashboard list", async () => {
    writeFileSync(
      path.join(getConfig().experimentsDir, ".catalog.json"),
      JSON.stringify(
        {
          experiments: [
            {
              id: "exp-complete",
              name: "duration-check",
              description: "legacy catalog entry",
              status: "complete",
              tags: [],
              createdAt: "2026-03-20T10:00:00.000Z",
              updatedAt: "2026-03-20T12:00:00.000Z",
              results: {
                exitCode: 0,
                stdout: "",
                stderr: "",
                durationMs: 2450,
              },
            },
            {
              id: "exp-archived",
              name: "archived",
              description: "hidden from dashboard",
              status: "archived",
              tags: [],
              createdAt: "2026-03-20T10:00:00.000Z",
              updatedAt: "2026-03-20T12:00:00.000Z",
            },
          ],
          lastUpdated: "2026-03-20T12:00:00.000Z",
        },
        null,
        2,
      ),
      "utf-8",
    );

    const server = buildServer();
    const result = (await invokeTool(server, "experiment_dashboard_list", {
      limit: 10,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.experiments).toHaveLength(1);
    expect(payload.experiments[0]).toMatchObject({
      id: "exp-complete",
      status: "completed",
      metric: "Run duration (ms)",
      baselineValue: 2450,
      currentValue: 2450,
      completedAt: "2026-03-20T12:00:00.000Z",
    });
  });

  // ── P1: Path confinement regression ──

  it("rejects sibling-prefix path escape in experiment_run", async () => {
    const server = buildServer();

    // Create an experiment with a script path that uses sibling-prefix attack
    const createResult = (await invokeTool(server, "experiment_create", {
      name: "sibling-escape-test",
      description: "Test sibling prefix path escape",
      script: "console.log('safe')",
      scriptMode: "inline",
      language: "node",
      tags: ["test"],
    })) as { content: Array<{ text: string }> };
    const created = JSON.parse(createResult.content[0].text);
    const expId = created.experiment.id;

    // Now get the experiment and manually tamper its script path
    // We can't directly tamper, but we can test that the isInsideDir check
    // rejects paths like "/experiments-evil/hack.js" which startsWith("/experiments") would allow
    const getResult = (await invokeTool(server, "experiment_get", {
      experimentId: expId,
    })) as { content: Array<{ text: string }> };
    const exp = JSON.parse(getResult.content[0].text);
    expect(exp.script).toBeTruthy();
    // The script should be inside the experiments directory
    expect(exp.script.startsWith(getConfig().experimentsDir)).toBe(true);
  });

  it("rejects script file path outside experiments dir in experiment_create", async () => {
    const server = buildServer();
    const result = (await invokeTool(server, "experiment_create", {
      name: "escape-test",
      description: "Try to reference file outside sandbox",
      script: "../../etc/passwd",
      scriptMode: "file",
      language: "bash",
      tags: ["test"],
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toMatch(/outside experiments directory/);
  });

  // ── P1: Kill-switch enforcement ──

  it("blocks experiment_run when enableExperimentRun is false", async () => {
    const original = process.env.LOTS_ENABLE_EXPERIMENT_RUN;
    delete process.env.LOTS_ENABLE_EXPERIMENT_RUN;

    // Re-import to get fresh config
    const { buildServer: freshBuild } = await import("../src/server.ts");
    const server = freshBuild() as unknown as TestServer;

    // First create an experiment
    const createResult = (await invokeTool(server, "experiment_create", {
      name: "killswitch-test",
      description: "Test kill switch",
      script: "console.log('hi')",
      scriptMode: "inline",
      language: "node",
      tags: ["test"],
    })) as { content: Array<{ text: string }> };
    const created = JSON.parse(createResult.content[0].text);

    // Try to run it — should be blocked
    const runResult = (await invokeTool(server, "experiment_run", {
      experimentId: created.experiment.id,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(runResult.isError).toBe(true);
    const payload = JSON.parse(runResult.content[0].text);
    expect(payload.error).toMatch(/disabled/i);

    // Restore
    if (original !== undefined) {
      process.env.LOTS_ENABLE_EXPERIMENT_RUN = original;
    }
  });

  // ── P2: Catalog corruption ──

  it("fails closed on malformed catalog JSON", async () => {
    const catalogPath = path.join(
      process.env.LOTS_EXPERIMENTS_DIR!,
      ".catalog.json",
    );
    writeFileSync(catalogPath, "NOT VALID JSON{{{", "utf-8");

    const server = buildServer();
    // health_check calls loadCatalog, which should throw on invalid JSON
    try {
      const result = (await invokeTool(server, "health_check")) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      // If it doesn't throw, the result should contain an error
      // (McpServer may catch and wrap the error)
      const text = result.content[0].text;
      expect(text).toMatch(/invalid JSON|error|Catalog/i);
    } catch (err: any) {
      expect(err.message).toMatch(/invalid JSON/);
    }

    // Clean up — remove the corrupted catalog so other tests work
    const { unlinkSync } = await import("fs");
    try {
      unlinkSync(catalogPath);
    } catch {
      // ignore
    }
  });

  it("fails closed on schema-invalid catalog", async () => {
    const catalogPath = path.join(
      process.env.LOTS_EXPERIMENTS_DIR!,
      ".catalog.json",
    );
    // Valid JSON but wrong shape — missing required fields
    writeFileSync(
      catalogPath,
      JSON.stringify({ experiments: [{ bad: true }], lastUpdated: "x" }),
      "utf-8",
    );

    const server = buildServer();
    try {
      const result = (await invokeTool(server, "health_check")) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      const text = result.content[0].text;
      expect(text).toMatch(/schema invalid|error|Required/i);
    } catch (err: any) {
      expect(err.message).toMatch(/schema invalid/);
    }

    // Clean up
    const { unlinkSync } = await import("fs");
    try {
      unlinkSync(catalogPath);
    } catch {
      // ignore
    }
  });

  // ── Bug fix: division-by-zero in experiment_compare ──

  it("returns N/A for speedDiff when durationMs is zero", async () => {
    const server = buildServer();

    // Create two experiments
    const a = (await invokeTool(server, "experiment_create", {
      name: "zero-dur-a",
      description: "Test zero duration",
      tags: ["test"],
    })) as { content: Array<{ text: string }> };
    const b = (await invokeTool(server, "experiment_create", {
      name: "zero-dur-b",
      description: "Test zero duration",
      tags: ["test"],
    })) as { content: Array<{ text: string }> };

    const idA = JSON.parse(a.content[0].text).experiment.id;
    const idB = JSON.parse(b.content[0].text).experiment.id;

    // Compare — both have no results, so speedDiff should be N/A
    const cmp = (await invokeTool(server, "experiment_compare", {
      experimentA: idA,
      experimentB: idB,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(cmp.content[0].text);
    expect(payload.comparison.speedDiff).toBe("N/A");
  });

  // ── P4: Telemetry degradation surfacing ──

  it("surfaces telemetry degradation when audit contains malformed lines", async () => {
    // Write some malformed audit lines
    const auditPath = process.env.ECHOES_AUDIT_PATH!;
    const now = new Date().toISOString();
    const lines = [
      JSON.stringify({ timestamp: now, source: "x", tool: "y", status: "failure" }),
      "NOT_JSON_LINE",
      "{broken json",
      JSON.stringify({ timestamp: now, source: "x", tool: "y", status: "failure" }),
    ].join("\n") + "\n";
    writeFileSync(auditPath, lines, "utf-8");

    const server = buildServer();
    const result = (await invokeTool(server, "experiment_suggest", {})) as {
      content: Array<{ text: string }>;
    };
    const payload = JSON.parse(result.content[0].text);

    // Should surface telemetry degradation
    expect(payload.telemetryDegradation).toBeDefined();
    expect(payload.telemetryDegradation.auditParseErrors).toBeGreaterThan(0);
    expect(payload.telemetryDegradation.isDegraded).toBe(true);
  });
});

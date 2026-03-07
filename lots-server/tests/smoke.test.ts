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
});

import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Type assertion for testing - bypass private property access
interface TestServer {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
}

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

describe("afloat-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "afloat-server-"));
  let buildServer: () => TestServer;

  beforeAll(async () => {
    process.env.AFLOAT_DATA_DIR = path.join(tempRoot, ".afloat");
    const serverModule = await import("../src/server.ts");
    buildServer = serverModule.buildServer as unknown as () => TestServer;
  });

  afterAll(() => {
    delete process.env.AFLOAT_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers expected tools", () => {
    expect(getToolNames(buildServer())).toEqual(
      expect.arrayContaining([
        "health_check",
        "workflow_create",
        "workflow_list",
        "workflow_get",
        "workflow_execute",
        "workflow_history",
      ]),
    );
  });

  it("runs health_check and workflow_list", async () => {
    const server = buildServer();
    const health = (await invokeTool(server, "health_check")) as { isError?: boolean };
    const list = (await invokeTool(server, "workflow_list", { limit: 5 })) as { isError?: boolean };
    expect(health.isError).not.toBe(true);
    expect(list.isError).not.toBe(true);
  });

  it("creates a workflow and retrieves it by ID", async () => {
    const server = buildServer();
    const create = (await invokeTool(server, "workflow_create", {
      name: "deploy-check",
      description: "validate deployment workflow",
      steps: [
        {
          name: "lint",
          description: "lint code",
          command: "npm run lint",
        },
        {
          name: "test",
          description: "run tests",
          command: "npm test",
        },
      ],
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(create.isError).not.toBe(true);
    const created = JSON.parse(create.content[0].text);
    const workflowId = created.workflow.id as string;

    const get = (await invokeTool(server, "workflow_get", {
      workflowId,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(get.isError).not.toBe(true);
    const wf = JSON.parse(get.content[0].text);
    expect(wf.id).toBe(workflowId);
    expect(wf.name).toBe("deploy-check");
    expect(wf.steps).toHaveLength(2);
  });

  it("executes dry-run workflow and records it in workflow_history", async () => {
    const server = buildServer();
    const create = (await invokeTool(server, "workflow_create", {
      name: "dryrun-flow",
      description: "dry-run execution test",
      steps: [
        {
          name: "build",
          description: "build package",
          command: "npm run build",
        },
      ],
    })) as { content: Array<{ text: string }> };
    const workflowId = JSON.parse(create.content[0].text).workflow.id as string;

    const execute = (await invokeTool(server, "workflow_execute", {
      workflowId,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(execute.isError).not.toBe(true);
    const execution = JSON.parse(execute.content[0].text);
    expect(execution.workflowId).toBe(workflowId);
    expect(execution.dryRun).toBe(true);
    expect(execution.status).toBe("completed");
    expect(execution.stepResults[0].status).toBe("validated");

    const history = (await invokeTool(server, "workflow_history", {
      workflowId,
      limit: 5,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(history.isError).not.toBe(true);
    const payload = JSON.parse(history.content[0].text);
    expect(payload.count).toBeGreaterThan(0);
    expect(payload.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId,
          status: "completed",
          dryRun: true,
        }),
      ]),
    );
  });

  it("executes non-dry-run in simulated mode with preview token", async () => {
    const server = buildServer();
    const create = (await invokeTool(server, "workflow_create", {
      name: "simulated-flow",
      description: "simulated execution test",
      steps: [
        {
          name: "release",
          description: "ship release",
          command: "npm run release",
        },
      ],
    })) as { content: Array<{ text: string }> };
    const workflowId = JSON.parse(create.content[0].text).workflow.id as string;

    // P-MCP-002: Require dry-run first to generate preview token
    const dryRun = (await invokeTool(server, "workflow_execute", {
      workflowId,
      dryRun: true,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(dryRun.isError).not.toBe(true);
    const dryRunResult = JSON.parse(dryRun.content[0].text);
    const previewToken = dryRunResult.previewToken as string;
    expect(previewToken).toBeDefined();

    // Now execute with preview token
    const execute = (await invokeTool(server, "workflow_execute", {
      workflowId,
      dryRun: false,
      previewToken,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(execute.isError).not.toBe(true);
    const execution = JSON.parse(execute.content[0].text);
    expect(execution.dryRun).toBe(false);
    expect(execution.status).toBe("completed");
    expect(execution.stepResults[0].status).toBe("simulated");
    expect(execution.stepResults[0].output).toContain("npm run release");
  });

  it("blocks commands with dangerous shell operators (P-MCP-003)", async () => {
    const server = buildServer();
    const create = (await invokeTool(server, "workflow_create", {
      name: "dangerous-flow",
      description: "command injection test",
      steps: [
        {
          name: "inject",
          description: "should be blocked",
          command: "npm run build && rm -rf /",
        },
      ],
    })) as { content: Array<{ text: string }> };
    const workflowId = JSON.parse(create.content[0].text).workflow.id as string;

    const execute = (await invokeTool(server, "workflow_execute", {
      workflowId,
      dryRun: true,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(execute.isError).toBe(true);
    const error = JSON.parse(execute.content[0].text);
    expect(error.error).toContain("Command validation failed");
    expect(error.policyResult.policyId).toBe("P-MCP-003");
    expect(error.policyResult.verdict).toBe("deny");
    expect(error.policyResult.reason).toContain("blocked shell operator");
  });
});

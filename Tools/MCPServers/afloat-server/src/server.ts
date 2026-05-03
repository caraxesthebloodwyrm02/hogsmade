/**
 * Afloat Server — Workflow Orchestration MCP Server
 *
 * Provides tools for multi-step workflow management:
 * - Create workflow definitions with steps
 * - Execute workflows with rollback on failure
 * - Track workflow status and history
 * - Audit trail for all workflow operations
 * - Safety pipeline isolation with ExecutionPolicyEngine
 *
 * Port: 3000 (per GATE/agent_schema.json)
 */

import { generateId } from "@cascade/shared-types/id";
import { ExecutionPolicyEngine } from "@cascade/shared-types/security-policy";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import * as z from "zod";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "afloat-server";
const VERSION = "1.0.0";
const config = getConfig();
const DATA_DIR = config.dataDir;
const WORKFLOWS_DIR = config.workflowsDir;
const HISTORY_DIR = config.historyDir;

const readLimiter = new SessionRateLimiter();

// Execution policy for command safety (P-MCP-001, P-MCP-003, P-MCP-005)
const executionPolicy = new ExecutionPolicyEngine(config.allowedRoots);

// Preview token for multi-step safety: execute requires a token from a prior dry-run (TTL 5 min)
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TOKENS_DIR = path.join(DATA_DIR, "preview-tokens");
const execFileAsync = promisify(execFile);

// ── Types ──

interface WorkflowStep {
  name: string;
  description: string;
  command?: string;
  rollbackCommand?: string;
  timeout?: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "rolled_back";
  startedAt: string;
  completedAt?: string;
  currentStep: number;
  stepResults: {
    step: string;
    status: string;
    output?: string;
    error?: string;
  }[];
  dryRun: boolean;
}

interface PreviewToken {
  token: string;
  expiresAt: number;
  workflowId: string;
}

// ── Data Layer ──

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.mkdir(PREVIEW_TOKENS_DIR, { recursive: true });
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

async function saveWorkflow(wf: WorkflowDefinition): Promise<void> {
  const filepath = path.join(WORKFLOWS_DIR, `${wf.id}.json`);
  await atomicWriteJson(filepath, wf);
}

function isContainedIn(filepath: string, baseDir: string): boolean {
  const resolved = path.resolve(filepath);
  const base = path.resolve(baseDir) + path.sep;
  return resolved.startsWith(base) || resolved === path.resolve(baseDir);
}

async function loadWorkflow(id: string): Promise<WorkflowDefinition | null> {
  const filepath = path.join(WORKFLOWS_DIR, `${id}.json`);
  if (!isContainedIn(filepath, WORKFLOWS_DIR)) return null;
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as WorkflowDefinition;
  } catch {
    return null;
  }
}

async function listWorkflows(): Promise<WorkflowDefinition[]> {
  try {
    const files = await fs.readdir(WORKFLOWS_DIR);
    const workflows: WorkflowDefinition[] = [];
    for (const file of files.filter((f: string) => f.endsWith(".json"))) {
      try {
        const content = await fs.readFile(path.join(WORKFLOWS_DIR, file), "utf-8");
        workflows.push(JSON.parse(content));
      } catch {
        /* skip corrupt */
      }
    }
    return workflows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

async function saveExecution(exec: WorkflowExecution): Promise<void> {
  const filepath = path.join(HISTORY_DIR, `${exec.executionId}.json`);
  await atomicWriteJson(filepath, exec);
}

async function listExecutions(limit: number, workflowId?: string): Promise<WorkflowExecution[]> {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const executions: WorkflowExecution[] = [];
    for (const file of files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit * 2)) {
      try {
        const content = await fs.readFile(path.join(HISTORY_DIR, file), "utf-8");
        const exec = JSON.parse(content) as WorkflowExecution;
        if (!workflowId || exec.workflowId === workflowId) {
          executions.push(exec);
        }
      } catch {
        /* skip */
      }
    }
    return executions.slice(0, limit);
  } catch {
    return [];
  }
}

async function savePreviewToken(pt: PreviewToken): Promise<void> {
  const filepath = path.join(PREVIEW_TOKENS_DIR, `${pt.workflowId}.json`);
  await atomicWriteJson(filepath, pt);
}

async function loadPreviewToken(workflowId: string): Promise<PreviewToken | null> {
  const filepath = path.join(PREVIEW_TOKENS_DIR, `${workflowId}.json`);
  if (!isContainedIn(filepath, PREVIEW_TOKENS_DIR)) return null;
  try {
    const content = await fs.readFile(filepath, "utf-8");
    const pt = JSON.parse(content) as PreviewToken;
    if (pt.expiresAt < Date.now()) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }
    return pt;
  } catch {
    return null;
  }
}

async function consumePreviewToken(workflowId: string): Promise<void> {
  const filepath = path.join(PREVIEW_TOKENS_DIR, `${workflowId}.json`);
  if (!isContainedIn(filepath, PREVIEW_TOKENS_DIR)) return;
  await fs.unlink(filepath).catch(() => {});
}

async function cleanExpiredTokens(): Promise<void> {
  try {
    const files = await fs.readdir(PREVIEW_TOKENS_DIR);
    const now = Date.now();
    for (const file of files.filter((f: string) => f.endsWith(".json"))) {
      try {
        const content = await fs.readFile(path.join(PREVIEW_TOKENS_DIR, file), "utf-8");
        const pt = JSON.parse(content) as PreviewToken;
        if (pt.expiresAt < now) {
          await fs.unlink(path.join(PREVIEW_TOKENS_DIR, file)).catch(() => {});
        }
      } catch {
        await fs.unlink(path.join(PREVIEW_TOKENS_DIR, file)).catch(() => {});
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

async function executeShellCommand(
  command: string,
  timeoutMs: number = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

// generateId imported from @cascade/shared-types/id (CSPRNG-based)

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  // Health check
  server.registerTool(
    "health_check",
    { description: "Check afloat-server health and workflow store status" },
    async () => {
      await ensureDataDir();
      const workflows = await listWorkflows();
      let executionCount = 0;
      try {
        const files = await fs.readdir(HISTORY_DIR);
        executionCount = files.filter((f: string) => f.endsWith(".json")).length;
      } catch {
        /* empty */
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ok",
                server: SERVER_NAME,
                version: VERSION,
                dataDir: DATA_DIR,
                workflowCount: workflows.length,
                executionCount,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Create workflow
  server.registerTool(
    "workflow_create",
    {
      description: "Create a new workflow definition with ordered steps",
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe("Workflow name"),
        description: z.string().describe("What this workflow does"),
        steps: z
          .array(
            z.object({
              name: z.string().min(1).describe("Step name"),
              description: z.string().describe("What this step does"),
              command: z.string().optional().describe("Shell command to execute"),
              rollbackCommand: z.string().optional().describe("Command to run if this step fails"),
              timeout: z.number().optional().describe("Timeout in seconds"),
            }),
          )
          .min(1)
          .describe("Ordered list of workflow steps"),
      }) as any,
    },
    async (args: { name: string; description: string; steps: WorkflowStep[] }) => {
      await ensureDataDir();
      const now = new Date().toISOString();
      const wf: WorkflowDefinition = {
        id: generateId("wf"),
        name: args.name,
        description: args.description,
        steps: args.steps,
        createdAt: now,
        updatedAt: now,
      };
      await saveWorkflow(wf);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ created: true, workflow: wf }, null, 2),
          },
        ],
      };
    },
  );

  // List workflows
  server.registerTool(
    "workflow_list",
    {
      description: "List all workflow definitions",
      inputSchema: z.object({}) as any,
    },
    async () => {
      const rlMsg = readLimiter.check("workflow_list");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const workflows = await listWorkflows();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: workflows.length,
                workflows: workflows.map((w) => ({
                  id: w.id,
                  name: w.name,
                  description: w.description,
                  steps: w.steps.length,
                  updatedAt: w.updatedAt,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Get workflow detail
  server.registerTool(
    "workflow_get",
    {
      description: "Get full details of a workflow definition",
      inputSchema: z.object({
        workflowId: z.string().min(1).describe("Workflow ID"),
      }) as any,
    },
    async (args: { workflowId: string }) => {
      const rlMsg = readLimiter.check("workflow_get");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const wf = await loadWorkflow(args.workflowId);
      if (!wf) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Workflow ${args.workflowId} not found`,
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(wf, null, 2) }],
      };
    },
  );

  // Execute workflow (dry-run by default)
  server.registerTool(
    "workflow_execute",
    {
      description:
        "Execute a workflow. Dry-run by default — validates steps without running commands. Set dryRun=false to actually execute.",
      inputSchema: z.object({
        workflowId: z.string().min(1).describe("Workflow ID to execute"),
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true (default), validate without executing commands"),
        previewToken: z
          .string()
          .optional()
          .describe("Preview token from prior dry-run (required for non-dry-run execution)"),
      }) as any,
    },
    async (args: { workflowId: string; dryRun?: boolean; previewToken?: string }) => {
      await ensureDataDir();
      const wf = await loadWorkflow(args.workflowId);
      if (!wf) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Workflow ${args.workflowId} not found`,
              }),
            },
          ],
          isError: true,
        };
      }

      const dryRun = args.dryRun !== false;

      // P-MCP-002: Require preview token for non-dry-run execution (disk-persisted)
      if (!dryRun) {
        const storedToken = await loadPreviewToken(args.workflowId);
        if (!storedToken) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Multi-step safety: run dry-run first to generate preview token",
                  policyId: "P-MCP-002",
                }),
              },
            ],
            isError: true,
          };
        }
        if (args.previewToken !== storedToken.token) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Invalid preview token",
                  policyId: "P-MCP-002",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      const exec: WorkflowExecution = {
        executionId: generateId("exec"),
        workflowId: wf.id,
        status: "running",
        startedAt: new Date().toISOString(),
        currentStep: 0,
        stepResults: [],
        dryRun,
      };

      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        exec.currentStep = i;

        // Safety validation for commands
        if (step.command) {
          const commandValidation = executionPolicy.validateCommand(step.command);
          if (commandValidation.verdict === "deny") {
            exec.status = "failed";
            exec.completedAt = new Date().toISOString();
            exec.stepResults.push({
              step: step.name,
              status: "blocked",
              error: commandValidation.reason,
            });
            await saveExecution(exec);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Command validation failed for step "${step.name}"`,
                    policyResult: commandValidation,
                    execution: exec,
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        if (step.rollbackCommand) {
          const rbValidation = executionPolicy.validateCommand(step.rollbackCommand);
          if (rbValidation.verdict === "deny") {
            exec.status = "failed";
            exec.completedAt = new Date().toISOString();
            exec.stepResults.push({
              step: step.name,
              status: "blocked",
              error: `Rollback command blocked: ${rbValidation.reason}`,
            });
            await saveExecution(exec);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Rollback command validation failed for step "${step.name}"`,
                    policyResult: rbValidation,
                    execution: exec,
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        if (dryRun) {
          exec.stepResults.push({
            step: step.name,
            status: "validated",
            output: `[DRY RUN] Would execute: ${step.command ?? "(no command)"}`,
          });
        } else if (step.command) {
          try {
            const result = await executeShellCommand(step.command, (step.timeout ?? 30) * 1000);
            exec.stepResults.push({
              step: step.name,
              status: "completed",
              output: result.stdout || result.stderr || "(no output)",
            });
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            exec.stepResults.push({
              step: step.name,
              status: "failed",
              error,
            });

            const completedSteps = wf.steps.slice(0, i).reverse();
            for (const rbStep of completedSteps) {
              if (rbStep.rollbackCommand) {
                try {
                  const rbResult = await executeShellCommand(rbStep.rollbackCommand);
                  exec.stepResults.push({
                    step: rbStep.name,
                    status: "rolled_back",
                    output: rbResult.stdout || "(rollback completed)",
                  });
                } catch (rbErr: unknown) {
                  exec.stepResults.push({
                    step: rbStep.name,
                    status: "rollback_failed",
                    error: rbErr instanceof Error ? rbErr.message : String(rbErr),
                  });
                }
              }
            }

            exec.status = "rolled_back";
            exec.completedAt = new Date().toISOString();
            await consumePreviewToken(wf.id);
            await saveExecution(exec);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(exec, null, 2),
                },
              ],
            };
          }
        } else {
          exec.stepResults.push({
            step: step.name,
            status: "completed",
            output: "(no command — manual step)",
          });
        }
      }

      exec.status = "completed";
      exec.completedAt = new Date().toISOString();
      await saveExecution(exec);

      let previewTokenValue: string | undefined;
      if (dryRun) {
        previewTokenValue = generateId("preview");
        await savePreviewToken({
          token: previewTokenValue,
          expiresAt: Date.now() + PREVIEW_TOKEN_TTL_MS,
          workflowId: wf.id,
        });
        await cleanExpiredTokens();
      } else {
        await consumePreviewToken(wf.id);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...exec,
              previewToken: previewTokenValue,
            }),
          },
        ],
      };
    },
  );

  // Execution history
  server.registerTool(
    "workflow_history",
    {
      description: "List recent workflow executions",
      inputSchema: z.object({
        limit: z.number().min(1).max(100).optional().default(10).describe("Max entries"),
        workflowId: z.string().optional().describe("Filter by workflow ID"),
      }) as any,
    },
    async (args: { limit?: number; workflowId?: string }) => {
      const rlMsg = readLimiter.check("workflow_history");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const executions = await listExecutions(args.limit ?? 10, args.workflowId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: executions.length,
                executions: executions.map((e) => ({
                  executionId: e.executionId,
                  workflowId: e.workflowId,
                  status: e.status,
                  dryRun: e.dryRun,
                  startedAt: e.startedAt,
                  completedAt: e.completedAt,
                  stepsCompleted: e.stepResults.length,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Signal bridge: accept mangrove health data and produce a maintenance workflow
  server.registerTool(
    "suggest_maintenance_workflow",
    {
      description:
        "Accept a janitor_scan health report and generate a maintenance workflow " +
        "to fix the reported issues. Returns a workflow ID that can be executed " +
        "via workflow_execute. Bridge between mangrove health signals and afloat workflows.",
      inputSchema: z.object({
        paths: z
          .array(
            z.object({
              targetPath: z.string().describe("Repository path that was scanned"),
              hasIssues: z.boolean().describe("Whether issues were found"),
              gitHygiene: z
                .object({
                  clean: z.boolean().optional(),
                  modified: z.number().optional(),
                  untracked: z.number().optional(),
                })
                .passthrough()
                .optional(),
              looseObjects: z
                .object({
                  looseObjects: z.number().optional(),
                  issue: z.boolean().optional(),
                })
                .passthrough()
                .optional(),
            }),
          )
          .min(1)
          .describe("Array of scanned paths from janitor_scan output"),
      }) as any,
    },
    async (args: {
      paths: Array<{
        targetPath: string;
        hasIssues: boolean;
        gitHygiene?: { clean?: boolean; modified?: number; untracked?: number };
        looseObjects?: { looseObjects?: number; issue?: boolean };
      }>;
    }) => {
      const rlMsg = readLimiter.check("suggest_maintenance_workflow");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();

      const issuesPaths = args.paths.filter((p) => p.hasIssues);
      if (issuesPaths.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                suggested: false,
                reason: "No issues found in health report",
              }),
            },
          ],
        };
      }

      const steps: WorkflowStep[] = [];

      for (const p of issuesPaths) {
        // Validate path is within allowed roots
        const inAllowed = config.allowedRoots.some(
          (root) => p.targetPath === root || p.targetPath.startsWith(root + path.sep),
        );
        if (!inAllowed) continue;

        if (p.looseObjects?.issue) {
          steps.push({
            name: `gc-${path.basename(p.targetPath)}`,
            description: `Git garbage collection for ${path.basename(p.targetPath)} (${
              p.looseObjects.looseObjects ?? "unknown"
            } loose objects)`,
            command: `git -C ${p.targetPath} gc --auto`,
            timeout: 120,
          });
        }

        if (p.gitHygiene && !p.gitHygiene.clean && (p.gitHygiene.modified ?? 0) > 0) {
          steps.push({
            name: `status-${path.basename(p.targetPath)}`,
            description: `Report modified files in ${path.basename(p.targetPath)} (${
              p.gitHygiene.modified
            } modified)`,
            command: `git -C ${p.targetPath} status --short`,
            timeout: 30,
          });
        }
      }

      if (steps.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                suggested: false,
                reason: "Issues detected but all paths are outside allowed roots",
              }),
            },
          ],
        };
      }

      const workflowId = generateId("maint");
      const workflow: WorkflowDefinition = {
        id: workflowId,
        name: `maintenance-${new Date().toISOString().slice(0, 10)}`,
        description: `Auto-suggested maintenance for ${steps.length} issue(s) across ${issuesPaths.length} path(s)`,
        steps,
        createdAt: new Date().toISOString(),
      };

      await saveWorkflow(workflow);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                suggested: true,
                workflowId,
                name: workflow.name,
                stepCount: steps.length,
                steps: steps.map((s) => ({ name: s.name, description: s.description })),
                nextAction: `Dry-run with workflow_execute(workflowId: "${workflowId}", dryRun: true)`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDataDir();
  console.error(`[${SERVER_NAME}] v${VERSION} starting — data: ${DATA_DIR}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      console.error(`[${SERVER_NAME}] failed to start`, error);
      process.exit(1);
    }
  }

  void main();
}

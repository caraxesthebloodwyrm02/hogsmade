import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

type EpisodePartSummary = {
  part_index: number;
  title: string;
  stage: string;
  airflow_category: string;
  light_phase: string;
  beat_phase: string;
  phase_one_duration_s: number;
  phase_two_duration_s: number;
};

type EpisodeSummary = {
  total_parts: number;
  total_execution_s: number;
  isolation_break_s: number;
  completed_passes: number;
  gate_pass_count: number;
  parts: EpisodePartSummary[];
};

type DIOStatusResult = {
  cadence: string[];
  rhythmPassCount: number;
  modularPassIndex: number;
};

type SecurityAuditJsonResult = {
  violations: Array<{
    file: string;
    line: number;
    col: number;
    code: string;
    description: string;
  }>;
  count: number;
  files_scanned: number;
};

type CommandExecutionResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type ToolContext = {
  signal?: AbortSignal;
};

const SERVER_NAME = "mangrove-server";
const VERSION = "1.0.0";
const DEFAULT_DIO_ROOT = fileURLToPath(new URL("../../DIO", import.meta.url));
const SECURITY_SCRIPT_PATH = "roots/security/scripts/check_underscore_isolation.py";

const EPISODE_SUMMARY_SOURCE = [
  "import json",
  "from combined_space import InteractiveIterationTool",
  "print(json.dumps(InteractiveIterationTool().episode_summary()))"
].join("\n");

const STATUS_SOURCE = [
  "import json",
  "from control_room.constants import CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX",
  "print(json.dumps({",
  "    'cadence': list(CADENCE),",
  "    'rhythmPassCount': RHYTHM_PASS_COUNT,",
  "    'modularPassIndex': MODULAR_PASS_INDEX",
  "}))"
].join("\n");

function resolveDioRoot(): string {
  const configuredRoot = process.env.PI_MANGROVE_DIO_ROOT?.trim() || process.env.MANGROVE_DIO_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.resolve(DEFAULT_DIO_ROOT);
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<CommandExecutionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
        if (finished) {
          return;
        }
        finished = true;
        child.kill();
        reject(new Error(`Command timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs)
      : undefined;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: Error) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });

    child.on("close", (code: number | null) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function runEpisodeSummary(dioRoot: string, signal?: AbortSignal): Promise<EpisodeSummary> {
  const execution = await runCommand("uv", ["run", "python", "-c", EPISODE_SUMMARY_SOURCE], {
    cwd: dioRoot,
    env: process.env,
    signal,
    timeoutMs: 5000
  });

  if (execution.code !== 0) {
    throw new Error(execution.stderr.trim() || execution.stdout.trim() || `uv exited with code ${execution.code}`);
  }

  const payload = execution.stdout.trim();
  if (!payload) {
    throw new Error("DIO bridge returned no output.");
  }

  return JSON.parse(payload) as EpisodeSummary;
}

function selectPart(summary: EpisodeSummary, partIndex: number): EpisodePartSummary {
  const part = summary.parts.find((entry) => entry.part_index === partIndex);
  if (!part) {
    throw new Error(`Part ${partIndex} was not found in the DIO episode summary.`);
  }
  return part;
}

async function runStatusQuery(dioRoot: string, signal?: AbortSignal): Promise<DIOStatusResult> {
  const pythonPath = path.join(dioRoot, ".venv", "bin", "python");
  const execution = await runCommand(pythonPath, ["-c", STATUS_SOURCE], {
    cwd: dioRoot,
    env: { ...process.env, PYTHONPATH: dioRoot },
    signal,
    timeoutMs: 5000
  });

  if (execution.code !== 0) {
    throw new Error(execution.stderr.trim() || execution.stdout.trim() || `Python exited with code ${execution.code}`);
  }

  const payload = execution.stdout.trim();
  if (!payload) {
    throw new Error("DIO status query returned no output.");
  }

  return JSON.parse(payload) as DIOStatusResult;
}

function resolveAuditTarget(dioRoot: string, requestedPath?: string): string {
  if (!requestedPath?.trim()) {
    return dioRoot;
  }

  const trimmedPath = requestedPath.trim();
  return path.isAbsolute(trimmedPath) ? trimmedPath : path.resolve(dioRoot, trimmedPath);
}

async function runSecurityAudit(
  dioRoot: string,
  params: { path?: string; format?: "text" | "json" },
  signal?: AbortSignal
): Promise<{
  result: SecurityAuditJsonResult | string;
  format: "text" | "json";
  targetPath: string;
  exitCode: number | null;
}> {
  const format = params.format ?? "json";
  const targetPath = resolveAuditTarget(dioRoot, params.path);

  const execution = await runCommand(
    "uv",
    ["run", "python", SECURITY_SCRIPT_PATH, "--format", format, targetPath],
    {
      cwd: dioRoot,
      env: process.env,
      signal,
      timeoutMs: 10000
    }
  );

  if (execution.code !== 0 && execution.code !== 1) {
    throw new Error(
      execution.stderr.trim() || execution.stdout.trim() || `Security audit exited with code ${execution.code}`
    );
  }

  const payload = execution.stdout.trim();
  if (!payload) {
    throw new Error("Security audit returned no output.");
  }

  if (format === "json") {
    return {
      result: JSON.parse(payload) as SecurityAuditJsonResult,
      format,
      targetPath,
      exitCode: execution.code
    };
  }

  return {
    result: payload,
    format,
    targetPath,
    exitCode: execution.code
  };
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION
  });

  server.tool(
    "dio_episode_summary",
    "Read the DIO episode structure summary or one specific part from the local DIO workspace.",
    {
      partIndex: z.number().int().min(1).max(4).optional().describe("Optional part number to return from the DIO episode summary")
    },
    async ({ partIndex }: { partIndex?: number }, extra: ToolContext) => {
      try {
        const dioRoot = resolveDioRoot();
        const summary = await runEpisodeSummary(dioRoot, extra.signal);
        const result = partIndex ? selectPart(summary, partIndex) : summary;

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ dioRoot, partIndex: partIndex ?? null, result }, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "dio_status",
    "Query DIO constants (CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX) from the local Python environment.",
    {
      detail: z.enum(["minimal", "full"]).optional().default("minimal").describe("Level of detail to return")
    },
    async ({ detail }: { detail?: "minimal" | "full" }, extra: ToolContext) => {
      try {
        const dioRoot = resolveDioRoot();
        const result = await runStatusQuery(dioRoot, extra.signal);
        const status = {
          phase: "ready",
          cadence: result.cadence,
          rhythmPassCount: result.rhythmPassCount,
          modularPassIndex: result.modularPassIndex,
          dioRoot
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(status, null, detail === "full" ? 2 : undefined) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "security_audit",
    "Run the DIO underscore-isolation security audit against the DIO workspace or a specific target path.",
    {
      path: z.string().optional().describe("Optional file or directory to audit. Relative paths resolve from the DIO root."),
      format: z.enum(["text", "json"]).optional().default("json").describe("Output format to request from the security checker.")
    },
    async (
      { path: requestedPath, format }: { path?: string; format?: "text" | "json" },
      extra: ToolContext
    ) => {
      try {
        const dioRoot = resolveDioRoot();
        const audit = await runSecurityAudit(dioRoot, { path: requestedPath, format }, extra.signal);

        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof audit.result === "string"
                  ? audit.result
                  : JSON.stringify(
                    {
                      dioRoot,
                      targetPath: audit.targetPath,
                      format: audit.format,
                      exitCode: audit.exitCode,
                      result: audit.result
                    },
                    null,
                    2
                  )
            }
          ]
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true
        };
      }
    }
  );

  return server;
}

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type ToolParameters = {
  partIndex?: number;
};

const DEFAULT_DIO_ROOT = fileURLToPath(new URL("../../DIO", import.meta.url));

const TOOL_PARAMETERS = Type.Object({
  partIndex: Type.Optional(
    Type.Integer({
      description: "Optional part number to return from the DIO episode summary",
      minimum: 1,
      maximum: 4,
    }),
  ),
});

const PYTHON_SOURCE = [
  "import json",
  "from combined_space import InteractiveIterationTool",
  "print(json.dumps(InteractiveIterationTool().episode_summary()))",
].join("\n");

function resolveDioRoot(): string {
  const configuredRoot = process.env.PI_MANGROVE_DIO_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.resolve(DEFAULT_DIO_ROOT);
}

function runEpisodeSummary(dioRoot: string, signal?: AbortSignal): Promise<EpisodeSummary> {
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "python", "-c", PYTHON_SOURCE], {
      cwd: dioRoot,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: Error) => {
      reject(error);
    });

    child.on("close", (code: number | null) => {
      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `uv exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      const payload = stdout.trim();
      if (!payload) {
        reject(new Error("DIO bridge returned no output."));
        return;
      }

      try {
        resolve(JSON.parse(payload) as EpisodeSummary);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse DIO summary JSON: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
  });
}

function selectPart(summary: EpisodeSummary, partIndex: number): EpisodePartSummary {
  const part = summary.parts.find((entry) => entry.part_index === partIndex);
  if (!part) {
    throw new Error(`Part ${partIndex} was not found in the DIO episode summary.`);
  }
  return part;
}

const STATUS_PARAMETERS = Type.Object({
  detail: Type.Optional(
    Type.String({
      description: "Level of detail to return",
      enum: ["minimal", "full"],
      default: "minimal",
    }),
  ),
});

const STATUS_PYTHON_SOURCE = [
  "import json",
  "from control_room.constants import CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX",
  "print(json.dumps({",
  "    'cadence': list(CADENCE),",
  "    'rhythmPassCount': RHYTHM_PASS_COUNT,",
  "    'modularPassIndex': MODULAR_PASS_INDEX",
  "}))",
].join("\n");

type DIOStatusResult = {
  cadence: string[];
  rhythmPassCount: number;
  modularPassIndex: number;
};

function runStatusQuery(dioRoot: string, signal?: AbortSignal): Promise<DIOStatusResult> {
  return new Promise((resolve, reject) => {
    const pythonPath = path.join(dioRoot, ".venv", "bin", "python");
    const child = spawn(pythonPath, ["-c", STATUS_PYTHON_SOURCE], {
      cwd: dioRoot,
      env: { ...process.env, PYTHONPATH: dioRoot },
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill();
      reject(new Error("Python execution timed out (5s)"));
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: Error) => {
      clearTimeout(timeout);
      reject(new Error(`Spawn failed: ${error.message}`));
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timeout);
      if (killed) return;

      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `Python exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      const payload = stdout.trim();
      if (!payload) {
        reject(new Error("DIO status query returned no output"));
        return;
      }

      try {
        const result = JSON.parse(payload) as DIOStatusResult;
        resolve(result);
      } catch (error) {
        reject(
          new Error(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`),
        );
      }
    });
  });
}

type SecurityAuditParameters = {
  path?: string;
  format?: "text" | "json";
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

const SECURITY_AUDIT_PARAMETERS = Type.Object({
  path: Type.Optional(
    Type.String({
      description: "Optional file or directory to audit. Relative paths resolve from the DIO root.",
    }),
  ),
  format: Type.Optional(
    Type.String({
      description: "Output format to request from the security checker.",
      enum: ["text", "json"],
      default: "json",
    }),
  ),
});

const SECURITY_SCRIPT_PATH = "roots/security/scripts/check_underscore_isolation.py";

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
): Promise<CommandExecutionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: Error) => {
      reject(error);
    });

    child.on("close", (code: number | null) => {
      resolve({ code, stdout, stderr });
    });
  });
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
  params: SecurityAuditParameters,
  signal?: AbortSignal,
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
    },
  );

  if (execution.code !== 0 && execution.code !== 1) {
    const message =
      execution.stderr.trim() ||
      execution.stdout.trim() ||
      `Security audit exited with code ${execution.code}`;
    throw new Error(message);
  }

  const payload = execution.stdout.trim();
  if (!payload) {
    throw new Error("Security audit returned no output.");
  }

  if (format === "json") {
    try {
      return {
        result: JSON.parse(payload) as SecurityAuditJsonResult,
        format,
        targetPath,
        exitCode: execution.code,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse security audit JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    result: payload,
    format,
    targetPath,
    exitCode: execution.code,
  };
}

export default function dioBridgeExtension(pi: ExtensionAPI) {
  // Tool 1: Episode Summary
  pi.registerTool({
    name: "dio_episode_summary",
    label: "DIO Episode Summary",
    description:
      "Read the DIO episode structure summary or one specific part from the local DIO workspace.",
    parameters: TOOL_PARAMETERS,
    async execute(_toolCallId: string, params: ToolParameters, signal: AbortSignal | undefined) {
      const dioRoot = resolveDioRoot();
      const summary = await runEpisodeSummary(dioRoot, signal);
      const result = params.partIndex ? selectPart(summary, params.partIndex) : summary;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        details: {
          dioRoot,
          partIndex: params.partIndex ?? null,
          result,
        },
      };
    },
  });

  // Tool 2: DIO Status (constants query)
  pi.registerTool({
    name: "dio:status",
    label: "DIO Status",
    description:
      "Query DIO constants (CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX) from the local Python environment.",
    parameters: STATUS_PARAMETERS,
    async execute(
      _toolCallId: string,
      params: { detail?: "minimal" | "full" },
      signal: AbortSignal | undefined,
    ) {
      const dioRoot = resolveDioRoot();
      const result = await runStatusQuery(dioRoot, signal);

      const status = {
        phase: "ready",
        cadence: result.cadence,
        rhythmPassCount: result.rhythmPassCount,
        modularPassIndex: result.modularPassIndex,
        dioRoot,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, params.detail === "full" ? 2 : undefined),
          },
        ],
        details: status,
      };
    },
  });

  pi.registerTool({
    name: "security:audit",
    label: "Security Audit",
    description:
      "Run the DIO underscore-isolation security audit against the DIO workspace or a specific target path.",
    parameters: SECURITY_AUDIT_PARAMETERS,
    async execute(
      _toolCallId: string,
      params: SecurityAuditParameters,
      signal: AbortSignal | undefined,
    ) {
      const dioRoot = resolveDioRoot();
      const audit = await runSecurityAudit(dioRoot, params, signal);

      return {
        content: [
          {
            type: "text",
            text:
              typeof audit.result === "string"
                ? audit.result
                : JSON.stringify(audit.result, null, 2),
          },
        ],
        details: {
          dioRoot,
          targetPath: audit.targetPath,
          format: audit.format,
          exitCode: audit.exitCode,
          result: audit.result,
        },
      };
    },
  });
}

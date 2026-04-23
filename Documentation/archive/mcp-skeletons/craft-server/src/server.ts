import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type ToolContext = {
  signal?: AbortSignal;
};

type RenderResult = {
  module: string;
  target: string;
  outputPath?: string;
  success: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
  stdout?: string;
};

type ModuleInfo = {
  name: string;
  description: string;
  publicApi: string[];
  tier?: string;
};

type TemplateResult = {
  module: string;
  function: string;
  result?: unknown;
  error?: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SERVER_NAME = "craft-server";
const VERSION = "1.0.0";
const DEFAULT_CRAFT_ROOT = "/home/caraxes/roots/python-craft";
const COMMAND_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 120_000;

// ── Render modules registry ─────────────────────────────────────────────────

const RENDER_MODULES: Record<
  string,
  { module: string; demoFn: string; description: string; outputGlob: string }
> = {
  gruff_sketch: {
    module: "craft.gruff_geometric_sketch",
    demoFn: "demo",
    description: "Base Gruff geometric sketch with midpoint-cut X/Y axes and compass circle",
    outputGlob: "out/gruff_sketch.png",
  },
  gruff_360: {
    module: "craft.gruff_geometric_sketch",
    demoFn: "demo_360",
    description: "Wide 360-degree scope of the central point cluster (cartesian + polar)",
    outputGlob: "out/gruff_360_wide.png",
  },
  gruff_compass_x: {
    module: "craft.gruff_geometric_sketch",
    demoFn: "demo_compass_x",
    description: "Compass-X contrast: baseline vs attributed integration map",
    outputGlob: "out/gruff_compass_x_contrast.png",
  },
  gruff_shift_cycles: {
    module: "craft.gruff_geometric_sketch",
    demoFn: "demo_shift_cycles",
    description: "5 shift cycles on graph sheet + 3D pane with optional GIF animation",
    outputGlob: "out/gruff_shift_cycles.png",
  },
  sylveon: {
    module: "craft.sylveon_heatmap",
    demoFn: "demo_sylveon",
    description:
      "65% backend logic + 35% pattern heatmap with LSP recommendations targeting basepyright",
    outputGlob: "out/sylveon_heatmap.png",
  },
  atlas: {
    module: "craft.atlas_polar_field",
    demoFn: "render",
    description:
      "Multi-dimensional polar field animation — mood-driven, 4 seed entities, parallax trails",
    outputGlob: "out/atlas_polar_field.gif",
  },
  fireworks: {
    module: "craft.caraxes_fireworks",
    demoFn: "demo_fireworks",
    description:
      "5-layer composited GIF: sky gradient, moonblast, volcano, dragon flight, glass refraction",
    outputGlob: "out/caraxes_fireworks.gif",
  },
  context_weave: {
    module: "craft.context_weave",
    demoFn: "demo",
    description:
      "Self-contained HTML artifact: 8-layer context engine (persona, geo, temporal, research, eligibility)",
    outputGlob: "out/context_weave.html",
  },
};

// ── Module catalog ──────────────────────────────────────────────────────────

const MODULE_CATALOG: ModuleInfo[] = [
  {
    name: "gruff_geometric_sketch",
    description:
      "Geometric sketch renderer with compass, grid, midpoint axes, 360 scope, Compass-X contrast, and shift cycles",
    publicApi: [
      "gruff_sketch",
      "gruff_wide_360_render",
      "gruff_compass_x_contrast_render",
      "gruff_shift_cycles_render",
      "demo",
      "demo_360",
      "demo_compass_x",
      "demo_shift_cycles",
    ],
  },
  {
    name: "sylveon_heatmap",
    description:
      "65% backend logic + 35% frontend pattern heatmap with hotspot detection and basepyright LSP recommendations",
    publicApi: [
      "sylveon_render",
      "demo_sylveon",
      "SylveonSpec",
      "CompassAddonSpec",
      "TodoRecommendation",
      "SylveonRun",
    ],
  },
  {
    name: "atlas_polar_field",
    description:
      "Mood-driven polar field animation — orbital particles with parallax trails, attention webs, and sidewalk drift",
    publicApi: ["render", "EntityPoint", "Trail", "SEEDS", "MOOD_PALETTES"],
  },
  {
    name: "caraxes_fireworks",
    description:
      "5-layer composited GIF: sky gradient, moonblast wash, volcano eruption, dragon flight, glass refraction",
    publicApi: [
      "fireworks_render",
      "demo_fireworks",
      "FireworksSpec",
      "SkyGradientSpec",
      "MoonblastSpec",
      "VolcanoSpec",
      "DragonSpec",
      "GlassSpec",
      "RidgeSpec",
    ],
  },
  {
    name: "context_weave",
    description:
      "Programmable reference engine — 8 layers (identity, geography, temporal, preference, community, research, eligibility, contrast) → self-contained HTML",
    publicApi: [
      "render",
      "demo",
      "compute_fold_contrast",
      "PersonaBlock",
      "GeoAnchor",
      "TemporalFilter",
      "ResearchWave",
      "CommunityRef",
      "EligibilityDimension",
      "ShiftCycle",
    ],
  },
  {
    name: "t1_foundation",
    tier: "T1",
    description:
      "Tensor + numeric foundations (torch, numpy, pandas) — softmax weighted tensor summarization",
    publicApi: ["summarize_tensor_and_frame"],
  },
  {
    name: "t2_tokenization",
    tier: "T2",
    description: "Text-to-IDs templates (tokenizers, tiktoken, nltk, sentencepiece)",
    publicApi: [
      "tokenize_with_hf",
      "tokenize_with_tiktoken",
      "tokenize_with_nltk",
      "tokenize_with_sp",
    ],
  },
  {
    name: "t3_transformers",
    tier: "T3",
    description:
      "Embeddings and generation (transformers, sentence-transformers) — build embedding model, quick generate",
    publicApi: ["build_embedding_model", "quick_generate"],
  },
  {
    name: "t4_finetune_surface",
    tier: "T4",
    description: "Adapter training surface (datasets, accelerate, peft)",
    publicApi: ["load_dataset_split", "prepare_peft_model"],
  },
  {
    name: "t5_orchestration",
    tier: "T5",
    description: "Typed state and chains (pydantic, langchain, langgraph)",
    publicApi: ["build_chain", "build_graph_agent"],
  },
  {
    name: "t6_index_and_eval",
    tier: "T6",
    description: "FAISS indexing and similarity visualization (faiss-cpu, matplotlib)",
    publicApi: ["build_faiss_index", "plot_similarity", "IndexStats"],
  },
  {
    name: "t6_llama_cpp_surface",
    tier: "T6",
    description: "llama.cpp Python bindings for local inference (llama-cpp-python)",
    publicApi: ["load_llama_model", "complete"],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveCraftRoot(): string {
  const configured = process.env.CRAFT_ROOT?.trim();
  return configured ? path.resolve(configured) : DEFAULT_CRAFT_ROOT;
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (finished) return;
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
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code: number | null) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

// ── Tool Handlers ───────────────────────────────────────────────────────────

async function handleHealthCheck(
  _params: Record<string, never>,
  extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const craftRoot = resolveCraftRoot();
    const rootExists = fs.existsSync(craftRoot);
    const pyprojectExists = rootExists && fs.existsSync(path.join(craftRoot, "pyproject.toml"));
    const venvExists = rootExists && fs.existsSync(path.join(craftRoot, ".venv"));
    const outDirExists = rootExists && fs.existsSync(path.join(craftRoot, "out"));

    let uvVersion = "unavailable";
    try {
      const result = await runCommand("uv", ["--version"], {
        cwd: craftRoot,
        signal: extra.signal,
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      if (result.code === 0) uvVersion = result.stdout.trim();
    } catch {
      /* uv not available */
    }

    const moduleCount = MODULE_CATALOG.length;
    const renderCount = Object.keys(RENDER_MODULES).length;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              server: SERVER_NAME,
              version: VERSION,
              craftRoot,
              rootExists,
              pyprojectExists,
              venvExists,
              outDirExists,
              uvVersion,
              moduleCount,
              renderCount,
              renderModules: Object.keys(RENDER_MODULES),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleListModules(
  { tier, includeApi }: { tier?: string; includeApi?: boolean },
  _extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  let modules = MODULE_CATALOG;
  if (tier) {
    modules = modules.filter((m) => m.tier?.toLowerCase() === tier.toLowerCase());
  }

  const output = modules.map((m) => {
    const base: Record<string, unknown> = {
      name: m.name,
      description: m.description,
    };
    if (m.tier) base.tier = m.tier;
    if (includeApi) base.publicApi = m.publicApi;
    return base;
  });

  return {
    content: [
      { type: "text", text: JSON.stringify({ modules: output, count: output.length }, null, 2) },
    ],
  };
}

async function handleRender(
  { target, mood, outputDir }: { target: string; mood?: string; outputDir?: string },
  extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const spec = RENDER_MODULES[target];
  if (!spec) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Unknown render target '${target}'. Available: ${Object.keys(
              RENDER_MODULES,
            ).join(", ")}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const craftRoot = resolveCraftRoot();

  // Build the Python script to execute
  let script: string;
  if (target === "atlas" && mood) {
    script = [
      `from ${spec.module} import ${spec.demoFn}`,
      `result = ${spec.demoFn}(mood="${mood}")`,
      `print(str(result))`,
    ].join("\n");
  } else if (target === "context_weave") {
    const outPath = outputDir
      ? `"${path.join(outputDir, "context_weave.html")}"`
      : `"out/context_weave.html"`;
    script = [
      `from ${spec.module} import render`,
      `html = render(output_path=${outPath})`,
      `print(${outPath})`,
    ].join("\n");
  } else {
    script = [
      `from ${spec.module} import ${spec.demoFn}`,
      `result = ${spec.demoFn}()`,
      `print(result)`,
    ].join("\n");
  }

  try {
    const execution = await runCommand("uv", ["run", "python", "-c", script], {
      cwd: craftRoot,
      env: { ...process.env, PYTHONPATH: path.join(craftRoot, "src") },
      signal: extra.signal,
      timeoutMs: RENDER_TIMEOUT_MS,
    });

    if (execution.code !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                module: spec.module,
                target,
                success: false,
                error: execution.stderr.trim() || `Exited with code ${execution.code}`,
                stdout: execution.stdout.trim().slice(0, 500),
              } satisfies RenderResult,
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const outputPath = execution.stdout.trim().split("\n").pop() || spec.outputGlob;
    const absoluteOutput = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(craftRoot, outputPath);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              module: spec.module,
              target,
              success: true,
              outputPath: absoluteOutput,
              metadata: {
                description: spec.description,
                ...(mood ? { mood } : {}),
              },
            } satisfies RenderResult,
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleRunTemplate(
  { module, functionName, args: fnArgs }: { module: string; functionName: string; args?: string },
  extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  // Validate module exists in catalog
  const modInfo = MODULE_CATALOG.find((m) => m.name === module);
  if (!modInfo) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Unknown module '${module}'. Available: ${MODULE_CATALOG.map((m) => m.name).join(
              ", ",
            )}`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (!modInfo.publicApi.includes(functionName)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Function '${functionName}' not in public API of '${module}'. Available: ${modInfo.publicApi.join(
              ", ",
            )}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const craftRoot = resolveCraftRoot();
  const callArgs = fnArgs || "";

  const script = [
    "import json",
    `from craft.${module} import ${functionName}`,
    `result = ${functionName}(${callArgs})`,
    "try:",
    "    print(json.dumps(result, default=str))",
    "except (TypeError, ValueError):",
    "    print(json.dumps({'__repr__': repr(result)}))",
  ].join("\n");

  try {
    const execution = await runCommand("uv", ["run", "python", "-c", script], {
      cwd: craftRoot,
      env: { ...process.env, PYTHONPATH: path.join(craftRoot, "src") },
      signal: extra.signal,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });

    if (execution.code !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                module,
                function: functionName,
                error: execution.stderr.trim() || `Exited with code ${execution.code}`,
              } satisfies TemplateResult,
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const output = execution.stdout.trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = output;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              module,
              function: functionName,
              result: parsed,
            } satisfies TemplateResult,
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleGetRecommendations(
  { seed, hotspots }: { seed?: number; hotspots?: number },
  extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const craftRoot = resolveCraftRoot();
  const seedVal = seed ?? 42;
  const hotspotCount = hotspots ?? 8;

  const script = [
    "import json",
    "from craft.sylveon_heatmap import SylveonSpec, sylveon_render",
    "import matplotlib; matplotlib.use('Agg')",
    `spec = SylveonSpec(seed=${seedVal}, hotspots=${hotspotCount})`,
    "fig, _axes, run = sylveon_render(spec=spec)",
    "import matplotlib.pyplot as plt; plt.close(fig)",
    "recs = [{'id': r.id, 'entry_point': list(r.entry_point), 'lsp_target': r.lsp_target,",
    "         'priority': r.priority, 'task': r.task, 'rationale': r.rationale,",
    "         'best_practice': r.best_practice} for r in run.recommendations]",
    "print(json.dumps({'recommendations': recs, 'count': len(recs),",
    "                   'dwell_seconds': run.dwell_seconds}))",
  ].join("\n");

  try {
    const execution = await runCommand("uv", ["run", "python", "-c", script], {
      cwd: craftRoot,
      env: { ...process.env, PYTHONPATH: path.join(craftRoot, "src") },
      signal: extra.signal,
      timeoutMs: RENDER_TIMEOUT_MS,
    });

    if (execution.code !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: execution.stderr.trim() || `Exited with code ${execution.code}`,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: execution.stdout.trim() }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleFoldContrast(
  { geoA, geoB }: { geoA: string; geoB: string },
  extra: ToolContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const craftRoot = resolveCraftRoot();

  const script = [
    "import json",
    "from craft.context_weave import compute_fold_contrast, GEOANCHORS",
    `result = compute_fold_contrast("${geoA}", "${geoB}")`,
    `anchors = {k: {'city': v.city, 'country': v.country, 'season': v.season, 'metaphor': v.metaphor} for k, v in GEOANCHORS.items()}`,
    "print(json.dumps({'contrast': result, 'available_anchors': anchors}))",
  ].join("\n");

  try {
    const execution = await runCommand("uv", ["run", "python", "-c", script], {
      cwd: craftRoot,
      env: { ...process.env, PYTHONPATH: path.join(craftRoot, "src") },
      signal: extra.signal,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });

    if (execution.code !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: execution.stderr.trim() || `Exited with code ${execution.code}`,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: execution.stdout.trim() }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
}

// ── Server Builder ──────────────────────────────────────────────────────────

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  const registerTool = server.tool.bind(server) as (...args: unknown[]) => void;

  registerTool(
    "health_check",
    "Check craft-server health: python-craft root, uv availability, venv status, and available render modules",
    {},
    handleHealthCheck,
  );

  registerTool(
    "list_modules",
    "List available python-craft modules with descriptions and optional public API details. Filter by tier (T1-T6) for LSP templates.",
    {
      tier: z
        .string()
        .optional()
        .describe("Filter by tier (T1, T2, T3, T4, T5, T6). Omit for all modules."),
      includeApi: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include public API function names"),
    },
    handleListModules,
  );

  registerTool(
    "render",
    "Execute a python-craft render module and produce output artifacts (PNG, GIF, or HTML). " +
      "Available targets: gruff_sketch, gruff_360, gruff_compass_x, gruff_shift_cycles, sylveon, atlas, fireworks, context_weave.",
    {
      target: z
        .enum([
          "gruff_sketch",
          "gruff_360",
          "gruff_compass_x",
          "gruff_shift_cycles",
          "sylveon",
          "atlas",
          "fireworks",
          "context_weave",
        ])
        .describe("Render target module"),
      mood: z
        .enum(["enthusiastic", "curious", "supportive", "playful", "focused", "calm", "creative"])
        .optional()
        .describe("Mood palette for atlas polar field render (default: playful)"),
      outputDir: z
        .string()
        .optional()
        .describe("Override output directory (default: python-craft/out/)"),
    },
    handleRender,
  );

  registerTool(
    "run_template",
    "Execute a specific function from a python-craft module. Validates module and function against the public API catalog before execution.",
    {
      module: z
        .string()
        .min(1)
        .describe("Module name (e.g. 't1_foundation', 'gruff_geometric_sketch')"),
      functionName: z.string().min(1).describe("Public function name to call"),
      args: z
        .string()
        .optional()
        .describe("Python arguments string to pass (e.g. '[1.0, 2.0, 3.0]')"),
    },
    handleRunTemplate,
  );

  registerTool(
    "get_recommendations",
    "Run the Sylveon heatmap analysis and return LSP recommendations targeting basepyright — " +
      "hotspot detection, priority classification, and actionable tasks without producing image output.",
    {
      seed: z.number().int().optional().describe("Random seed for reproducibility (default: 42)"),
      hotspots: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of hotspots to detect (default: 8)"),
    },
    handleGetRecommendations,
  );

  registerTool(
    "fold_contrast",
    "Compute the fold contrast between two geo-anchored contexts from the Context Weave engine. " +
      "Returns distance, season contrast, color blend, metaphor contrast, and fold gradient. " +
      "Available anchors: prince (Dhaka), gridstral (Paris), twu (Fort Worth).",
    {
      geoA: z.string().min(1).describe("First geo anchor ID (e.g. 'prince')"),
      geoB: z.string().min(1).describe("Second geo anchor ID (e.g. 'gridstral')"),
    },
    handleFoldContrast,
  );

  return server;
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting`);
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

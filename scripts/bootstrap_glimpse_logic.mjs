import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseMasterConfig } from "../glimpse-engine/master-config.js";
import { runContextPipeline, validateConfigWithRegistry } from "../glimpse-engine/engine.js";
import { rankViews } from "../glimpse-engine/view-specs.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_REPORT_PATH = resolve(ROOT, "tmp/jupyter-notebook/validation-report.json");
const DATASETS = [
  { id: "innovations", file: resolve(ROOT, "sample-innovations.json"), preset: "researcher" },
  { id: "scenario", file: resolve(ROOT, "sample-scenario.json"), preset: "storyteller" },
  { id: "cross-context", file: resolve(ROOT, "sample-cross-context-demo.json"), preset: "analyst" },
];

function getArg(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function checkNotebookReadiness() {
  const helperCandidates = [
    resolve(process.env.CODEX_HOME || "", "skills/jupyter-notebook/scripts/new_notebook.py"),
    resolve(process.env.HOME || "", ".codex/skills/jupyter-notebook/scripts/new_notebook.py"),
    resolve(ROOT, "../.codex/skills/jupyter-notebook/scripts/new_notebook.py"),
  ].filter(Boolean);
  const result = {
    python3: false,
    notebookHelper: false,
    helperPath: helperCandidates[0] || "",
  };

  try {
    await execFileAsync("python3", ["--version"]);
    result.python3 = true;
  } catch {
    result.python3 = false;
  }

  for (const helperPath of helperCandidates) {
    try {
      await readFile(helperPath, "utf8");
      result.notebookHelper = true;
      result.helperPath = helperPath;
      break;
    } catch {
      result.notebookHelper = false;
    }
  }

  return result;
}

async function loadConfig() {
  const yamlPath = resolve(ROOT, "glimpse.master.yaml");
  const yamlText = await readFile(yamlPath, "utf8");
  return {
    yamlPath,
    config: parseMasterConfig(yamlText),
  };
}

async function runSamples(config) {
  const runs = [];
  for (const dataset of DATASETS) {
    const raw = JSON.parse(await readFile(dataset.file, "utf8"));
    const ctx = runContextPipeline(raw, "json", config, { presetId: dataset.preset });
    const rankedViews = rankViews(ctx, config, dataset.preset);
    runs.push({
      dataset: dataset.id,
      file: dataset.file,
      preset: dataset.preset,
      primaryLens: ctx.primaryLens?.id || "general",
      secondaryLenses: ctx.secondaryLenses.map((lens) => lens.id),
      topViews: rankedViews.slice(0, 3).map((view) => view.id),
      evidenceCount: ctx.evidences.length,
      firedRules: ctx.ruleTraces.filter((trace) => trace.status === "fired").map((trace) => trace.ruleId),
      validation: ctx.validationReport,
    });
  }
  return runs;
}

function buildLaunchInstructions() {
  return {
    serve: "python3 -m http.server 4173",
    open: "http://localhost:4173/glimpse-engine.html",
    note: "If file:// blocks the YAML fetch, serve the folder over HTTP and keep glimpse.master.yaml beside the HTML entry point.",
  };
}

async function main() {
  const quiet = hasFlag("--quiet");
  const reportPath = resolve(getArg("--report-json", DEFAULT_REPORT_PATH));
  const { yamlPath, config } = await loadConfig();
  const registryReport = validateConfigWithRegistry(config);
  const notebookReadiness = await checkNotebookReadiness();
  const sampleRuns = await runSamples(config);
  const summary = {
    generatedAt: new Date().toISOString(),
    yamlPath,
    diagnostics: config.diagnostics || {},
    registry: {
      count: registryReport.registryInventory.length,
      functions: registryReport.registryInventory,
    },
    validationReport: {
      configErrors: registryReport.configErrors,
      missingFunctions: [...new Set(registryReport.missingFunctions)],
      invalidArgs: registryReport.invalidArgs,
      diagnostics: registryReport.diagnostics,
    },
    sampleRuns,
    notebookReadiness,
    launchInstructions: buildLaunchInstructions(),
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(summary, null, 2));

  if (!quiet) {
    console.log("Stage 1: config validation complete.");
    console.log(`Stage 2: ${summary.registry.count} safe functions available.`);
    console.log(`Stage 3: ${sampleRuns.length} sample datasets validated.`);
    console.log(`Stage 4: notebook readiness -> python3=${notebookReadiness.python3}, helper=${notebookReadiness.notebookHelper}.`);
    console.log("Stage 5: launch instructions ready.");
    console.log(`Report: ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

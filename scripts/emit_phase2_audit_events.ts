/**
 * Emit one real lots-server and one real maintain-server audit event into
 * the shared echoes audit NDJSON file (Phase 2 Step 2).
 *
 * Run from workspace root with env set (see docs/plans/2026-03-08-phase2-step2-audit-workflow.md):
 *   npx tsx scripts/emit_phase2_audit_events.ts
 *
 * Requires: ECHOES_AUDIT_PATH (or default ~/.echoes/audit.ndjson), LOTS_EXPERIMENTS_DIR,
 *           CASCADE_WORKSPACE_ROOT, SEEDS_ROOT.
 */

import { mkdtempSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

async function invokeTool(
  server: { _registeredTools: Record<string, { inputSchema?: unknown; handler: (args: unknown, extra: unknown) => Promise<unknown> }> },
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const tool = server._registeredTools[name];
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.inputSchema ? await tool.handler(args, {}) : await tool.handler({});
}

function getTextContent(result: unknown): string | undefined {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  return r?.content?.[0]?.text;
}

function main() {
  const auditPath =
    process.env.ECHOES_AUDIT_PATH?.trim() ||
    path.join(homedir(), ".echoes", "audit.ndjson");

  const experimentsDir =
    process.env.LOTS_EXPERIMENTS_DIR?.trim() ||
    path.join(mkdtempSync(path.join(WORKSPACE_ROOT, "experiments-")), "experiments");

  process.env.ECHOES_AUDIT_PATH = auditPath;
  process.env.LOTS_EXPERIMENTS_DIR = experimentsDir;
  if (!process.env.CASCADE_WORKSPACE_ROOT) process.env.CASCADE_WORKSPACE_ROOT = WORKSPACE_ROOT;
  const seedsRoot = process.env.SEEDS_ROOT?.trim();
  if (!seedsRoot) {
    console.error("SEEDS_ROOT is required for maintain-server. Set it or copy from .env.example.");
    process.exit(1);
  }
  process.env.SEEDS_ROOT = seedsRoot;

  (async () => {
    try {
      // Lots: create + run one experiment → one audit line
      const { buildServer: buildLotsServer } = await import("../lots-server/src/server.ts");
      const lotsServer = buildLotsServer() as Parameters<typeof invokeTool>[0];

      const createResult = await invokeTool(lotsServer, "experiment_create", {
        name: "Phase2 audit emit",
        description: "One-off run to emit a real audit event",
        script: "console.log(0)",
        language: "node",
      });
      const createText = getTextContent(createResult);
      if (!createText) {
        console.error("experiment_create returned no text");
        process.exit(1);
      }
      const { experiment } = JSON.parse(createText);
      if (!experiment?.id) {
        console.error("experiment_create did not return experiment.id");
        process.exit(1);
      }

      await invokeTool(lotsServer, "experiment_run", { experimentId: experiment.id });
      console.log("Lots: one experiment_run audit event emitted.");

      // Maintain: one cleanup dry-run → one audit line
      const { buildServer: buildMaintainServer } = await import("../maintain-server/src/server.ts");
      const maintainServer = buildMaintainServer() as Parameters<typeof invokeTool>[0];
      await invokeTool(maintainServer, "cleanup_execute", {
        actions: [{ type: "temp_clean" }],
        dryRun: true,
      });
      console.log("Maintain: one cleanup_execute audit event emitted.");

      // Show last two lines of audit file
      let lines: string[];
      try {
        const raw = readFileSync(auditPath, "utf-8");
        lines = raw.trim().split("\n").filter(Boolean);
      } catch (e) {
        console.error("Could not read audit file:", e);
        process.exit(1);
      }
      const lastTwo = lines.slice(-2);
      console.log("\nAudit file:", auditPath);
      console.log("Last 2 lines:");
      lastTwo.forEach((line, i) => console.log(`  ${i + 1}. ${line.slice(0, 120)}...`));
    } finally {
      if (experimentsDir.startsWith(path.join(WORKSPACE_ROOT, "experiments-"))) {
        try {
          rmSync(path.dirname(experimentsDir), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  })();
}

main();

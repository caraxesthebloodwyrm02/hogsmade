/**
 * Harness Server — MCP Server
 *
 * Agentic MCP server for the Great League harness pipeline.
 * Wraps the GATE Python harness (models, manifest, pipeline) and exposes:
 * - Scenario execution (Foundation/Probe/Integration layers)
 * - Transistor gate monitoring and signal collection
 * - Autonomous agent loop (arm/cycle/disarm)
 * - Manifest generation via Python harness pipeline
 *
 * Team: Bastiodon (Foundation), Talonflame (Probe), Alolan Exeggutor (Integration)
 * Pipeline: 2 cycles × 68 steps = 136 steps, quantization zones: buildup/silence/drop
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { ActionClass, createHardenedMeritGuard } from "@cascade/shared-types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

import { getConfig } from "./config.js";
import {
  ensureDataDirs,
  readScenarios,
  readSignals,
  latestManifestRef,
  readAgentState,
} from "./storage.js";
import { seedCoreScenarios, registerScenario } from "./scenarios.js";
import { runScenario, generatePythonManifest } from "./runner.js";
import {
  armAgent,
  disarmAgent,
  triggerCycle,
  getAgentState,
} from "./agent.js";

const SERVER_NAME = "harness-server";
const VERSION = "0.1.0";
const config = getConfig();

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  const meritGuard = createHardenedMeritGuard(SERVER_NAME, config.gridApiUrl);
  const registerGuardedTool = meritGuard.registerGuardedTool.bind(meritGuard) as any;
  const registerTool = server.registerTool.bind(server) as any;

  // ── Health Check ──

  registerGuardedTool(
    server,
    "health_check",
    {
      actionClass: ActionClass.PUBLIC_BASIC,
      description: "Check harness-server health and pipeline state",
    },
    async () => {
      await ensureDataDirs();
      const scenarios = await readScenarios();
      const agentState = await getAgentState();
      const latestManifest = await latestManifestRef();

      return {
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        dataDir: config.dataDir,
        manifestDir: config.manifestDir,
        pythonHarnessRoot: config.pythonHarnessRoot,
        scenarioCount: scenarios.length,
        coreScenarios: scenarios.filter((s) =>
          ["bastiodon", "talonflame", "exeggutor-a"].includes(s.name),
        ).length,
        agentState: agentState.state,
        cyclesCompleted: agentState.cyclesCompleted,
        latestManifest: latestManifest?.markdownPath ?? null,
        circuitState: meritGuard.getCircuitState(),
        metrics: meritGuard.getMetrics(),
        timestamp: new Date().toISOString(),
      };
    },
  );

  // ── Harness Run ──

  registerTool(
    "harness_run",
    {
      description:
        "Run a named harness scenario. Core scenarios: bastiodon (Foundation/Buildup), " +
        "talonflame (Probe/Buildup), exeggutor-a (Integration/Drop). " +
        "Run in order: bastiodon → talonflame → exeggutor-a. " +
        "Each run executes the scenario's quantization zone steps, fires transistor gates, " +
        "and emits decorated variables.",
      inputSchema: z.object({
        scenario: z
          .string()
          .describe(
            "Scenario name or ID (e.g. 'bastiodon', 'talonflame', 'exeggutor-a')",
          ),
        cycle: z
          .number()
          .int()
          .min(0)
          .max(1)
          .optional()
          .default(0)
          .describe("Cycle number (0 or 1). Default: 0"),
      }),
    },
    async (args: { scenario: string; cycle?: number }) => {
      await ensureDataDirs();

      try {
        const result = await runScenario(args.scenario, args.cycle ?? 0);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        emitAudit({
          source: SERVER_NAME,
          tool: "harness_run",
          status: "error",
          metadata: { scenario: args.scenario, error: msg },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // ── Harness Status ──

  registerTool(
    "harness_status",
    {
      description:
        "Get current harness execution state — active scenarios, cycle progress, " +
        "transistor gate states, and agent loop status.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();
      const scenarios = await readScenarios();
      const agentState = await getAgentState();

      const active = scenarios.filter((s) => s.status === "running");
      const complete = scenarios.filter((s) => s.status === "complete");
      const pending = scenarios.filter((s) => s.status === "pending");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                timestamp: new Date().toISOString(),
                agentState: agentState.state,
                agentCyclesCompleted: agentState.cyclesCompleted,
                agentCurrentScenario: agentState.currentScenario ?? null,
                agentNextCycleAt: agentState.nextCycleAt ?? null,
                scenarios: {
                  active: active.map((s) => ({
                    name: s.name,
                    layer: s.layer,
                    zone: s.quantizationZone,
                    currentStep: s.currentStep,
                    currentCycle: s.currentCycle,
                  })),
                  complete: complete.map((s) => ({
                    name: s.name,
                    layer: s.layer,
                    completedAt: s.completedAt,
                  })),
                  pending: pending.map((s) => ({ name: s.name, layer: s.layer })),
                },
                transistorGates: scenarios.flatMap((s) =>
                  s.transistorHooks.map((h) => ({
                    scenario: s.name,
                    hookId: h.hookId,
                    state: h.state,
                    armedAt: h.armedAt ?? null,
                    firedAt: h.firedAt ?? null,
                    firedValue: h.firedValue ?? null,
                  })),
                ),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Harness Probe ──

  registerTool(
    "harness_probe",
    {
      description:
        "Probe a running or completed scenario for signals. " +
        "Returns transistor gate state, decorated vars, and anomaly flags. " +
        "Signal staleness of up to 5 steps is expected during Talonflame's Incinerate cadence.",
      inputSchema: z.object({
        scenario_id: z
          .string()
          .describe("Scenario name or ID to probe"),
        signal_type: z
          .enum(["transistor", "decorated_var", "ambient", "anomaly", "all"])
          .optional()
          .default("all")
          .describe("Filter by signal type"),
      }),
    },
    async (args: { scenario_id: string; signal_type?: string }) => {
      await ensureDataDirs();

      const signals = await readSignals(args.scenario_id);
      const scenarios = await readScenarios();
      const scenario = scenarios.find(
        (s) => s.id === args.scenario_id || s.name === args.scenario_id,
      );

      if (!scenario) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Scenario "${args.scenario_id}" not found` },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const filtered =
        args.signal_type === "all" || !args.signal_type
          ? signals
          : args.signal_type === "anomaly"
          ? signals.filter((s) => s.isAnomaly)
          : signals.filter((s) => s.signalType === args.signal_type);

      const anomalyCount = signals.filter((s) => s.isAnomaly).length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                scenarioId: scenario.id,
                scenarioName: scenario.name,
                layer: scenario.layer,
                zone: scenario.quantizationZone,
                status: scenario.status,
                currentStep: scenario.currentStep,
                totalSignals: signals.length,
                anomalyCount,
                staleness_note:
                  scenario.name === "talonflame"
                    ? "Up to 5-step staleness expected (Incinerate cadence)"
                    : undefined,
                signals: filtered.map((s) => ({
                  id: s.id,
                  signalType: s.signalType,
                  key: s.key,
                  value: s.value,
                  step: s.step,
                  cycleIndex: s.cycleIndex,
                  zone: s.zone,
                  intensity: s.intensity,
                  timestamp: s.timestamp,
                  isAnomaly: s.isAnomaly,
                })),
                transistorGates: scenario.transistorHooks.map((h) => ({
                  hookId: h.hookId,
                  state: h.state,
                  armedAt: h.armedAt ?? null,
                  firedAt: h.firedAt ?? null,
                  firedValue: h.firedValue ?? null,
                })),
                decoratedVars: scenario.decoratedVars.map((d) => ({
                  envKey: d.envKey,
                  value: d.value,
                  triggerStep: d.triggerStep,
                  zone: d.zone,
                  firedAt: d.firedAt ?? null,
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

  // ── Harness Manifest ──

  registerTool(
    "harness_manifest",
    {
      description:
        "Generate or retrieve the deployment manifest from the Python harness pipeline. " +
        "The manifest is the canonical output of a complete harness run (both cycles, 136 steps). " +
        "Returns paths to the markdown and JSON manifest files.",
      inputSchema: z.object({
        regenerate: z
          .boolean()
          .optional()
          .default(false)
          .describe("Force regenerate from Python pipeline (default: return latest cached)"),
      }),
    },
    async (args: { regenerate?: boolean }) => {
      await ensureDataDirs();

      let ref = args.regenerate ? null : await latestManifestRef();

      if (!ref) {
        ref = await generatePythonManifest();
      }

      if (!ref) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  manifest: null,
                  message:
                    "No manifest available. Run the full scenario chain (bastiodon → talonflame → exeggutor-a) for both cycles first.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      emitAudit({
        source: SERVER_NAME,
        tool: "harness_manifest",
        status: "success",
        metadata: {
          markdownPath: ref.markdownPath,
          cyclesCompleted: ref.cyclesCompleted,
          transistorsFired: ref.transistorsFired,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(ref, null, 2),
          },
        ],
      };
    },
  );

  // ── Scenario List ──

  registerTool(
    "scenario_list",
    {
      description:
        "List all registered harness scenarios with their layer, zone, and status.",
      inputSchema: z.object({
        layer: z
          .enum(["Foundation", "Probe", "Integration", "Custom"])
          .optional()
          .describe("Filter by layer"),
        zone: z
          .enum(["buildup", "silence", "drop"])
          .optional()
          .describe("Filter by quantization zone"),
      }),
    },
    async (args: { layer?: string; zone?: string }) => {
      await ensureDataDirs();
      let scenarios = await readScenarios();

      if (args.layer) scenarios = scenarios.filter((s) => s.layer === args.layer);
      if (args.zone) scenarios = scenarios.filter((s) => s.quantizationZone === args.zone);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: scenarios.length,
                scenarios: scenarios.map((s) => ({
                  id: s.id,
                  name: s.name,
                  displayName: s.displayName,
                  layer: s.layer,
                  zone: s.quantizationZone,
                  types: s.types,
                  fastMove: s.fastMove,
                  status: s.status,
                  transistorHooks: s.transistorHooks.map((h) => h.hookId),
                  decoratedVars: s.decoratedVars.map((d) => d.envKey),
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

  // ── Scenario Register ──

  registerTool(
    "scenario_register",
    {
      description:
        "Register a new custom harness scenario. Cannot override core scenarios " +
        "(bastiodon, talonflame, exeggutor-a). Must declare a quantization zone.",
      inputSchema: z.object({
        name: z.string().describe("Unique scenario name (lowercase, no spaces)"),
        display_name: z.string().describe("Human-readable name"),
        layer: z
          .enum(["Foundation", "Probe", "Integration", "Custom"])
          .optional()
          .default("Custom")
          .describe("Layer assignment"),
        quantization_zone: z
          .enum(["buildup", "silence", "drop"])
          .describe("Quantization zone binding"),
        types: z.array(z.string()).optional().default([]).describe("Pokemon types"),
        fast_move: z.string().optional().default("").describe("Fast move name"),
        charged_moves: z
          .array(z.string())
          .optional()
          .default([])
          .describe("Charged move names"),
        domain_function: z.string().describe("Domain-function description for this scenario"),
      }),
    },
    async (args: {
      name: string;
      display_name: string;
      layer?: string;
      quantization_zone: string;
      types?: string[];
      fast_move?: string;
      charged_moves?: string[];
      domain_function: string;
    }) => {
      await ensureDataDirs();

      try {
        const scenario = await registerScenario({
          name: args.name,
          displayName: args.display_name,
          layer: args.layer ?? "Custom",
          quantizationZone: args.quantization_zone,
          types: args.types ?? [],
          fastMove: args.fast_move ?? "",
          chargedMoves: args.charged_moves ?? [],
          domainFunction: args.domain_function,
        });

        emitAudit({
          source: SERVER_NAME,
          tool: "scenario_register",
          status: "success",
          metadata: {
            scenarioId: scenario.id,
            name: scenario.name,
            layer: scenario.layer,
            zone: scenario.quantizationZone,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  registered: true,
                  id: scenario.id,
                  name: scenario.name,
                  layer: scenario.layer,
                  zone: scenario.quantizationZone,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // ── Collect Signals ──

  registerTool(
    "collect_signals",
    {
      description:
        "Collect all signals from a scenario run or all scenarios. " +
        "Returns transistor gates, decorated vars, and anomaly flags grouped by zone.",
      inputSchema: z.object({
        scenario_id: z
          .string()
          .optional()
          .describe("Scenario name or ID (omit for all)"),
        zone: z
          .enum(["buildup", "silence", "drop"])
          .optional()
          .describe("Filter by quantization zone"),
        anomalies_only: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return only signals that fired in the silence zone (anomalies)"),
      }),
    },
    async (args: { scenario_id?: string; zone?: string; anomalies_only?: boolean }) => {
      await ensureDataDirs();
      let signals = await readSignals(args.scenario_id);

      if (args.zone) signals = signals.filter((s) => s.zone === args.zone);
      if (args.anomalies_only) signals = signals.filter((s) => s.isAnomaly);

      const byZone = {
        buildup: signals.filter((s) => s.zone === "buildup"),
        silence: signals.filter((s) => s.zone === "silence"),
        drop: signals.filter((s) => s.zone === "drop"),
      };

      const anomalyCount = signals.filter((s) => s.isAnomaly).length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalSignals: signals.length,
                anomalyCount,
                byZone: {
                  buildup: byZone.buildup.length,
                  silence: byZone.silence.length,
                  drop: byZone.drop.length,
                },
                signals: signals.map((s) => ({
                  id: s.id,
                  scenario: s.scenarioName,
                  signalType: s.signalType,
                  key: s.key,
                  value: s.value,
                  step: s.step,
                  cycleIndex: s.cycleIndex,
                  cycle: s.cycle,
                  zone: s.zone,
                  intensity: s.intensity,
                  isAnomaly: s.isAnomaly,
                  timestamp: s.timestamp,
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

  // ── Get Scenario Insights ──

  registerTool(
    "get_scenario_insights",
    {
      description:
        "Aggregated insights from all collected harness signals. " +
        "Summarizes transistor chain health, double-weakness patterns, " +
        "cadence compliance, and manifest completeness.",
      inputSchema: z.object({
        scenario_id: z
          .string()
          .optional()
          .describe("Scope to a specific scenario (omit for full team analysis)"),
      }),
    },
    async (args: { scenario_id?: string }) => {
      await ensureDataDirs();
      const signals = await readSignals(args.scenario_id);
      const scenarios = await readScenarios();
      const latestManifest = await latestManifestRef();

      const transistorSignals = signals.filter((s) => s.signalType === "transistor");
      const successFires = transistorSignals.filter((s) => s.value === "1");
      const failFires = transistorSignals.filter((s) => s.value === "0");
      const anomalies = signals.filter((s) => s.isAnomaly);
      const silenceSignals = signals.filter((s) => s.zone === "silence");

      // Check probe cadence (Talonflame — 5-step cadence)
      const probeSignals = transistorSignals.filter((s) =>
        s.key.includes("EMIT_PROBE"),
      );
      let cadenceCompliant = true;
      if (probeSignals.length > 1) {
        for (let i = 1; i < probeSignals.length; i++) {
          const gap = probeSignals[i].cycleIndex - probeSignals[i - 1].cycleIndex;
          if (gap !== 5 && gap !== 0) {
            cadenceCompliant = false;
          }
        }
      }

      // Check double-weakness (Exeggutor — two paths sharing cold dependency)
      const integrationSignals = signals.filter(
        (s) => s.scenarioName === "exeggutor-a",
      );
      const coldPathSignals = integrationSignals.filter((s) =>
        s.key.includes("COLD_PATH"),
      );
      const doubleWeaknessDetected = coldPathSignals.length >= 2;

      // Chain health
      const armFired = successFires.some((s) => s.key.includes("ARM_FOUNDATION"));
      const probeFired = successFires.some((s) => s.key.includes("EMIT_PROBE"));
      const integrationFired = successFires.some((s) =>
        s.key.includes("FIRE_INTEGRATION"),
      );

      const chainHealth =
        armFired && probeFired && integrationFired
          ? "healthy"
          : armFired && probeFired
          ? "partial (integration not fired)"
          : armFired
          ? "partial (probe not fired)"
          : "incomplete (foundation not armed)";

      emitAudit({
        source: SERVER_NAME,
        tool: "get_scenario_insights",
        status: "success",
        metadata: {
          totalSignals: signals.length,
          transistorsFired: successFires.length,
          anomalyCount: anomalies.length,
          chainHealth,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                scope: args.scenario_id ?? "full team",
                chainHealth,
                transistorChain: {
                  ARM_FOUNDATION: armFired,
                  EMIT_PROBE: probeFired,
                  FIRE_INTEGRATION: integrationFired,
                  totalSuccessFires: successFires.length,
                  totalFailFires: failFires.length,
                },
                probeLayer: {
                  cadenceCompliant,
                  cadenceSteps: 5,
                  probeEmissions: probeSignals.length,
                  note: cadenceCompliant
                    ? "Probe cadence is healthy (5-step Incinerate window)"
                    : "Probe cadence violation detected — consumer may be polling mid-channel",
                },
                integrationLayer: {
                  doubleWeaknessDetected,
                  coldPathSignals: coldPathSignals.length,
                  note: doubleWeaknessDetected
                    ? "Double-weakness detected: two signal paths share COLD_PATH dependency. Redesign to use shared init."
                    : "No double-weakness pattern detected",
                },
                silenceZone: {
                  signalCount: silenceSignals.length,
                  anomalyCount: anomalies.length,
                  clean: silenceSignals.length === 0,
                  note:
                    silenceSignals.length > 0
                      ? `${silenceSignals.length} signal(s) in silence zone — treat as noise, do not act`
                      : "Silence zone is clean",
                },
                manifest: latestManifest
                  ? {
                      markdownPath: latestManifest.markdownPath,
                      cyclesCompleted: latestManifest.cyclesCompleted,
                      totalSteps: latestManifest.totalSteps,
                      totalPassed: latestManifest.totalPassed,
                      complete: latestManifest.totalPassed === latestManifest.totalSteps,
                    }
                  : null,
                scenarios: scenarios.map((s) => ({
                  name: s.name,
                  layer: s.layer,
                  zone: s.quantizationZone,
                  status: s.status,
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

  // ── Agent Arm ──

  registerTool(
    "agent_arm",
    {
      description:
        "Arm the autonomous agent loop. The agent will run the full scenario chain " +
        "(bastiodon → talonflame → exeggutor-a) on a schedule. " +
        "This is the key differentiator of harness-server: fully autonomous operation.",
      inputSchema: z.object({
        interval_seconds: z
          .number()
          .int()
          .min(10)
          .max(3600)
          .optional()
          .default(60)
          .describe("Seconds between autonomous cycles (default: 60)"),
        max_cycles: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(2)
          .describe("Maximum cycles before auto-disarm (default: 2)"),
      }),
    },
    async (args: { interval_seconds?: number; max_cycles?: number }) => {
      await ensureDataDirs();

      try {
        const state = await armAgent(args.interval_seconds ?? 60, args.max_cycles ?? 2);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  armed: true,
                  state: state.state,
                  armedAt: state.armedAt,
                  intervalSeconds: state.intervalSeconds,
                  maxCycles: state.maxCycles,
                  nextCycleAt: state.nextCycleAt,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // ── Agent Cycle ──

  registerTool(
    "agent_cycle",
    {
      description:
        "Manually trigger one agent cycle without waiting for the scheduled interval. " +
        "Runs the full scenario chain once: bastiodon → talonflame → exeggutor-a.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();

      try {
        const record = await triggerCycle();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // ── Agent Disarm ──

  registerTool(
    "agent_disarm",
    {
      description:
        "Stop the autonomous agent loop. Clears the scheduled interval and marks the agent as disarmed. " +
        "Safe to call at any time — if a cycle is running, it will complete before disarming takes effect.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();

      const state = await disarmAgent();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                disarmed: true,
                state: state.state,
                cyclesCompleted: state.cyclesCompleted,
                disarmedAt: state.disarmedAt,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Agent Status ──

  registerTool(
    "agent_status",
    {
      description:
        "Get current autonomous agent state — armed/running/disarmed, cycles completed, " +
        "current scenario, last signal, and full cycle history.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();
      const state = await getAgentState();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                state: state.state,
                armedAt: state.armedAt ?? null,
                disarmedAt: state.disarmedAt ?? null,
                intervalSeconds: state.intervalSeconds,
                maxCycles: state.maxCycles,
                cyclesCompleted: state.cyclesCompleted,
                currentCycle: state.currentCycle ?? null,
                currentScenario: state.currentScenario ?? null,
                nextCycleAt: state.nextCycleAt ?? null,
                lastSignal: state.lastSignal
                  ? {
                      key: state.lastSignal.key,
                      value: state.lastSignal.value,
                      scenario: state.lastSignal.scenarioName,
                      zone: state.lastSignal.zone,
                      timestamp: state.lastSignal.timestamp,
                    }
                  : null,
                errorMessage: state.errorMessage ?? null,
                cycleHistory: state.cycleHistory.map((c) => ({
                  cycleNumber: c.cycleNumber,
                  startedAt: c.startedAt,
                  completedAt: c.completedAt ?? null,
                  status: c.status,
                  scenariosRun: c.scenariosRun,
                  signalsCollected: c.signalsCollected,
                  transistorsFired: c.transistorsFired,
                  anomaliesDetected: c.anomaliesDetected,
                  manifestWritten: c.manifestWritten ?? null,
                  errorMessage: c.errorMessage ?? null,
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

  return server;
}

// ── Main ──

async function main() {
  await ensureDataDirs();
  await seedCoreScenarios();

  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err);
  process.exit(1);
});

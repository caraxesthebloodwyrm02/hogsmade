/**
 * Harness Server — Agent Loop
 *
 * Autonomous agent loop that runs scenarios on a schedule.
 * Uses transistor gate sequencing: Foundation → Probe → Integration.
 * Self-scheduling via setInterval, disarmable on demand.
 *
 * The agent loop is the key differentiator of harness-server from ori-server.
 * It is autonomous: it runs the full scenario chain without human intervention.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import type { AgentLoopState, AgentCycleRecord } from "./types.js";
import {
  readAgentState,
  writeAgentState,
  readScenarios,
} from "./storage.js";
import { runScenario, generatePythonManifest } from "./runner.js";

const SERVER_NAME = "harness-server";

// Core scenario execution order (Foundation → Probe → Integration)
const CORE_SCENARIO_ORDER = ["bastiodon", "talonflame", "exeggutor-a"] as const;

// Internal timer handle
let agentTimer: ReturnType<typeof setInterval> | null = null;

// ── Arm ──

export async function armAgent(
  intervalSeconds: number = 60,
  maxCycles: number = 2,
): Promise<AgentLoopState> {
  const existing = await readAgentState();
  if (existing && existing.state === "armed") {
    throw new Error("Agent loop is already armed. Disarm first.");
  }
  if (existing && existing.state === "running") {
    throw new Error("Agent loop is currently running a cycle. Wait or disarm.");
  }

  const state: AgentLoopState = {
    state: "armed",
    armedAt: new Date().toISOString(),
    intervalSeconds,
    maxCycles,
    cyclesCompleted: 0,
    cycleHistory: [],
    nextCycleAt: new Date(Date.now() + intervalSeconds * 1000).toISOString(),
  };

  await writeAgentState(state);

  // Schedule the autonomous loop
  agentTimer = setInterval(async () => {
    await runAgentCycle();
  }, intervalSeconds * 1000);

  emitAudit({
    source: SERVER_NAME,
    tool: "agent_arm",
    status: "success",
    metadata: { intervalSeconds, maxCycles },
  });

  return state;
}

// ── Disarm ──

export async function disarmAgent(): Promise<AgentLoopState> {
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }

  const state = (await readAgentState()) ?? {
    state: "idle" as const,
    intervalSeconds: 60,
    maxCycles: 2,
    cyclesCompleted: 0,
    cycleHistory: [],
  };

  state.state = "disarmed";
  state.disarmedAt = new Date().toISOString();
  await writeAgentState(state);

  emitAudit({
    source: SERVER_NAME,
    tool: "agent_disarm",
    status: "success",
    metadata: {
      cyclesCompleted: state.cyclesCompleted,
      disarmedAt: state.disarmedAt,
    },
  });

  return state;
}

// ── Manual Cycle Trigger ──

export async function triggerCycle(): Promise<AgentCycleRecord> {
  return runAgentCycle(true);
}

// ── Get State ──

export async function getAgentState(): Promise<AgentLoopState> {
  const state = await readAgentState();
  if (!state) {
    return {
      state: "idle",
      intervalSeconds: 60,
      maxCycles: 2,
      cyclesCompleted: 0,
      cycleHistory: [],
    };
  }
  return state;
}

// ── Internal Cycle Runner ──

async function runAgentCycle(manual: boolean = false): Promise<AgentCycleRecord> {
  const state = await readAgentState();

  // Check if we should still be running
  if (state && !manual) {
    if (state.state === "disarmed") {
      if (agentTimer) {
        clearInterval(agentTimer);
        agentTimer = null;
      }
      throw new Error("Agent is disarmed; skipping cycle");
    }

    if (state.cyclesCompleted >= state.maxCycles) {
      // Max cycles reached — auto-disarm
      await disarmAgent();
      throw new Error(`Max cycles (${state.maxCycles}) reached; auto-disarmed`);
    }
  }

  const cycleNumber = state ? state.cyclesCompleted : 0;
  const cycleRecord: AgentCycleRecord = {
    cycleNumber,
    startedAt: new Date().toISOString(),
    scenariosRun: [],
    signalsCollected: 0,
    transistorsFired: 0,
    anomaliesDetected: 0,
    status: "running",
  };

  // Update state to running
  if (state) {
    state.state = "running";
    state.currentCycle = cycleNumber;
    await writeAgentState(state);
  }

  try {
    // Run core scenarios in order: Foundation → Probe → Integration
    const scenarios = await readScenarios();
    const available = new Set(scenarios.map((s) => s.name));

    for (const scenarioName of CORE_SCENARIO_ORDER) {
      if (!available.has(scenarioName)) {
        continue;
      }

      if (state) {
        state.currentScenario = scenarioName;
        await writeAgentState(state);
      }

      const result = await runScenario(scenarioName, cycleNumber);

      cycleRecord.scenariosRun.push(scenarioName);
      cycleRecord.signalsCollected += result.signalsEmitted;
      cycleRecord.transistorsFired += result.transistorsFired;
      cycleRecord.anomaliesDetected += result.anomalyCount;

      // Update last signal in state
      if (state) {
        const allScenarios = await readScenarios();
        const ran = allScenarios.find((s) => s.name === scenarioName);
        if (ran && ran.signals.length > 0) {
          state.lastSignal = ran.signals[ran.signals.length - 1];
        }
      }
    }

    // Try to generate manifest after integration fires
    try {
      const manifestRef = await generatePythonManifest();
      if (manifestRef) {
        cycleRecord.manifestWritten = manifestRef.markdownPath;
      }
    } catch {
      // Non-fatal — manifest generation may not be available
    }

    cycleRecord.completedAt = new Date().toISOString();
    cycleRecord.status = "complete";

    // Update agent state
    if (state) {
      state.state = "armed"; // back to armed for next cycle
      state.cyclesCompleted = cycleNumber + 1;
      state.currentScenario = undefined;
      state.cycleHistory.push(cycleRecord);
      state.nextCycleAt = new Date(
        Date.now() + state.intervalSeconds * 1000,
      ).toISOString();

      // Auto-disarm if max cycles reached
      if (state.cyclesCompleted >= state.maxCycles) {
        await disarmAgent();
      } else {
        await writeAgentState(state);
      }
    }

    emitAudit({
      source: SERVER_NAME,
      tool: "agent_cycle",
      status: "success",
      metadata: {
        cycleNumber,
        scenariosRun: cycleRecord.scenariosRun,
        signalsCollected: cycleRecord.signalsCollected,
        transistorsFired: cycleRecord.transistorsFired,
        anomaliesDetected: cycleRecord.anomaliesDetected,
        manual,
      },
    });

    return cycleRecord;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cycleRecord.status = "failed";
    cycleRecord.errorMessage = msg;
    cycleRecord.completedAt = new Date().toISOString();

    if (state) {
      state.state = "error";
      state.errorMessage = msg;
      state.cycleHistory.push(cycleRecord);
      await writeAgentState(state);
    }

    emitAudit({
      source: SERVER_NAME,
      tool: "agent_cycle",
      status: "failure",
      metadata: { cycleNumber, error: msg, manual },
    });

    return cycleRecord;
  }
}

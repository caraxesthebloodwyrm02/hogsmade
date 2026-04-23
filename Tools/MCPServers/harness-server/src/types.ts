/**
 * Harness Server — Types
 *
 * Domain types for the Great League harness pipeline:
 * Bastiodon (Foundation), Talonflame (Probe), Alolan Exeggutor (Integration)
 */

// ── Quantization Zones ──

export type QuantizationZone = "buildup" | "silence" | "drop";

// Buildup: steps 0-43 per cycle (44 steps, 0.1→0.7 intensity)
// Silence: steps 44-47 per cycle (4 steps, 0.0 intensity)
// Drop: steps 48-67 per cycle (20 steps, 1.0 intensity)

export const BUILDUP_RANGE: [number, number] = [0, 44];
export const SILENCE_RANGE: [number, number] = [44, 48];
export const DROP_RANGE: [number, number] = [48, 68];

export function zoneForStep(cycleIndex: number): QuantizationZone {
  if (cycleIndex >= BUILDUP_RANGE[0] && cycleIndex < BUILDUP_RANGE[1]) return "buildup";
  if (cycleIndex >= SILENCE_RANGE[0] && cycleIndex < SILENCE_RANGE[1]) return "silence";
  return "drop";
}

export function intensityForStep(cycleIndex: number): number {
  const zone = zoneForStep(cycleIndex);
  if (zone === "buildup") {
    const progress = (cycleIndex - BUILDUP_RANGE[0]) / (BUILDUP_RANGE[1] - BUILDUP_RANGE[0]);
    return 0.1 + progress * 0.6;
  }
  if (zone === "silence") return 0.0;
  return 1.0;
}

// ── Harness Layers ──

export type HarnessLayer = "Foundation" | "Probe" | "Integration" | "Custom";

// ── Transistor Gate ──

export type TransistorState = "ON" | "OFF";

export interface TransistorGate {
  hookId: string;
  signal: string;
  armedAtStep: number;
  firesAtStep: number;
  state: TransistorState;
  armedAt?: string; // ISO timestamp
  firedAt?: string; // ISO timestamp
  firedValue?: "0" | "1"; // "1" = success fire, "0" = failure (armed=OFF at fire step)
}

// ── Decorated Variable ──

export interface DecoratedVar {
  name: string;
  envKey: string;
  value: string;
  triggerStep: number;
  zone: QuantizationZone;
  fireOn: "step_enter" | "step_exit" | "checkpoint";
  firedAt?: string; // ISO timestamp
}

// ── Signal ──

export type SignalType = "transistor" | "decorated_var" | "ambient" | "anomaly";

export interface HarnessSignal {
  id: string;
  scenarioId: string;
  scenarioName: string;
  signalType: SignalType;
  key: string;
  value: string;
  step: number;
  cycleIndex: number;
  cycle: number;
  zone: QuantizationZone;
  intensity: number;
  timestamp: string;
  isAnomaly: boolean; // true if signal fires in silence zone
}

// ── Scenario ──

export type ScenarioStatus = "pending" | "running" | "complete" | "failed";

export interface HarnessScenario {
  id: string;
  name: string; // e.g. "bastiodon", "talonflame", "exeggutor-a"
  displayName: string; // e.g. "Bastiodon — Foundation Layer Anchor"
  layer: HarnessLayer;
  quantizationZone: QuantizationZone;
  types: string[]; // e.g. ["Steel", "Rock"]
  fastMove: string;
  chargedMoves: string[];
  domainFunction: string;
  transistorHooks: TransistorGate[];
  decoratedVars: DecoratedVar[];
  status: ScenarioStatus;
  currentStep: number;
  currentCycle: number;
  startedAt?: string;
  completedAt?: string;
  signals: HarnessSignal[];
  errorMessage?: string;
  /** Threat model IDs confirmed by a successful run of this scenario. */
  threatIds?: string[];
  /** Project registry ID this scenario tests against (defaults to "grid-main"). */
  projectId?: string;
}

// ── Manifest Reference ──

export interface ManifestRef {
  markdownPath: string;
  jsonPath: string;
  writtenAt: string;
  totalSteps: number;
  totalPassed: number;
  transistorsFired: number;
  cyclesCompleted: number;
}

// ── Agent State ──

export type AgentState = "idle" | "armed" | "running" | "disarmed" | "error";

export interface AgentCycleRecord {
  cycleNumber: number;
  startedAt: string;
  completedAt?: string;
  scenariosRun: string[];
  signalsCollected: number;
  transistorsFired: number;
  anomaliesDetected: number;
  manifestWritten?: string;
  status: "running" | "complete" | "failed";
  errorMessage?: string;
}

export interface AgentLoopState {
  state: AgentState;
  armedAt?: string;
  intervalSeconds: number;
  maxCycles: number;
  cyclesCompleted: number;
  currentCycle?: number;
  currentScenario?: string;
  lastSignal?: HarnessSignal;
  cycleHistory: AgentCycleRecord[];
  nextCycleAt?: string;
  disarmedAt?: string;
  errorMessage?: string;
}

// ── Run Result ──

export interface HarnessRunResult {
  /** Unique run ID generated at the start of runScenario. */
  runId: string;
  scenarioId: string;
  scenarioName: string;
  cycle: number;
  stepsExecuted: number;
  transistorsFired: number;
  decoratedVarsFired: number;
  signalsEmitted: number;
  anomalyCount: number;
  status: ScenarioStatus;
  durationMs: number;
  errorMessage?: string;
}

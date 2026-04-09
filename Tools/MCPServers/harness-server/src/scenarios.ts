/**
 * Harness Server — Scenarios
 *
 * Built-in scenario definitions for the three core Great League members
 * and registration logic for custom scenarios.
 */

import { generateId } from "@cascade/shared-types/id";
import type {
  HarnessScenario,
  TransistorGate,
  DecoratedVar,
} from "./types.js";
import {
  readScenarios,
  writeScenarios,
  upsertScenario,
} from "./storage.js";

// ── Core Scenario Definitions ──

function makeBastiodon(): HarnessScenario {
  const hooks: TransistorGate[] = [
    {
      hookId: "ARM_FOUNDATION",
      signal: "HARNESS_TRANSISTOR",
      armedAtStep: 12,
      firesAtStep: 43,
      state: "OFF",
    },
  ];

  return {
    id: "bastiodon",
    name: "bastiodon",
    displayName: "Bastiodon — Foundation Layer Anchor",
    layer: "Foundation",
    quantizationZone: "buildup",
    types: ["Steel", "Rock"],
    fastMove: "Smack Down",
    chargedMoves: ["Stone Edge", "Flamethrower"],
    domainFunction:
      "Long-running stability, bulk, persistence, fail-closed anchor. Arms the transistor gate across the full buildup window.",
    transistorHooks: hooks,
    decoratedVars: [],
    status: "pending",
    currentStep: 0,
    currentCycle: 0,
    signals: [],
  };
}

function makeTalonflame(): HarnessScenario {
  const hooks: TransistorGate[] = [
    {
      hookId: "EMIT_PROBE",
      signal: "HARNESS_PROBE",
      armedAtStep: 15,
      firesAtStep: 28,
      state: "OFF",
    },
  ];

  const dvars: DecoratedVar[] = [
    {
      name: "PROBE_CADENCE",
      envKey: "HARNESS_PROBE_CADENCE",
      value: "5",
      triggerStep: 28,
      zone: "buildup",
      fireOn: "step_enter",
    },
  ];

  return {
    id: "talonflame",
    name: "talonflame",
    displayName: "Talonflame — Probe Layer Emitter",
    layer: "Probe",
    quantizationZone: "buildup",
    types: ["Fire", "Flying"],
    fastMove: "Incinerate",
    chargedMoves: ["Brave Bird", "Flame Charge"],
    domainFunction:
      "Fast signal emission, fixed 5-step cadence (Incinerate channel), high-throughput scanning, energy accumulation before drop.",
    transistorHooks: hooks,
    decoratedVars: dvars,
    status: "pending",
    currentStep: 0,
    currentCycle: 0,
    signals: [],
  };
}

function makeExeggutorA(): HarnessScenario {
  const hooks: TransistorGate[] = [
    {
      hookId: "FIRE_INTEGRATION",
      signal: "HARNESS_TRANSISTOR",
      armedAtStep: 50,
      firesAtStep: 65,
      state: "OFF",
    },
  ];

  const dvars: DecoratedVar[] = [
    {
      name: "MANIFEST_WRITTEN",
      envKey: "HARNESS_MANIFEST_WRITTEN",
      value: "1",
      triggerStep: 65,
      zone: "drop",
      fireOn: "step_exit",
    },
  ];

  return {
    id: "exeggutor-a",
    name: "exeggutor-a",
    displayName: "Alolan Exeggutor — Integration Layer Coverage",
    layer: "Integration",
    quantizationZone: "drop",
    types: ["Grass", "Dragon"],
    fastMove: "Dragon Tail",
    chargedMoves: ["Dragon Pulse", "Seed Bomb"],
    domainFunction:
      "Cross-domain calls, multi-type coverage, collaboration scenarios. Fires the drop zone burst after Foundation arms and Probe primes.",
    transistorHooks: hooks,
    decoratedVars: dvars,
    status: "pending",
    currentStep: 0,
    currentCycle: 0,
    signals: [],
  };
}

// ── Seed Core Scenarios ──

export async function seedCoreScenarios(): Promise<void> {
  const existing = await readScenarios();
  const existingIds = new Set(existing.map((s) => s.id));

  const cores = [makeBastiodon(), makeTalonflame(), makeExeggutorA()];
  const toAdd = cores.filter((c) => !existingIds.has(c.id));

  if (toAdd.length > 0) {
    await writeScenarios([...existing, ...toAdd]);
  }
}

// ── Register Custom Scenario ──

export interface ScenarioRegistration {
  name: string;
  displayName: string;
  layer: string;
  quantizationZone: string;
  types: string[];
  fastMove: string;
  chargedMoves: string[];
  domainFunction: string;
}

export async function registerScenario(
  reg: ScenarioRegistration,
): Promise<HarnessScenario> {
  // Validate zone
  if (!["buildup", "silence", "drop"].includes(reg.quantizationZone)) {
    throw new Error(
      `Invalid quantization_zone "${reg.quantizationZone}". Must be buildup, silence, or drop.`,
    );
  }

  // Prevent overriding core scenarios
  const coreIds = ["bastiodon", "talonflame", "exeggutor-a"];
  const safeName = reg.name.toLowerCase().trim();
  if (coreIds.includes(safeName)) {
    throw new Error(
      `Cannot re-register core scenario "${reg.name}". Use a unique name.`,
    );
  }

  const scenario: HarnessScenario = {
    id: generateId(`scenario-${safeName}`),
    name: safeName,
    displayName: reg.displayName,
    layer: (reg.layer as HarnessScenario["layer"]) ?? "Custom",
    quantizationZone: reg.quantizationZone as HarnessScenario["quantizationZone"],
    types: reg.types,
    fastMove: reg.fastMove,
    chargedMoves: reg.chargedMoves,
    domainFunction: reg.domainFunction,
    transistorHooks: [],
    decoratedVars: [],
    status: "pending",
    currentStep: 0,
    currentCycle: 0,
    signals: [],
  };

  await upsertScenario(scenario);
  return scenario;
}

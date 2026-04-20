/**
 * Harness Server — Storage
 *
 * Persistence for scenarios, signals, agent state, and manifest refs.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getConfig } from "./config.js";
import type { HarnessScenario, HarnessSignal, AgentLoopState, ManifestRef } from "./types.js";

const config = getConfig();

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.manifestDir, { recursive: true });
}

// ── Scenarios ──

export async function readScenarios(): Promise<HarnessScenario[]> {
  try {
    const raw = await fs.readFile(config.scenariosFile, "utf-8");
    return JSON.parse(raw) as HarnessScenario[];
  } catch {
    return [];
  }
}

export async function writeScenarios(scenarios: HarnessScenario[]): Promise<void> {
  await fs.writeFile(config.scenariosFile, JSON.stringify(scenarios, null, 2), "utf-8");
}

export async function getScenario(nameOrId: string): Promise<HarnessScenario | undefined> {
  const all = await readScenarios();
  return all.find((s) => s.id === nameOrId || s.name === nameOrId);
}

export async function upsertScenario(scenario: HarnessScenario): Promise<void> {
  const all = await readScenarios();
  const idx = all.findIndex((s) => s.id === scenario.id);
  if (idx >= 0) {
    all[idx] = scenario;
  } else {
    all.push(scenario);
  }
  await writeScenarios(all);
}

// ── Signals ──

export async function appendSignals(signals: HarnessSignal[]): Promise<void> {
  const lines = signals.map((s) => JSON.stringify(s)).join("\n") + "\n";
  await fs.appendFile(config.signalsFile, lines, "utf-8");
}

export async function readSignals(scenarioId?: string): Promise<HarnessSignal[]> {
  try {
    const raw = await fs.readFile(config.signalsFile, "utf-8");
    const all = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as HarnessSignal);
    if (scenarioId) return all.filter((s) => s.scenarioId === scenarioId);
    return all;
  } catch {
    return [];
  }
}

export async function clearSignals(): Promise<void> {
  await fs.writeFile(config.signalsFile, "", "utf-8");
}

// ── Agent State ──

export async function readAgentState(): Promise<AgentLoopState | null> {
  try {
    const raw = await fs.readFile(config.agentStateFile, "utf-8");
    return JSON.parse(raw) as AgentLoopState;
  } catch {
    return null;
  }
}

export async function writeAgentState(state: AgentLoopState): Promise<void> {
  await fs.writeFile(config.agentStateFile, JSON.stringify(state, null, 2), "utf-8");
}

// ── Manifest Refs ──

const manifestRefsFile = () => path.join(config.dataDir, "manifest-refs.json");

export async function readManifestRefs(): Promise<ManifestRef[]> {
  try {
    const raw = await fs.readFile(manifestRefsFile(), "utf-8");
    return JSON.parse(raw) as ManifestRef[];
  } catch {
    return [];
  }
}

export async function appendManifestRef(ref: ManifestRef): Promise<void> {
  const refs = await readManifestRefs();
  refs.push(ref);
  await fs.writeFile(manifestRefsFile(), JSON.stringify(refs, null, 2), "utf-8");
}

export async function latestManifestRef(): Promise<ManifestRef | null> {
  const refs = await readManifestRefs();
  if (refs.length === 0) return null;
  return refs[refs.length - 1];
}

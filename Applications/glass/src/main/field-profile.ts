import fs from "fs";
import path from "path";
import {
  ASSET_RARITIES,
  THRESHOLD_STATES,
  isAssetRarity,
  type FieldEnvelope,
  type FieldEngineSpec,
  type FieldModulationSpec,
  type FieldProfile,
  type RarityGateMap,
  type ThresholdState,
  type WorkflowFunctionProfile,
  type WorkflowLaneProfile,
  type WorkflowProfile,
} from "../../bridge/schema";

const DEFAULT_PROFILE_RELATIVE_PATH = "config/field-profile.json";
const OVERRIDE_ENV_KEY = "GLASS_FIELD_PROFILE_PATH";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampString(value: unknown, fallback = "", max = 256): string {
  if (typeof value !== "string") return fallback;
  return value.length > max ? value.slice(0, max) : value;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function parseEnvelopeStrict(raw: unknown, state: ThresholdState): FieldEnvelope {
  const obj = asRecord(raw);
  if (!obj) throw new Error(`field-profile modulation.envelopes.${state} must be an object`);
  return {
    sustain: clampNumber(obj.sustain, 0, 0, 1),
    lfoRate: clampNumber(obj.lfoRate, 0, 0, 10),
    lfoDepth: clampNumber(obj.lfoDepth, 0, 0, 1),
  };
}

function parseBusStrict(
  raw: unknown,
  label: string,
  keys: readonly string[],
): Record<string, number> {
  const obj = asRecord(raw);
  if (!obj) throw new Error(`field-profile ${label} must be an object`);
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = clampNumber(obj[key], 0, 0, 100);
  }
  return out;
}

function extractRarityGateSource(profile: JsonRecord | null): unknown {
  if (!profile) return null;
  if (profile.rarityGate != null) return profile.rarityGate;
  const ceremony = asRecord(profile.ceremony);
  return ceremony?.rarityGate ?? null;
}

function parseRarityGateStrict(raw: unknown): RarityGateMap {
  const obj = asRecord(raw);
  if (!obj) throw new Error("field-profile rarityGate must be an object");
  const gate = {} as RarityGateMap;
  for (const state of THRESHOLD_STATES) {
    const rarity = obj[state];
    if (!isAssetRarity(rarity)) {
      throw new Error(
        `field-profile rarityGate.${state} must be one of ${ASSET_RARITIES.join(", ")}`,
      );
    }
    gate[state] = rarity;
  }
  return gate;
}

function parseStringArray(raw: unknown, fallback: string[], max = 256): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const values = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => clampString(value, "", max))
    .filter((value) => value.length > 0);
  return values.length > 0 ? values : [...fallback];
}

function parseWorkflowFunction(
  raw: unknown,
  fallback?: WorkflowFunctionProfile,
): WorkflowFunctionProfile {
  const obj = asRecord(raw);
  if (!obj && fallback) return { ...fallback };
  if (!obj) throw new Error("field-profile workflow.functions entries must be objects");

  const base = fallback ?? {
    id: "",
    label: "",
    intent: "",
    inputs: [],
    outputs: [],
  };

  const item: WorkflowFunctionProfile = {
    id: clampString(obj.id, base.id, 64),
    label: clampString(obj.label, base.label, 128),
    intent: clampString(obj.intent, base.intent, 512),
    inputs: parseStringArray(obj.inputs, base.inputs),
    outputs: parseStringArray(obj.outputs, base.outputs),
  };

  if (
    !item.id ||
    !item.label ||
    !item.intent ||
    item.inputs.length === 0 ||
    item.outputs.length === 0
  ) {
    throw new Error(
      "field-profile workflow.functions entries require id, label, intent, inputs, and outputs",
    );
  }

  return item;
}

function parseWorkflowLane(raw: unknown, fallback?: WorkflowLaneProfile): WorkflowLaneProfile {
  const obj = asRecord(raw);
  if (!obj && fallback) return { ...fallback };
  if (!obj) throw new Error("field-profile workflow.lanes entries must be objects");

  const base = fallback ?? {
    id: "",
    label: "",
    intent: "",
    inputs: [],
    outputs: [],
    discoveryRoom: [],
  };

  const item: WorkflowLaneProfile = {
    id: clampString(obj.id, base.id, 64),
    label: clampString(obj.label, base.label, 128),
    intent: clampString(obj.intent, base.intent, 512),
    inputs: parseStringArray(obj.inputs, base.inputs),
    outputs: parseStringArray(obj.outputs, base.outputs),
    discoveryRoom: parseStringArray(obj.discoveryRoom, base.discoveryRoom),
  };

  if (
    !item.id ||
    !item.label ||
    !item.intent ||
    item.inputs.length === 0 ||
    item.outputs.length === 0 ||
    item.discoveryRoom.length === 0
  ) {
    throw new Error(
      "field-profile workflow.lanes entries require id, label, intent, inputs, outputs, and discoveryRoom",
    );
  }

  return item;
}

function parseWorkflow(raw: unknown, fallback?: WorkflowProfile): WorkflowProfile {
  const obj = asRecord(raw);
  if (!obj && fallback) {
    return {
      goalStatement: fallback.goalStatement,
      hardConstraints: [...fallback.hardConstraints],
      functions: fallback.functions.map((item) => ({ ...item })),
      lanes: fallback.lanes.map((item) => ({ ...item })),
    };
  }
  if (!obj) throw new Error("field-profile workflow must be an object");

  const baseGoal = fallback?.goalStatement ?? "";
  const goalStatement = clampString(obj.goalStatement, baseGoal, 512);
  const hardConstraints = parseStringArray(
    obj.hardConstraints,
    fallback?.hardConstraints ?? [],
    512,
  );
  const rawFunctions = Array.isArray(obj.functions) ? obj.functions : (fallback?.functions ?? []);
  const rawLanes = Array.isArray(obj.lanes) ? obj.lanes : (fallback?.lanes ?? []);

  const functions = rawFunctions.map((item, index) =>
    parseWorkflowFunction(item, fallback?.functions[index]),
  );
  const lanes = rawLanes.map((item, index) => parseWorkflowLane(item, fallback?.lanes[index]));

  if (
    !goalStatement ||
    hardConstraints.length === 0 ||
    functions.length === 0 ||
    lanes.length === 0
  ) {
    throw new Error(
      "field-profile workflow requires goalStatement, hardConstraints, functions, and lanes",
    );
  }

  return {
    goalStatement,
    hardConstraints,
    functions,
    lanes,
  };
}

function parseDefaultProfile(raw: unknown): FieldProfile {
  const profile = asRecord(raw);
  if (!profile) throw new Error("field-profile root must be an object");
  const modulation = asRecord(profile.modulation);
  if (!modulation) throw new Error("field-profile modulation must be an object");
  const envelopes = asRecord(modulation.envelopes);
  if (!envelopes) throw new Error("field-profile modulation.envelopes must be an object");

  const parsedEnvelopes = {} as FieldModulationSpec["envelopes"];
  for (const state of THRESHOLD_STATES) {
    parsedEnvelopes[state] = parseEnvelopeStrict(envelopes[state], state);
  }

  const base = asRecord(modulation.base);
  const recipe = asRecord(modulation.recipe);
  if (!base || !recipe) {
    throw new Error("field-profile modulation.base and modulation.recipe must be objects");
  }

  const rarityGate = parseRarityGateStrict(extractRarityGateSource(profile));
  const profileName = clampString(profile.profileName, "", 128);
  const version = clampString(profile.version, "", 64);

  if (!profileName || !version) {
    throw new Error("field-profile profileName and version must be non-empty strings");
  }

  return {
    profileName,
    version,
    modulation: {
      envelopes: parsedEnvelopes,
      base: {
        disk: parseBusStrict(base.disk, "modulation.base.disk", [
          "scale",
          "brightness",
          "rimAlpha",
        ]) as {
          scale: number;
          brightness: number;
          rimAlpha: number;
        },
        oval: parseBusStrict(base.oval, "modulation.base.oval", [
          "opacity",
          "lineWidth",
          "markerAlpha",
          "fieldAlpha",
        ]) as {
          opacity: number;
          lineWidth: number;
          markerAlpha: number;
          fieldAlpha: number;
        },
        voice: parseBusStrict(base.voice, "modulation.base.voice", [
          "alpha",
          "scanSpeed",
          "glowRadius",
        ]) as { alpha: number; scanSpeed: number; glowRadius: number },
        field: parseBusStrict(base.field, "modulation.base.field", ["ambientIntensity"]) as {
          ambientIntensity: number;
        },
        block: parseBusStrict(base.block, "modulation.base.block", ["levitationMod"]) as {
          levitationMod: number;
        },
      },
      recipe: {
        disk: parseBusStrict(recipe.disk, "modulation.recipe.disk", [
          "scale",
          "brightness",
          "rimAlpha",
        ]) as { scale: number; brightness: number; rimAlpha: number },
        oval: parseBusStrict(recipe.oval, "modulation.recipe.oval", [
          "opacity",
          "lineWidth",
          "markerAlpha",
          "fieldAlpha",
        ]) as {
          opacity: number;
          lineWidth: number;
          markerAlpha: number;
          fieldAlpha: number;
        },
        voice: parseBusStrict(recipe.voice, "modulation.recipe.voice", [
          "alpha",
          "scanSpeed",
          "glowRadius",
        ]) as { alpha: number; scanSpeed: number; glowRadius: number },
        field: parseBusStrict(recipe.field, "modulation.recipe.field", ["ambientIntensity"]) as {
          ambientIntensity: number;
        },
        block: parseBusStrict(recipe.block, "modulation.recipe.block", ["levitationMod"]) as {
          levitationMod: number;
        },
      },
    },
    ceremony: { rarityGate },
    workflow: parseWorkflow(profile.workflow),
    engine: parseEngine(profile.engine),
  };
}
function parseEngine(raw: unknown): FieldEngineSpec {
  const obj = asRecord(raw);
  const physics = asRecord(obj?.physics);
  const visuals = asRecord(obj?.visuals);

  if (!physics || !visuals) {
    throw new Error("field-profile engine.physics and engine.visuals must be objects");
  }

  return {
    physics: {
      pulseRadiusBase: clampNumber(physics.pulseRadiusBase, 32, 0, 200),
      pulseIntensityMod: clampNumber(physics.pulseIntensityMod, 6, 0, 100),
      transitionSpeedUp: clampNumber(physics.transitionSpeedUp, 0.003, 0.0001, 1),
      transitionSpeedDown: clampNumber(physics.transitionSpeedDown, 0.005, 0.0001, 1),
    },
    visuals: {
      ovalAlphaMod: clampNumber(visuals.ovalAlphaMod, 0.4, 0, 1),
      slotIntensityMod: clampNumber(visuals.slotIntensityMod, 3.5, 0, 10),
      presenceAlphaBase: clampNumber(visuals.presenceAlphaBase, 0.3, 0, 1),
    },
  };
}

function parseEngineWithFallback(raw: unknown, fallback: FieldEngineSpec): FieldEngineSpec {
  const obj = asRecord(raw);
  return {
    physics: parseBusWithFallback(obj?.physics, fallback.physics),
    visuals: parseBusWithFallback(obj?.visuals, fallback.visuals),
  };
}

function parseRarityGateWithFallback(raw: unknown, fallback: RarityGateMap): RarityGateMap {
  const obj = asRecord(raw);
  const gate = {} as RarityGateMap;
  for (const state of THRESHOLD_STATES) {
    const value = obj?.[state];
    gate[state] = isAssetRarity(value) ? value : fallback[state];
  }
  return gate;
}

function parseEnvelopeWithFallback(raw: unknown, fallback: FieldEnvelope): FieldEnvelope {
  const obj = asRecord(raw);
  return {
    sustain: clampNumber(obj?.sustain, fallback.sustain, 0, 1),
    lfoRate: clampNumber(obj?.lfoRate, fallback.lfoRate, 0, 10),
    lfoDepth: clampNumber(obj?.lfoDepth, fallback.lfoDepth, 0, 1),
  };
}

function parseBusWithFallback<T extends object>(raw: unknown, fallback: T): T {
  const obj = asRecord(raw);
  const out = {} as T;
  for (const key of Object.keys(fallback) as Array<keyof T>) {
    const fallbackValue = fallback[key];
    if (typeof fallbackValue === "number") {
      out[key] = clampNumber(obj?.[String(key)], fallbackValue, 0, 100) as T[keyof T];
    } else {
      out[key] = fallbackValue;
    }
  }
  return out;
}

function parseOverrideProfile(raw: unknown, fallback: FieldProfile): FieldProfile {
  const profile = asRecord(raw);
  const modulation = asRecord(profile?.modulation);
  const envelopes = asRecord(modulation?.envelopes);
  const base = asRecord(modulation?.base);
  const recipe = asRecord(modulation?.recipe);

  const mergedEnvelopes = {} as FieldModulationSpec["envelopes"];
  for (const state of THRESHOLD_STATES) {
    mergedEnvelopes[state] = parseEnvelopeWithFallback(
      envelopes?.[state],
      fallback.modulation.envelopes[state],
    );
  }

  const fallbackRarityGate = fallback.ceremony?.rarityGate;
  if (!fallbackRarityGate) {
    throw new Error("field-profile fallback is missing ceremony.rarityGate");
  }

  const rarityGate = parseRarityGateWithFallback(
    extractRarityGateSource(profile),
    fallbackRarityGate,
  );

  return {
    profileName:
      clampString(profile?.profileName, fallback.profileName ?? "", 128) || fallback.profileName,
    version: clampString(profile?.version, fallback.version ?? "", 64) || fallback.version,
    modulation: {
      envelopes: mergedEnvelopes,
      base: {
        disk: parseBusWithFallback(base?.disk, fallback.modulation.base.disk),
        oval: parseBusWithFallback(base?.oval, fallback.modulation.base.oval),
        voice: parseBusWithFallback(base?.voice, fallback.modulation.base.voice),
        field: parseBusWithFallback(base?.field, fallback.modulation.base.field),
        block: parseBusWithFallback(base?.block, fallback.modulation.base.block),
      },
      recipe: {
        disk: parseBusWithFallback(recipe?.disk, fallback.modulation.recipe.disk),
        oval: parseBusWithFallback(recipe?.oval, fallback.modulation.recipe.oval),
        voice: parseBusWithFallback(recipe?.voice, fallback.modulation.recipe.voice),
        field: parseBusWithFallback(recipe?.field, fallback.modulation.recipe.field),
        block: parseBusWithFallback(recipe?.block, fallback.modulation.recipe.block),
      },
    },
    ceremony: { rarityGate },
    workflow: parseWorkflow(profile?.workflow, fallback.workflow),
    engine: parseEngineWithFallback(profile?.engine, fallback.engine),
  };
}

function resolveDefaultProfileCandidates(appPath: string): string[] {
  return [
    path.resolve(appPath, DEFAULT_PROFILE_RELATIVE_PATH),
    path.resolve(__dirname, "../../config/field-profile.json"),
    path.resolve(process.cwd(), DEFAULT_PROFILE_RELATIVE_PATH),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

function loadDefaultProfile(appPath: string): { profile: FieldProfile; resolvedPath: string } {
  let lastError: unknown = null;

  for (const candidatePath of resolveDefaultProfileCandidates(appPath)) {
    try {
      return {
        profile: parseDefaultProfile(readJsonFile(candidatePath)),
        resolvedPath: candidatePath,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `field-profile default load failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export interface LoadedFieldProfile {
  profile: FieldProfile;
  resolvedPath: string;
  usedOverride: boolean;
}

export function loadFieldProfile(appPath: string): LoadedFieldProfile {
  const { profile: defaultProfile, resolvedPath: defaultPath } = loadDefaultProfile(appPath);
  const overridePath = process.env[OVERRIDE_ENV_KEY];

  if (typeof overridePath !== "string" || overridePath.trim() === "") {
    return { profile: defaultProfile, resolvedPath: defaultPath, usedOverride: false };
  }

  const candidatePath = path.resolve(overridePath);
  try {
    const overrideRaw = readJsonFile(candidatePath);
    return {
      profile: parseOverrideProfile(overrideRaw, defaultProfile),
      resolvedPath: candidatePath,
      usedOverride: true,
    };
  } catch (err) {
    console.warn(
      `[glass] field-profile override load failed at ${candidatePath}: ${
        err instanceof Error ? err.message : String(err)
      } — falling back to default profile`,
    );
    return { profile: defaultProfile, resolvedPath: defaultPath, usedOverride: false };
  }
}

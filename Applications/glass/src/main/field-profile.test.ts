import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFieldProfile } from "./field-profile";

const ORIGINAL_OVERRIDE = process.env.GLASS_FIELD_PROFILE_PATH;

function defaultProfileFixture() {
  return {
    profileName: "Default Glass Profile",
    version: "1.0.0",
    modulation: {
      envelopes: {
        ground: { sustain: 0.12, lfoRate: 0.04, lfoDepth: 0.025 },
        evaluating: { sustain: 0.5, lfoRate: 0.18, lfoDepth: 0.07 },
        floor_rising: { sustain: 1, lfoRate: 0.22, lfoDepth: 0.04 },
        voices_appearing: { sustain: 0.85, lfoRate: 0.12, lfoDepth: 0.05 },
        voice_1_active: { sustain: 0.88, lfoRate: 0.1, lfoDepth: 0.06 },
        voice_2_active: { sustain: 0.88, lfoRate: 0.13, lfoDepth: 0.06 },
        voice_3_active: { sustain: 0.88, lfoRate: 0.09, lfoDepth: 0.06 },
        elevated: { sustain: 1, lfoRate: 0.07, lfoDepth: 0.03 },
        returning: { sustain: 0.25, lfoRate: 0.06, lfoDepth: 0.03 },
        denied: { sustain: 0.08, lfoRate: 0.35, lfoDepth: 0.1 },
      },
      base: {
        disk: { scale: 0.06, brightness: 0.04, rimAlpha: 0.05 },
        oval: { opacity: 0.03, lineWidth: 0.3, markerAlpha: 0.04, fieldAlpha: 0.02 },
        voice: { alpha: 0, scanSpeed: 0.4, glowRadius: 8 },
        field: { ambientIntensity: 0.28 },
        block: { levitationMod: 0.88 },
      },
      recipe: {
        disk: { scale: 0.94, brightness: 0.96, rimAlpha: 0.95 },
        oval: { opacity: 0.72, lineWidth: 2.1, markerAlpha: 0.82, fieldAlpha: 0.55 },
        voice: { alpha: 0.9, scanSpeed: 1.8, glowRadius: 18 },
        field: { ambientIntensity: 0.44 },
        block: { levitationMod: 0.12 },
      },
    },
    ceremony: {
      rarityGate: {
        ground: "uncommon",
        evaluating: "uncommon",
        floor_rising: "rare",
        voices_appearing: "epic",
        voice_1_active: "epic",
        voice_2_active: "epic",
        voice_3_active: "epic",
        elevated: "mythic",
        returning: "rare",
        denied: "common",
      },
    },
    workflow: {
      goalStatement: "test",
      hardConstraints: ["test"],
      functions: [{ id: "f1", label: "F1", intent: "test", inputs: ["in"], outputs: ["out"] }],
      lanes: [
        {
          id: "l1",
          label: "L1",
          intent: "test",
          inputs: ["in"],
          outputs: ["out"],
          discoveryRoom: ["room"],
        },
      ],
    },
  };
}

function makeTempAppRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "glass-app-root-"));
  const configDir = path.join(root, "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "field-profile.json"),
    JSON.stringify(defaultProfileFixture()),
    "utf-8",
  );
  return root;
}

afterEach(() => {
  if (ORIGINAL_OVERRIDE == null) {
    delete process.env.GLASS_FIELD_PROFILE_PATH;
  } else {
    process.env.GLASS_FIELD_PROFILE_PATH = ORIGINAL_OVERRIDE;
  }
});

describe("loadFieldProfile", () => {
  it("loads checked-in default profile from config/field-profile.json", () => {
    delete process.env.GLASS_FIELD_PROFILE_PATH;
    const appPath = makeTempAppRoot();
    const loaded = loadFieldProfile(appPath);
    expect(loaded.usedOverride).toBe(false);
    expect(loaded.resolvedPath.endsWith(path.join("config", "field-profile.json"))).toBe(true);
    expect(loaded.profile.ceremony?.rarityGate.elevated).toBe("mythic");
    expect(loaded.profile.modulation.base.block.levitationMod).toBe(0.88);
  });

  it("merges override profile with default fallback values", () => {
    const appPath = makeTempAppRoot();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glass-field-profile-"));
    const overridePath = path.join(dir, "override.json");
    fs.writeFileSync(
      overridePath,
      JSON.stringify({
        ceremony: { rarityGate: { ground: "common", elevated: "legendary" } },
        modulation: {
          base: {
            field: { ambientIntensity: 0.5 },
          },
        },
      }),
      "utf-8",
    );
    process.env.GLASS_FIELD_PROFILE_PATH = overridePath;

    const loaded = loadFieldProfile(appPath);
    expect(loaded.usedOverride).toBe(true);
    expect(loaded.resolvedPath).toBe(overridePath);
    expect(loaded.profile.ceremony?.rarityGate.ground).toBe("common");
    expect(loaded.profile.ceremony?.rarityGate.elevated).toBe("legendary");
    expect(loaded.profile.ceremony?.rarityGate.voice_1_active).toBe("epic");
    expect(loaded.profile.modulation.base.field.ambientIntensity).toBe(0.5);
    expect(loaded.profile.modulation.base.block.levitationMod).toBe(0.88);
  });
});

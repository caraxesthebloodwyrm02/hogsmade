import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

export interface VoiceProfile {
  color: "amber" | "silver" | "gold";
  role: string;
  label?: string;
}

export interface CeremonyConfig {
  auto_evaluate_after_commits?: number;
  auto_return_after_idle_minutes?: number;
}

export interface SignalThresholds {
  git_diff_lines?: number;
  iteration_count?: number;
  session_age_minutes?: number;
}

export interface TriadicWeights {
  safety: number;
  correctness: number;
  autonomy: number;
}

export interface BridgePreset {
  threshold_state?: string;
  progress?: number;
  agent_state?: string;
  voices?: unknown[];
  blocks?: unknown[];
  conversation?: unknown[];
}

export interface PresetConfig {
  description?: string;
  captured?: string;
  reference_image?: string;
  bridge?: BridgePreset;
  modulation_notes?: Record<string, string>;
}

export interface GlassProfile {
  voices?: Record<string, VoiceProfile>;
  ceremony?: CeremonyConfig;
  signals?: { hot_threshold?: SignalThresholds };
  palette?: Record<string, string>;
  triadic?: TriadicWeights;
  presets?: Record<string, PresetConfig>;
}

function parseYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj: result }];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - trimmed.length;
    const match = trimmed.match(/^([^:]+):\s*(.*)/);
    if (!match) continue;

    const key = match[1].trim();
    let value: string | undefined = match[2].trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (value && value.length > 0) {
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      const num = Number(value);
      parent[key] = !isNaN(num) && value.length > 0 ? num : value;
    } else {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    }
  }

  return result;
}

function validateProfile(raw: Record<string, unknown>): GlassProfile {
  const profile: GlassProfile = {};

  if (raw.voices && typeof raw.voices === "object") {
    const voices: Record<string, VoiceProfile> = {};
    for (const [id, v] of Object.entries(raw.voices as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const vp = v as Record<string, unknown>;
        const color = String(vp.color ?? "amber");
        if (!["amber", "silver", "gold"].includes(color)) continue;
        voices[id] = {
          color: color as VoiceProfile["color"],
          role: String(vp.role ?? "unknown"),
          label: vp.label ? String(vp.label) : undefined,
        };
      }
    }
    if (Object.keys(voices).length > 0) profile.voices = voices;
  }

  if (raw.ceremony && typeof raw.ceremony === "object") {
    const c = raw.ceremony as Record<string, unknown>;
    profile.ceremony = {};
    if (typeof c.auto_evaluate_after_commits === "number") {
      profile.ceremony.auto_evaluate_after_commits = c.auto_evaluate_after_commits;
    }
    if (typeof c.auto_return_after_idle_minutes === "number") {
      profile.ceremony.auto_return_after_idle_minutes = c.auto_return_after_idle_minutes;
    }
  }

  if (raw.signals && typeof raw.signals === "object") {
    const s = raw.signals as Record<string, unknown>;
    if (s.hot_threshold && typeof s.hot_threshold === "object") {
      const ht = s.hot_threshold as Record<string, unknown>;
      profile.signals = {
        hot_threshold: {
          git_diff_lines: typeof ht.git_diff_lines === "number" ? ht.git_diff_lines : undefined,
          iteration_count: typeof ht.iteration_count === "number" ? ht.iteration_count : undefined,
          session_age_minutes:
            typeof ht.session_age_minutes === "number" ? ht.session_age_minutes : undefined,
        },
      };
    }
  }

  if (raw.palette && typeof raw.palette === "object") {
    const p = raw.palette as Record<string, unknown>;
    const palette: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
        palette[k] = v;
      }
    }
    if (Object.keys(palette).length > 0) profile.palette = palette;
  }

  if (raw.triadic && typeof raw.triadic === "object") {
    const t = raw.triadic as Record<string, unknown>;
    const safety = typeof t.safety === "number" ? t.safety : 1.0;
    const correctness = typeof t.correctness === "number" ? t.correctness : 0.85;
    const autonomy = typeof t.autonomy === "number" ? t.autonomy : 0.7;
    profile.triadic = { safety, correctness, autonomy };
  }

  if (raw.presets && typeof raw.presets === "object") {
    const presets: Record<string, PresetConfig> = {};
    for (const [name, p] of Object.entries(raw.presets as Record<string, unknown>)) {
      if (!p || typeof p !== "object") continue;
      const pc = p as Record<string, unknown>;
      const preset: PresetConfig = {};
      if (typeof pc.description === "string") preset.description = pc.description;
      if (typeof pc.captured === "string") preset.captured = pc.captured;
      if (typeof pc.reference_image === "string") preset.reference_image = pc.reference_image;
      if (pc.bridge && typeof pc.bridge === "object") {
        const b = pc.bridge as Record<string, unknown>;
        preset.bridge = {
          threshold_state: typeof b.threshold_state === "string" ? b.threshold_state : undefined,
          progress: typeof b.progress === "number" ? b.progress : undefined,
          agent_state: typeof b.agent_state === "string" ? b.agent_state : undefined,
          voices: Array.isArray(b.voices) ? b.voices : [],
          blocks: Array.isArray(b.blocks) ? b.blocks : [],
          conversation: Array.isArray(b.conversation) ? b.conversation : [],
        };
      }
      presets[name] = preset;
    }
    if (Object.keys(presets).length > 0) profile.presets = presets;
  }

  return profile;
}

function getAllowedRoots(): string[] {
  return [process.env.CASCADE_WORKSPACE_ROOT, homedir()].filter(Boolean) as string[];
}

function isPathAllowed(target: string): boolean {
  const resolved = resolve(target);
  return getAllowedRoots().some((root) => resolved.startsWith(resolve(root)));
}

export async function loadProfile(workspacePath: string): Promise<GlassProfile | null> {
  if (!isPathAllowed(workspacePath)) {
    console.error(`[glass-server] workspace path outside allowed roots: ${workspacePath}`);
    return null;
  }
  const profilePath = join(resolve(workspacePath), ".glass-profile.yaml");
  try {
    const raw = await readFile(profilePath, "utf-8");
    const parsed = parseYaml(raw);
    return validateProfile(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[glass-server] profile load failed at ${profilePath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return null;
  }
}

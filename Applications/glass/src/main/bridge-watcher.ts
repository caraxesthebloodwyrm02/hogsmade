import fs from "fs";
import path from "path";
import os from "os";
import { BridgeState, DEFAULT_BRIDGE_STATE } from "../../bridge/schema";
import type { AgentState, ThresholdState } from "../../bridge/schema";

const BRIDGE_PATH =
  process.env.GLASS_BRIDGE_PATH ?? path.join(os.homedir(), ".caraxes", "field-bridge.json");

const MAX_ARRAY = 200;
const MAX_TEXT = 32_768;

const VALID_AGENT_STATES = new Set<string>([
  "idle",
  "thinking",
  "writing",
  "reviewing",
  "elevated",
]);
const VALID_THRESHOLD_STATES = new Set<string>([
  "ground",
  "evaluating",
  "floor_rising",
  "voices_appearing",
  "voice_1_active",
  "voice_2_active",
  "voice_3_active",
  "elevated",
  "returning",
  "denied",
]);

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function clampString(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  return v.length > max ? v.slice(0, max) : v;
}

function validateBridgeState(raw: unknown): BridgeState {
  if (raw == null || typeof raw !== "object") return { ...DEFAULT_BRIDGE_STATE };

  const r = raw as Record<string, unknown>;

  const agentState = VALID_AGENT_STATES.has(r.agent_state as string)
    ? (r.agent_state as AgentState)
    : DEFAULT_BRIDGE_STATE.agent_state;

  const thresholdState = VALID_THRESHOLD_STATES.has(r.threshold_state as string)
    ? (r.threshold_state as ThresholdState)
    : DEFAULT_BRIDGE_STATE.threshold_state;

  const progress = clampNumber(r.progress, 0, 1, 0);

  const blocks = Array.isArray(r.blocks) ? r.blocks.slice(0, MAX_ARRAY) : [];
  const conversation = Array.isArray(r.conversation)
    ? r.conversation.slice(0, MAX_ARRAY).map((m: any) => ({
        role: m?.role === "agent" ? ("agent" as const) : ("user" as const),
        text: clampString(m?.text, MAX_TEXT, ""),
        timestamp: clampString(m?.timestamp, 64, ""),
      }))
    : [];
  const voices = Array.isArray(r.voices) ? r.voices.slice(0, 3) : [];

  const rawSignals =
    r.signals && typeof r.signals === "object" ? (r.signals as Record<string, unknown>) : {};
  const signals = {
    git_diff_lines: clampNumber(rawSignals.git_diff_lines, 0, 100_000, 0),
    iteration_count: clampNumber(rawSignals.iteration_count, 0, 10_000, 0),
    session_age_minutes: clampNumber(rawSignals.session_age_minutes, 0, 14_400, 0),
  };

  return {
    timestamp: clampString(r.timestamp, 64, new Date().toISOString()),
    session_id: clampString(r.session_id, 128, ""),
    agent_state: agentState,
    blocks,
    conversation,
    threshold_state: thresholdState,
    progress,
    voices,
    signals,
  };
}

function readBridgeFile(): BridgeState {
  try {
    const raw = fs.readFileSync(BRIDGE_PATH, "utf-8");
    return validateBridgeState(JSON.parse(raw));
  } catch (err) {
    console.warn(
      `[glass] bridge read failed — falling back to default state: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ...DEFAULT_BRIDGE_STATE };
  }
}

export function patchBridgeBlock(blockId: string, content: string): void {
  if (typeof blockId !== "string" || blockId.length === 0 || blockId.length > 128) {
    console.warn(
      `[glass] patchBridgeBlock rejected — invalid blockId: ${typeof blockId}, len=${String(blockId)
        ?.length}`,
    );
    return;
  }
  if (typeof content !== "string" || content.length > 1_000_000) {
    console.warn(`[glass] patchBridgeBlock rejected — content exceeds 1MB or not a string`);
    return;
  }
  try {
    const state = readBridgeFile();
    if (!Array.isArray(state.blocks)) {
      console.warn(`[glass] patchBridgeBlock skipped — state.blocks is not an array`);
      return;
    }
    const idx = (state.blocks as Array<Record<string, unknown>>).findIndex(
      (b) => b?.id === blockId,
    );
    if (idx === -1) {
      console.warn(`[glass] patchBridgeBlock skipped — blockId "${blockId}" not found`);
      return;
    }
    (state.blocks as Array<Record<string, unknown>>)[idx] = {
      ...(state.blocks as Array<Record<string, unknown>>)[idx],
      content,
    };
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.edit`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] patchBridgeBlock failed — renderer edit not persisted: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function startBridgeWatcher(onUpdate: (state: BridgeState) => void): void {
  onUpdate(readBridgeFile());

  if (!fs.existsSync(BRIDGE_PATH)) {
    fs.mkdirSync(path.dirname(BRIDGE_PATH), { recursive: true, mode: 0o700 });
    fs.writeFileSync(BRIDGE_PATH, JSON.stringify(DEFAULT_BRIDGE_STATE, null, 2), { mode: 0o600 });
  }

  let debounce: ReturnType<typeof setTimeout> | null = null;
  let lastMtime = 0;
  const bridgeDir = path.dirname(BRIDGE_PATH);
  const bridgeFile = path.basename(BRIDGE_PATH);

  try {
    fs.watch(bridgeDir, (_eventType, filename) => {
      if (filename != null && String(filename) !== bridgeFile) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        onUpdate(readBridgeFile());
      }, 50);
    });
    console.log(`[glass] watching bridge directory (native): ${bridgeDir} -> ${bridgeFile}`);
  } catch (watchErr) {
    console.warn(
      `[glass] native fs.watch unavailable (${
        watchErr instanceof Error ? watchErr.code ?? watchErr.message : String(watchErr)
      }) — falling back to polling`,
    );
    setInterval(() => {
      try {
        const stat = fs.statSync(BRIDGE_PATH);
        const mtime = stat.mtimeMs;
        if (mtime !== lastMtime) {
          lastMtime = mtime;
          onUpdate(readBridgeFile());
        }
      } catch (pollErr) {
        if ((pollErr as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(
            `[glass] bridge poll stat failed: ${
              pollErr instanceof Error ? pollErr.message : String(pollErr)
            }`,
          );
        }
      }
    }, 200);
    console.log(`[glass] watching bridge (polling): ${BRIDGE_PATH}`);
  }
}

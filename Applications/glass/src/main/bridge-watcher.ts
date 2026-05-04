import fs from "fs";
import path from "path";
import os from "os";
import {
  DEFAULT_BRIDGE_STATE,
  isAssetCategory,
  isAssetRarity,
  isRarityPermitted,
  isThresholdState,
  THRESHOLD_STATES,
  type BridgeState,
} from "../../bridge/schema";
import type {
  AgentState,
  AssetMeta,
  BlockOrigin,
  BlockType,
  BridgeBlock,
  FieldProfile,
  BridgeVoice,
  ThresholdState,
} from "../../bridge/schema";

const BRIDGE_PATH =
  process.env.GLASS_BRIDGE_PATH ?? path.join(os.homedir(), ".caraxes", "field-bridge.json");

const MAX_ARRAY = 200;
const MAX_TEXT = 32_768;
const MAX_BLOCK_TEXT = 1_000_000;

const VALID_AGENT_STATES = new Set<string>([
  "idle",
  "thinking",
  "writing",
  "reviewing",
  "elevated",
]);
const VALID_THRESHOLD_STATES = new Set<string>(THRESHOLD_STATES);
const VALID_BLOCK_TYPES = new Set<string>(["code", "note", "output", "asset"]);
const VALID_VOICE_IDS = new Set<string>(["I", "II", "III"]);
const VALID_VOICE_COLORS = new Set<string>(["amber", "silver", "gold"]);
const VALID_VOICE_POSITIONS = new Set<string>(["left", "center", "right"]);

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function clampString(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  return v.length > max ? v.slice(0, max) : v;
}

let activeFieldProfile: FieldProfile | null = null;

export function setBridgeFieldProfile(profile: FieldProfile): void {
  activeFieldProfile = profile;
}

function currentRarityGate(profile: FieldProfile | null) {
  return profile?.ceremony.rarityGate ?? null;
}

function validateAssetMeta(
  raw: unknown,
  thresholdState: ThresholdState,
  sessionId: string,
): AssetMeta | null {
  if (raw == null || typeof raw !== "object") return null;

  const a = raw as Record<string, unknown>;
  if (!isAssetCategory(a.category) || !isAssetRarity(a.rarity)) return null;
  const rarityGate = currentRarityGate(activeFieldProfile);
  if (!rarityGate) return null;

  const sourceCeremony = isThresholdState(a.source_ceremony) ? a.source_ceremony : thresholdState;
  if (!isRarityPermitted(a.rarity, sourceCeremony, rarityGate)) return null;

  const label = clampString(a.label, 64, "");
  if (label.length === 0) return null;

  const meta: AssetMeta = {
    category: a.category,
    rarity: a.rarity,
    label,
    acquired_at: clampString(a.acquired_at, 64, new Date().toISOString()),
    source_ceremony: sourceCeremony,
    source_session: clampString(a.source_session, 128, sessionId),
  };

  const glyph = clampString(a.glyph, 8, "");
  if (glyph) meta.glyph = glyph;
  if (typeof a.consumed === "boolean") meta.consumed = a.consumed;
  const ledgerId = clampString(a.ledger_id, 128, "");
  if (ledgerId) meta.ledger_id = ledgerId;

  return meta;
}

function validateBridgeBlock(
  raw: unknown,
  thresholdState: ThresholdState,
  sessionId: string,
): BridgeBlock | null {
  if (raw == null || typeof raw !== "object") return null;

  const b = raw as Record<string, unknown>;
  if (!VALID_BLOCK_TYPES.has(b.type as string)) return null;

  const id = clampString(b.id, 128, "");
  if (id.length === 0) return null;

  const type = b.type as BlockType;
  const position =
    b.position && typeof b.position === "object" ? (b.position as Record<string, unknown>) : {};
  const origin: BlockOrigin = b.origin === "agent" ? "agent" : "user";

  const block: BridgeBlock = {
    id,
    type,
    language: clampString(b.language, 64, "text"),
    content: clampString(b.content, MAX_BLOCK_TEXT, ""),
    position: {
      x: clampNumber(position.x, -100_000, 100_000, 0),
      y: clampNumber(position.y, -100_000, 100_000, 0),
    },
    origin,
  };

  if (type === "asset") {
    const asset = validateAssetMeta(b.asset, thresholdState, sessionId);
    if (!asset) return null;
    block.asset = asset;
  }

  return block;
}

function validateBridgeVoice(raw: unknown): BridgeVoice | null {
  if (raw == null || typeof raw !== "object") return null;

  const v = raw as Record<string, unknown>;
  if (!VALID_VOICE_IDS.has(v.id as string)) return null;
  if (!VALID_VOICE_COLORS.has(v.color as string)) return null;
  if (!VALID_VOICE_POSITIONS.has(v.position as string)) return null;

  return {
    id: v.id as BridgeVoice["id"],
    color: v.color as BridgeVoice["color"],
    position: v.position as BridgeVoice["position"],
    text: clampString(v.text, MAX_TEXT, ""),
    active: typeof v.active === "boolean" ? v.active : false,
  };
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

  const sessionId = clampString(r.session_id, 128, "");
  const blocks = Array.isArray(r.blocks)
    ? r.blocks
        .slice(0, MAX_ARRAY)
        .map((b) => validateBridgeBlock(b, thresholdState, sessionId))
        .filter((b): b is BridgeBlock => b !== null)
    : [];
  const conversation = Array.isArray(r.conversation)
    ? r.conversation.slice(0, MAX_ARRAY).map((m: any) => ({
        role: m?.role === "agent" ? ("agent" as const) : ("user" as const),
        text: clampString(m?.text, MAX_TEXT, ""),
        timestamp: clampString(m?.timestamp, 64, ""),
      }))
    : [];
  const voices = Array.isArray(r.voices)
    ? r.voices
        .slice(0, 3)
        .map(validateBridgeVoice)
        .filter((v): v is BridgeVoice => v !== null)
    : [];

  const rawSignals =
    r.signals && typeof r.signals === "object" ? (r.signals as Record<string, unknown>) : {};
  const signals = {
    git_diff_lines: clampNumber(rawSignals.git_diff_lines, 0, 100_000, 0),
    iteration_count: clampNumber(rawSignals.iteration_count, 0, 10_000, 0),
    session_age_minutes: clampNumber(rawSignals.session_age_minutes, 0, 14_400, 0),
  };

  const rawHt =
    r._hot_threshold && typeof r._hot_threshold === "object"
      ? (r._hot_threshold as Record<string, unknown>)
      : null;
  const _hot_threshold = rawHt
    ? {
        git_diff_lines: clampNumber(rawHt.git_diff_lines, 1, 100_000, 200),
        iteration_count: clampNumber(rawHt.iteration_count, 1, 10_000, 15),
        session_age_minutes: clampNumber(rawHt.session_age_minutes, 1, 14_400, 60),
      }
    : undefined;

  return {
    timestamp: clampString(r.timestamp, 64, new Date().toISOString()),
    session_id: sessionId,
    agent_state: agentState,
    blocks,
    conversation,
    threshold_state: thresholdState,
    progress,
    voices,
    signals,
    _hot_threshold,
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

export function appendConversationTurn(text: string): void {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT) {
    console.warn(
      `[glass] appendConversationTurn rejected — text length ${text?.length ?? 0} outside 1..${MAX_TEXT}`,
    );
    return;
  }
  try {
    const state = readBridgeFile();
    const conversation = Array.isArray(state.conversation) ? [...state.conversation] : [];
    conversation.push({ role: "user", text, timestamp: new Date().toISOString() });
    if (conversation.length > MAX_ARRAY) conversation.splice(0, conversation.length - MAX_ARRAY);
    state.conversation = conversation;
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.msg`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] appendConversationTurn failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

let blockSeq = 0;

export function addBridgeBlock(block: {
  type: string;
  language: string;
  content: string;
  position: { x: number; y: number };
  origin: string;
  asset?: unknown;
}): void {
  if (!block || typeof block !== "object") {
    console.warn(`[glass] addBridgeBlock rejected — invalid payload`);
    return;
  }
  if (!VALID_BLOCK_TYPES.has(block.type)) {
    console.warn(`[glass] addBridgeBlock rejected — invalid type: ${block.type}`);
    return;
  }
  if (typeof block.content !== "string" || block.content.length > 1_000_000) {
    console.warn(`[glass] addBridgeBlock rejected — content exceeds 1MB or not a string`);
    return;
  }
  try {
    const state = readBridgeFile();
    const blocks = Array.isArray(state.blocks) ? [...state.blocks] : [];
    if (blocks.length >= MAX_ARRAY) {
      console.warn(`[glass] addBridgeBlock rejected — blocks array at capacity (${MAX_ARRAY})`);
      return;
    }
    const id = `user-${Date.now()}-${++blockSeq}`;
    const nextBlock: BridgeBlock = {
      id,
      type: block.type as BlockType,
      language: block.language || "text",
      content: block.content,
      position: { x: Number(block.position?.x) || 0, y: Number(block.position?.y) || 0 },
      origin: block.origin === "agent" ? "agent" : "user",
    };
    if (nextBlock.type === "asset") {
      const asset = validateAssetMeta(block.asset, state.threshold_state, state.session_id);
      if (!asset) {
        console.warn(`[glass] addBridgeBlock rejected — invalid asset metadata or rarity gate`);
        return;
      }
      nextBlock.asset = asset;
    }
    blocks.push(nextBlock);
    state.blocks = blocks;
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.add`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] addBridgeBlock failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function patchBridgeBlockPosition(blockId: string, x: number, y: number): void {
  if (typeof blockId !== "string" || blockId.length === 0 || blockId.length > 128) {
    console.warn(`[glass] patchBridgeBlockPosition rejected — invalid blockId`);
    return;
  }
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) {
    console.warn(`[glass] patchBridgeBlockPosition rejected — invalid coordinates`);
    return;
  }
  try {
    const state = readBridgeFile();
    if (!Array.isArray(state.blocks)) {
      console.warn(`[glass] patchBridgeBlockPosition skipped — state.blocks is not an array`);
      return;
    }
    const idx = state.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      console.warn(`[glass] patchBridgeBlockPosition skipped — blockId "${blockId}" not found`);
      return;
    }
    if (state.blocks[idx].origin !== "user") {
      console.warn(
        `[glass] patchBridgeBlockPosition rejected — block "${blockId}" is not user-owned`,
      );
      return;
    }
    state.blocks[idx] = {
      ...state.blocks[idx],
      position: { x, y },
    };
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.pos`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] patchBridgeBlockPosition failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function patchBridgeBlock(blockId: string, content: string): void {
  if (typeof blockId !== "string" || blockId.length === 0 || blockId.length > 128) {
    console.warn(
      `[glass] patchBridgeBlock rejected — invalid blockId: ${typeof blockId}, len=${
        String(blockId)?.length
      }`,
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
    const idx = state.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      console.warn(`[glass] patchBridgeBlock skipped — blockId "${blockId}" not found`);
      return;
    }
    if (state.blocks[idx].origin !== "user") {
      console.warn(`[glass] patchBridgeBlock rejected — block "${blockId}" is not user-owned`);
      return;
    }
    state.blocks[idx] = {
      ...state.blocks[idx],
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

export function deleteBridgeBlock(blockId: string): void {
  if (typeof blockId !== "string" || blockId.length === 0 || blockId.length > 128) {
    console.warn(
      `[glass] deleteBridgeBlock rejected — invalid blockId: ${typeof blockId}, len=${
        String(blockId)?.length
      }`,
    );
    return;
  }
  try {
    const state = readBridgeFile();
    if (!Array.isArray(state.blocks)) {
      console.warn(`[glass] deleteBridgeBlock skipped — state.blocks is not an array`);
      return;
    }
    const idx = state.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      console.warn(`[glass] deleteBridgeBlock skipped — blockId "${blockId}" not found`);
      return;
    }
    if (state.blocks[idx].origin !== "user") {
      console.warn(`[glass] deleteBridgeBlock rejected — block "${blockId}" is not user-owned`);
      return;
    }
    state.blocks.splice(idx, 1);
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.del`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] deleteBridgeBlock failed — renderer delete not persisted: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function setBridgeThresholdState(state: ThresholdState): void {
  if (!isThresholdState(state)) {
    console.warn(`[glass] setBridgeThresholdState rejected — invalid state: ${String(state)}`);
    return;
  }
  try {
    const current = readBridgeFile();
    current.threshold_state = state;
    const tmp = `${BRIDGE_PATH}.tmp.${process.pid}.ceremony`;
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, BRIDGE_PATH);
  } catch (err) {
    console.error(
      `[glass] setBridgeThresholdState failed: ${err instanceof Error ? err.message : String(err)}`,
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
        watchErr instanceof Error
          ? ((watchErr as NodeJS.ErrnoException).code ?? watchErr.message)
          : String(watchErr)
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

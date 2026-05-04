import type { TriadicWeights } from "./profile-reader.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  ground: ["evaluating"],
  evaluating: ["floor_rising", "denied"],
  floor_rising: ["voices_appearing", "denied"],
  voices_appearing: ["voice_1_active", "denied"],
  voice_1_active: ["voice_2_active", "denied"],
  voice_2_active: ["voice_3_active", "denied"],
  voice_3_active: ["elevated", "denied"],
  elevated: ["returning"],
  returning: ["ground"],
  denied: ["ground"],
};

const VALID_STATES = new Set(Object.keys(VALID_TRANSITIONS));

const VALID_AGENT_STATES = new Set(["idle", "thinking", "writing", "reviewing", "elevated"]);

export interface GuardResult {
  allowed: boolean;
  warnings: string[];
}

export function applyTriadicGuard(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
  weights: TriadicWeights,
): GuardResult {
  const warnings: string[] = [];
  let allowed = true;

  // Safety: validate state transitions via full DAG
  if (weights.safety >= 0.8) {
    const ts = patch.threshold_state;
    if (typeof ts === "string") {
      if (!VALID_STATES.has(ts)) {
        warnings.push(`safety: invalid threshold_state "${ts}"`);
        allowed = false;
      } else {
        const currentState =
          typeof current.threshold_state === "string" ? current.threshold_state : "ground";
        if (ts !== currentState) {
          const permitted = VALID_TRANSITIONS[currentState];
          if (!permitted || !permitted.includes(ts)) {
            warnings.push(`safety: transition ${currentState} → ${ts} is not permitted`);
            allowed = false;
          }
        }
      }
    }

    const as = patch.agent_state;
    if (typeof as === "string" && !VALID_AGENT_STATES.has(as)) {
      warnings.push(`safety: invalid agent_state "${as}"`);
      allowed = false;
    }
  }

  // Correctness: validate conversation structure
  if (weights.correctness >= 0.7) {
    const conversation = patch.conversation;
    if (Array.isArray(conversation)) {
      for (let i = 0; i < conversation.length; i++) {
        const msg = conversation[i] as Record<string, unknown>;
        if (!msg.role || !msg.text || !msg.timestamp) {
          warnings.push(
            `correctness: conversation[${i}] missing required fields (role, text, timestamp)`,
          );
          allowed = false;
          break;
        }
      }
    }

    const blocks = patch.blocks;
    if (Array.isArray(blocks)) {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i] as Record<string, unknown>;
        if (!block.id || !block.type || !block.content) {
          warnings.push(`correctness: blocks[${i}] missing required fields (id, type, content)`);
          allowed = false;
          break;
        }
      }
    }
  }

  // Autonomy: when weight is low, elevated requires high progress
  if (weights.autonomy < 0.8) {
    const ts = patch.threshold_state;
    if (ts === "elevated") {
      const progress = (patch.progress ?? current.progress) as number | undefined;
      if (typeof progress !== "number" || progress < 0.9) {
        warnings.push(
          `autonomy: elevated requires progress >= 0.9 when autonomy weight is < 0.8 (got ${
            progress ?? "unset"
          })`,
        );
        allowed = false;
      }
    }
  }

  return { allowed, warnings };
}

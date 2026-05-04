import type { TriadicWeights } from "./profile-reader.js";

const DANGEROUS_TRANSITIONS = new Set(["elevated", "denied"]);

const VALID_STATES = new Set([
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

  // Safety: validate state transitions — block invalid or dangerous jumps
  if (weights.safety >= 0.8) {
    const ts = patch.threshold_state;
    if (typeof ts === "string") {
      if (!VALID_STATES.has(ts)) {
        warnings.push(`safety: invalid threshold_state "${ts}"`);
        allowed = false;
      }
      if (DANGEROUS_TRANSITIONS.has(ts) && current.threshold_state === "ground") {
        warnings.push(`safety: cannot jump from ground to ${ts} — must pass through evaluating`);
        allowed = false;
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

  // Autonomy: when weight is low, block auto-transitions that skip human checkpoints
  if (weights.autonomy < 0.8) {
    const ts = patch.threshold_state;
    if (typeof ts === "string" && DANGEROUS_TRANSITIONS.has(ts)) {
      const progress = (patch.progress ?? current.progress) as number | undefined;
      if (typeof progress !== "number" || progress < 0.9) {
        warnings.push(
          `autonomy: ${ts} requires progress >= 0.9 when autonomy weight is < 0.8 (got ${
            progress ?? "unset"
          })`,
        );
        allowed = false;
      }
    }
  }

  return { allowed, warnings };
}

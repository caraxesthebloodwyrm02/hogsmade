/**
 * reward-poller.ts — Process-local reward state poll loop for glass-server.
 *
 * Polls GET /v0/state/reward/<id> from x-change on a configurable interval,
 * renders a badge block into the Glass field bridge, and maintains module-level
 * state so the caller can query status without re-fetching.
 *
 * Env:
 *   XCHANGE_URL           — base URL of the x-change server (default: http://127.0.0.1:8788)
 *   XCHANGE_INGEST_TOKEN  — operator bearer token (required for all requests)
 */

import { writeBridge, readBridge } from "./bridge-writer.js";

export interface RewardPollerStatus {
  pollerState: "idle" | "armed" | "disarmed";
  rewardId?: string;
  intervalSeconds: number;
  lastPolled?: string;
  lastState?: string;
  blockId?: string;
}

// ── Module state ──

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollerState: "idle" | "armed" | "disarmed" = "idle";
let currentRewardId: string | null = null;
let currentIntervalSeconds = 120;
let lastPolled: string | null = null;
let lastState: string | null = null;
let blockId: string | null = null;

// ── Helpers ──

function xchangeBaseUrl(): string {
  return (process.env.XCHANGE_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");
}

function ingestToken(): string | null {
  return process.env.XCHANGE_INGEST_TOKEN ?? null;
}

export function makeBlockId(rewardId: string): string {
  return `reward-state-${rewardId}`;
}

// Lifecycle states in forward order (drafted is pre-visibility; review_requested is a branch).
const LIFECYCLE = [
  "earned",
  "payment_pending",
  "payment_confirmed",
  "student_acknowledged",
] as const;

export function buildBadge(state: Record<string, unknown>, polledAt: string): string {
  const rewardId = String(state.reward_id ?? "unknown");
  const stateVal = String(state.state ?? "unknown");
  const amount =
    state.reward_token_amount !== undefined ? `${state.reward_token_amount} tokens` : "—";
  const updatedAt = String(state.updated_at ?? "—");

  const stateIdx = LIFECYCLE.indexOf(stateVal as (typeof LIFECYCLE)[number]);

  const lifecycleLines = LIFECYCLE.map((s, i) => {
    const mark = i <= stateIdx ? "●" : "○";
    return `  ${mark} ${s}`;
  });

  if (stateVal === "review_requested") {
    lifecycleLines.push("  ↳ review_requested");
  }

  return [
    "REWARD STATE",
    "────────────────────────",
    `ID:      ${rewardId}`,
    `State:   ${stateVal}`,
    `Amount:  ${amount}`,
    `Updated: ${updatedAt}`,
    "",
    "lifecycle",
    ...lifecycleLines,
    "",
    `polled:  ${polledAt}`,
  ].join("\n");
}

export async function fetchRewardState(rewardId: string): Promise<Record<string, unknown>> {
  const token = ingestToken();
  if (!token) {
    throw new Error("XCHANGE_INGEST_TOKEN is not set");
  }

  const url = `${xchangeBaseUrl()}/v0/state/reward/${encodeURIComponent(rewardId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`x-change reward state fetch failed: HTTP ${res.status}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

async function upsertRewardBlock(rewardId: string, content: string): Promise<string> {
  const id = makeBlockId(rewardId);
  const current = await readBridge();
  const blocks = Array.isArray(current.blocks)
    ? ([...current.blocks] as Array<Record<string, unknown>>)
    : [];

  const idx = blocks.findIndex((b) => b.id === id);
  if (idx >= 0) {
    blocks[idx] = { ...blocks[idx], content };
  } else {
    blocks.push({
      id,
      type: "output",
      language: "text",
      content,
      position: { x: 20, y: 20 },
      origin: "agent",
    });
  }

  await writeBridge({ blocks });
  return id;
}

// ── Public API ──

/**
 * Perform a single immediate poll: fetch state, render badge, upsert block.
 */
export async function pollOnce(rewardId: string): Promise<RewardPollerStatus> {
  const polledAt = new Date().toISOString();
  const state = await fetchRewardState(rewardId);
  const badge = buildBadge(state, polledAt);
  const id = await upsertRewardBlock(rewardId, badge);

  lastPolled = polledAt;
  lastState = String(state.state ?? "unknown");
  blockId = id;
  currentRewardId = rewardId;

  return getRewardPollerStatus();
}

/**
 * Arm the reward poller. Polls immediately, then on the given interval.
 * Passing intervalSeconds = 0 performs a single shot without arming the loop.
 */
export async function armRewardPoller(
  rewardId: string,
  intervalSeconds: number = 120,
): Promise<RewardPollerStatus> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  currentRewardId = rewardId;
  currentIntervalSeconds = intervalSeconds;

  // Immediate poll — throws on auth/network failure so the caller gets a clear error.
  await pollOnce(rewardId);

  if (intervalSeconds > 0) {
    pollerState = "armed";
    pollTimer = setInterval(async () => {
      try {
        await pollOnce(rewardId);
      } catch (err) {
        console.error("[glass-reward] poll cycle failed:", err);
      }
    }, intervalSeconds * 1000);
  } else {
    pollerState = "disarmed";
  }

  return getRewardPollerStatus();
}

/**
 * Disarm the reward poller without clearing the last known state.
 */
export async function disarmRewardPoller(): Promise<RewardPollerStatus> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  pollerState = "disarmed";
  return getRewardPollerStatus();
}

/**
 * Return current poller status without side effects.
 */
export function getRewardPollerStatus(): RewardPollerStatus {
  return {
    pollerState,
    rewardId: currentRewardId ?? undefined,
    intervalSeconds: currentIntervalSeconds,
    lastPolled: lastPolled ?? undefined,
    lastState: lastState ?? undefined,
    blockId: blockId ?? undefined,
  };
}

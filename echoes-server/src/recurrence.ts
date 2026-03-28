/**
 * Recurrence Detector — the enforcement brain.
 *
 * Takes an audit event, computes its fingerprint, checks the precedent
 * store for prior occurrences, and returns an enforcement decision
 * with escalation level and action.
 *
 * Also handles:
 * - Time decay: stale precedents de-escalate automatically
 * - Success de-escalation: consecutive successes reduce severity
 * - Cooldown awareness: resolved precedents during cooldown resume escalation
 */

import type {
  EnforcementAction,
  EscalationLevel,
  FingerprintInput,
  PrecedentOccurrence,
  RecurrenceCheckResult,
} from "@cascade/shared-types/precedent";
import {
  DECAY_THRESHOLD_MS,
  PRECEDENT_TRIGGER_STATUSES,
  SUCCESS_DEESCALATION_THRESHOLD,
  computeEscalationLevel,
  computeFingerprint,
  escalationSeverity,
  levelToAction,
} from "@cascade/shared-types/precedent";
import type { PrecedentStore } from "./precedent-store.js";

/**
 * Check whether an audit event represents a recurrence of a known pattern.
 *
 * For failure/blocked/error events: looks up existing precedent, escalates if found.
 * For success events: records consecutive success toward de-escalation.
 *
 * @param isMutating - Whether the tool is in the "ask" permission list.
 *   Only mutating tools can reach "blocked" enforcement level.
 */
export function checkRecurrence(
  store: PrecedentStore,
  event: FingerprintInput & { sessionId?: string },
  isMutating = false,
  persist = true,
): RecurrenceCheckResult {
  const isFailure = PRECEDENT_TRIGGER_STATUSES.has(event.status);

  if (!isFailure) {
    if (persist) {
      store.recordSuccess(event.source, event.tool);
    }
    return {
      isRecurrence: false,
      precedentId: null,
      occurrenceNumber: 0,
      previousLevel: null,
      currentLevel: "observed",
      action: "log",
      message: "Success recorded.",
    };
  }

  const fp = computeFingerprint(event);
  const existing = store.findByFingerprint(fp);

  const occurrence: PrecedentOccurrence = {
    timestamp: new Date().toISOString(),
    sessionId: event.sessionId,
    metadata: event.metadata,
  };

  if (!existing) {
    if (!persist) {
      return {
        isRecurrence: false,
        precedentId: null,
        occurrenceNumber: 1,
        previousLevel: null,
        currentLevel: "observed",
        action: "log",
        message: `New precedent would be created: ${fp.source}/${fp.tool} [${fp.category}]`,
      };
    }
    const record = store.upsert(fp, "observed", occurrence);
    return {
      isRecurrence: false,
      precedentId: record.id,
      occurrenceNumber: 1,
      previousLevel: null,
      currentLevel: "observed",
      action: "log",
      message: `New precedent created: ${fp.source}/${fp.tool} [${fp.category}]`,
    };
  }

  // Recurrence found — check cooldown
  const inCooldown =
    existing.resolution?.cooldownUntil &&
    new Date(existing.resolution.cooldownUntil).getTime() > Date.now();

  if (existing.resolution && !inCooldown) {
    // Resolved and cooldown expired — treat as fresh
    if (!persist) {
      return {
        isRecurrence: false,
        precedentId: existing.id,
        occurrenceNumber: existing.occurrenceCount + 1,
        previousLevel: null,
        currentLevel: "observed",
        action: "log",
        message: `Pattern would recur after cooldown expired. Precedent would reset: ${fp.source}/${fp.tool}`,
      };
    }
    const record = store.upsert(fp, "observed", occurrence);
    return {
      isRecurrence: false,
      precedentId: record.id,
      occurrenceNumber: record.occurrenceCount,
      previousLevel: null,
      currentLevel: "observed",
      action: "log",
      message: `Pattern recurred after cooldown expired. Precedent reset: ${fp.source}/${fp.tool}`,
    };
  }

  // Active recurrence — escalate
  const previousLevel = existing.escalationLevel;
  const newCount = existing.occurrenceCount + 1;
  let newLevel = computeEscalationLevel(newCount);

  // If in cooldown, resume from previous level instead of resetting
  if (
    inCooldown &&
    escalationSeverity(previousLevel) > escalationSeverity(newLevel)
  ) {
    newLevel = previousLevel;
  }

  const action = levelToAction(newLevel, isMutating);
  if (!persist) {
    return {
      isRecurrence: true,
      precedentId: existing.id,
      occurrenceNumber: existing.occurrenceCount + 1,
      previousLevel,
      currentLevel: newLevel,
      action,
      message: formatEscalationMessage(
        fp.source,
        fp.tool,
        fp.category,
        existing.occurrenceCount + 1,
        newLevel,
        action,
      ),
    };
  }
  const record = store.upsert(fp, newLevel, occurrence);

  return {
    isRecurrence: true,
    precedentId: record.id,
    occurrenceNumber: record.occurrenceCount,
    previousLevel,
    currentLevel: newLevel,
    action,
    message: formatEscalationMessage(
      fp.source,
      fp.tool,
      fp.category,
      record.occurrenceCount,
      newLevel,
      action,
    ),
  };
}

/**
 * Apply time-based decay to all precedents.
 * Precedents with no occurrences for DECAY_THRESHOLD_MS lose one escalation level.
 * Returns the number of records decayed.
 */
export function applyTimeDecay(store: PrecedentStore): number {
  const active = store.listActive(1000);
  const now = Date.now();
  let decayed = 0;

  for (const record of active) {
    const lastSeenAge = now - new Date(record.lastSeen).getTime();
    if (
      lastSeenAge >= DECAY_THRESHOLD_MS &&
      escalationSeverity(record.escalationLevel) > 0
    ) {
      const levels: EscalationLevel[] = [
        "observed",
        "flagged",
        "restricted",
        "blocked",
      ];
      const currentIdx = levels.indexOf(record.escalationLevel);
      if (currentIdx > 0) {
        record.escalationLevel = levels[currentIdx - 1];
        decayed++;
      }
    }
  }

  return decayed;
}

/**
 * Apply success-based de-escalation.
 * If a precedent has accumulated enough consecutive successes, reduce its level.
 * Returns the number of records de-escalated.
 */
export function applySuccessDeescalation(store: PrecedentStore): number {
  const active = store.listActive(1000);
  let deescalated = 0;

  for (const record of active) {
    if (
      record.consecutiveSuccesses >= SUCCESS_DEESCALATION_THRESHOLD &&
      escalationSeverity(record.escalationLevel) > 0
    ) {
      const levels: EscalationLevel[] = [
        "observed",
        "flagged",
        "restricted",
        "blocked",
      ];
      const currentIdx = levels.indexOf(record.escalationLevel);
      if (currentIdx > 0) {
        record.escalationLevel = levels[currentIdx - 1];
        record.consecutiveSuccesses = 0;
        deescalated++;
      }
    }
  }

  return deescalated;
}

function formatEscalationMessage(
  source: string,
  tool: string,
  category: string,
  count: number,
  level: EscalationLevel,
  action: EnforcementAction,
): string {
  const prefix = `[PRECEDENT] ${source}/${tool} [${category}]`;
  switch (action) {
    case "log":
      return `${prefix}: occurrence #${count} — observed.`;
    case "warn":
      return `${prefix}: occurrence #${count} — recurring pattern. Review before proceeding.`;
    case "restrict":
      return `${prefix}: occurrence #${count} — escalated to ${level}. This pattern has recurred ${count} times. Investigate root cause.`;
    case "block":
      return `${prefix}: occurrence #${count} — BLOCKED. This mutating operation has failed ${count} times for the same reason. Resolve precedent before retrying.`;
  }
}

/**
 * Afloat — Canonical copy constants
 *
 * Single source of truth for CTAs, error messages, tier labels,
 * and loading strings. Drop into src/lib/copy.ts in the Afloat app.
 *
 * Addresses analysis items: #7 (CTA consistency), #8 (error phrasing),
 * #9 (tier labels), #10/#16 (loading text), #11/#12 (actionable errors).
 */

// ── Primary CTA & pricing ──

export const CTA = {
  primary: "Get started",
  pricingLine: "from $9/quarter",
  /** Combined for buttons: "Get started — from $9/quarter" */
  primaryWithPrice: "Get started — from $9/quarter",
} as const;

// ── Tier labels (friendly, never raw API values) ──

export const TIER_LABELS: Record<string, string> = {
  trial: "Trial",
  continuous: "Extended session",
  premium: "Premium",
  free: "Free",
} as const;

/** Safe lookup — returns friendly label or hides unknown tiers */
export function tierLabel(raw: string | undefined): string {
  if (!raw) return "";
  return TIER_LABELS[raw.toLowerCase()] ?? "";
}

// ── Error messages (what happened + what to do next) ──

export const ERRORS = {
  generic: "Something went wrong. Please try again.",
  sessionStart: "We couldn't start your session. Check your connection and try again.",
  settingsLoad: "We couldn't load your settings. Try refreshing the page.",
  settingsSave: "Your changes weren't saved. Please try again.",
  settingsDelete: "We couldn't process your deletion request. Please try again or contact support.",
  subscriptionLoad: "We couldn't load your subscription details. Please try again.",
  notFound: "We couldn't find that page.",
} as const;

// ── Loading strings (contextual, not generic) ──

export const LOADING = {
  default: "Loading\u2026",
  subscription: "Loading subscription\u2026",
  settings: "Loading settings\u2026",
  chat: "Starting session\u2026",
} as const;

// ── Empty states (purpose + one clear action) ──

export const EMPTY = {
  chat: {
    purpose: "Describe what you're stuck on.",
    action: "Type below to start.",
  },
} as const;

// ── Accessibility labels ──

export const A11Y = {
  chatInput: "Message input",
  sendButton: "Send message",
  doneButton: "End session",
  loadingSpinner: "Loading, please wait",
  messageList: "Conversation messages",
  sessionTimer: "Session time remaining",
} as const;

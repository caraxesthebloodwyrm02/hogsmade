/**
 * Pathway Logger — Persistent root-branch logging for Glimpse
 *
 * Appends JSONL entries to E:/Pathways/Networks/glimpse-traces/
 * Each entry captures: when a rule fired, what it found, how confident
 * it was, and the branch path through the data.
 *
 * Over time, this builds an underground root map — the most-traveled
 * branches become visible as strong pathways, and weak branches
 * naturally attenuate (low confidence = thin root).
 *
 * The metaphor:
 *   - Each pipeline run is a SEASON (timestamp)
 *   - Each rule trace is a ROOT (rule id + evidence)
 *   - Each lens score is a BRANCH (domain affinity + weight)
 *   - The primary lens is the TRUNK (strongest signal)
 *   - View preferences are CANOPY (what becomes visible)
 */

import { sha256HexUniversal } from "./core/digest-validator.js";

const PATHWAY_DIR = "E:/Pathways/Networks/glimpse-traces";

/** Default: redact identifying fields in persisted pathway entries (`redact: false` for full debug). */
export const PATHWAY_REDACT_DEFAULT = true;

/** Bump when pathway JSONL entry shape changes materially. */
export const PATHWAY_SCHEMA_VERSION = "1";

/** Keep in sync with package.json version (browser bundle cannot import package.json). */
export const PATHWAY_ENGINE_VERSION = "0.5.0";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoNow() {
  return new Date().toISOString();
}

/**
 * Build a pathway log entry from a completed pipeline result.
 * Lightweight — extracts only what matters for tracing.
 *
 * @param {object} options
 * @param {boolean} [options.redact=true] When true, replaces dataset filename with a SHA256 prefix.
 * @param {string|null} [options.sessionDigestHex] When set (bound session digest), first 12 hex chars stored as digest_prefix for log correlation.
 */
export async function buildPathwayEntry(pipelineResult, fileName, options = {}) {
  const redact = options.redact ?? PATHWAY_REDACT_DEFAULT;
  const sessionDigestHex = options.sessionDigestHex ?? null;
  if (!pipelineResult) return null;

  const { profile, contextLenses, primaryLens, viewPreferences, ruleTraces, records } =
    pipelineResult;

  let fileField = fileName || "unknown";
  if (redact && fileField !== "unknown") {
    const h = await sha256HexUniversal(fileField);
    fileField = `sha256:${h.slice(0, 16)}`;
  }

  // Root signals: which rules fired and what they found
  const roots = (ruleTraces || [])
    .filter((t) => t.status === "fired")
    .map((t) => ({
      rule: t.ruleId,
      score: t.score ?? null,
      lens: t.derive?.[0]?.lens || null,
      view: t.derive?.[0]?.view || null,
    }));

  // Branch strengths: lens scores (thicker branch = stronger affinity)
  const branches = (contextLenses || []).map((l) => ({
    lens: l.id,
    score: l.score,
    rank: l.rank,
  }));

  // Canopy: what views surfaced
  const canopy = Object.entries(viewPreferences || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([view, score]) => ({ view, score }));

  // Trunk: the dominant signal
  const trunk = primaryLens ? { lens: primaryLens.id, score: primaryLens.score } : null;

  // Soil: dataset characteristics
  const soil = {
    records: records?.length || 0,
    fields: profile?.descriptors?.length || 0,
    dimensions: Object.entries(profile?.flags || {})
      .filter(([k, v]) => k.startsWith("has_") && v === true)
      .map(([k]) => k.replace("has_", "").replace("_dimension", "")),
  };

  const digestPrefix =
    typeof sessionDigestHex === "string" &&
    /^[0-9a-f]+$/i.test(sessionDigestHex) &&
    sessionDigestHex.length >= 8
      ? sessionDigestHex.slice(0, 12).toLowerCase()
      : null;

  return {
    timestamp: isoNow(),
    schemaVersion: PATHWAY_SCHEMA_VERSION,
    glimpseVersion: PATHWAY_ENGINE_VERSION,
    ...(digestPrefix ? { digest_prefix: digestPrefix } : {}),
    file: fileField,
    telemetry_redacted: redact,
    soil,
    trunk,
    branches,
    roots: roots.slice(0, 30), // cap at 30 to stay lightweight
    canopy,
    root_count: roots.length,
    season: dateStamp(),
  };
}

/**
 * Append a pathway entry as JSONL.
 * Uses the File System Access API if available (browser),
 * otherwise returns the entry for manual handling.
 */
export async function logPathway(entry) {
  if (!entry) return null;

  const line = JSON.stringify(entry) + "\n";
  const filename = `traces-${entry.season}.jsonl`;

  // Try browser File System Access API (requires prior directory handle)
  if (typeof window !== "undefined" && window.__pathwayDirHandle) {
    try {
      const fileHandle = await window.__pathwayDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      const file = await fileHandle.getFile();
      writable.seek(file.size);
      await writable.write(line);
      await writable.close();
      return { logged: true, file: filename, size: line.length };
    } catch (e) {
      console.warn("[pathway-logger] File write failed, returning entry:", e.message);
    }
  }

  // Fallback: return the entry for the caller to handle
  return { logged: false, entry, line, filename };
}

/**
 * Initialize the pathway directory handle (browser-only).
 * Call once on app start, user picks E:/Pathways/Networks/glimpse-traces.
 */
export async function initPathwayHandle() {
  if (typeof window === "undefined" || !window.showDirectoryPicker) {
    console.info(
      "[pathway-logger] No File System Access API — entries will be returned in-memory.",
    );
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    window.__pathwayDirHandle = handle;
    console.info("[pathway-logger] Pathway directory linked:", handle.name);
    return handle;
  } catch (e) {
    console.warn("[pathway-logger] User cancelled directory picker.");
    return null;
  }
}

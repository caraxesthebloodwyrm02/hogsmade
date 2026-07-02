/**
 * Strip absolute filesystem paths from outbound JSON (Phase 3 Step 5).
 * Internal engine state is unchanged; exports use sanitized snapshots.
 */

export function basenameOnly(p) {
  const s = String(p ?? "").trim();
  if (!s) return s;
  const norm = s.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : s;
}

const UNIX_ABS = /(^|[\s"'`])(\/(?:[\w.-]+\/)+[\w.-]+)/g;
const WIN_ABS = /\b([A-Za-z]:\\(?:[^\\s"']+\\)*[^\\s"']+)/g;

export function maskPathsInString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(UNIX_ABS, (m, pre, path) => `${pre}${basenameOnly(path)}`)
    .replace(WIN_ABS, (_, path) => basenameOnly(path));
}

export function deepSanitizePaths(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskPathsInString(value);
  if (Array.isArray(value)) return value.map(deepSanitizePaths);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepSanitizePaths(v);
    }
    return out;
  }
  return value;
}

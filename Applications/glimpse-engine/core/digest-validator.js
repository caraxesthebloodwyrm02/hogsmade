/**
 * Session digest validation (browser + Node). Aligns with personal-rag-style prefix checks.
 * The dashboard binds digest = SHA256(master YAML text); pipeline runs require an internal token.
 */

export function validateDigestPrefix(fullHex64, providedPrefix) {
  if (!providedPrefix || typeof providedPrefix !== "string") {
    return { valid: false, reason: "missing_digest" };
  }
  const p = providedPrefix.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{8,64}$/.test(p)) {
    return { valid: false, reason: "invalid_digest_format" };
  }
  if (!fullHex64 || fullHex64.length < 64) {
    return { valid: false, reason: "session_not_bound" };
  }
  const full = fullHex64.toLowerCase();
  if (!full.startsWith(p)) {
    return { valid: false, reason: "digest_mismatch" };
  }
  return { valid: true, reason: "" };
}

export function digestAgeStale(issuedAtMs, maxAgeMs = 3600_000) {
  return Date.now() - issuedAtMs > maxAgeMs;
}

export async function sha256HexUniversal(message) {
  const msg = String(message ?? "");
  if (typeof process !== "undefined" && process.versions?.node) {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(msg, "utf8").digest("hex");
  }
  const enc = new TextEncoder().encode(msg);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

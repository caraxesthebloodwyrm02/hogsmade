/**
 * Shared sanitization utilities for eligibility-server
 *
 * Centralizes audit metadata and log output sanitization to prevent:
 * - Prototype pollution via forbidden key patterns (CWE-1321)
 * - Log injection via control characters (CWE-117)
 * - Resource exhaustion via unbounded metadata (CWE-400)
 */

// ── Audit Metadata Sanitization ──

export const MAX_METADATA_KEYS = 32;
export const MAX_METADATA_VALUE_LENGTH = 1024;
const FORBIDDEN_METADATA_KEYS = ["__proto__", "constructor", "prototype"];

export function sanitizeAuditMetadata(
    metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const entries = Object.entries(metadata).filter(([key]) => {
        if (FORBIDDEN_METADATA_KEYS.includes(key)) return false;
        if (key.startsWith("__")) return false;
        return typeof key === "string" && key.length <= 64;
    });
    if (entries.length > MAX_METADATA_KEYS) {
        throw new Error(`Audit metadata exceeds key limit: ${entries.length} > ${MAX_METADATA_KEYS}`);
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of entries) {
        if (typeof value === "string" && value.length > MAX_METADATA_VALUE_LENGTH) {
            sanitized[key] = value.slice(0, MAX_METADATA_VALUE_LENGTH) + "...[truncated]";
        } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
            sanitized[key] = value;
        } else if (typeof value === "string") {
            sanitized[key] = value;
        } else {
            // Complex objects: stringify with guard for circular references
            try {
                const json = JSON.stringify(value);
                if (json === undefined) {
                    sanitized[key] = null;
                } else if (json.length > MAX_METADATA_VALUE_LENGTH) {
                    sanitized[key] = json.slice(0, MAX_METADATA_VALUE_LENGTH) + "...[truncated]";
                } else {
                    sanitized[key] = value;
                }
            } catch {
                sanitized[key] = "[unserializable]";
            }
        }
    }
    return sanitized;
}

// ── Log Output Sanitization ──

const MAX_LOG_LENGTH = 256;
// Includes \x0a (LF) and \x0d (CR) — primary log injection vectors per OWASP CWE-117
const FORBIDDEN_LOG_PATTERNS = /[\x00-\x08\x0a-\x1f\x7f]|\$\{|\[object|__proto__|constructor/g;

export function sanitizeLogValue(value: string | undefined): string {
    if (!value) return "(none)";
    const sanitized = value.slice(0, MAX_LOG_LENGTH).replace(FORBIDDEN_LOG_PATTERNS, "[X]");
    return sanitized;
}

import { randomBytes } from "node:crypto";

/**
 * W3C Traceparent-compatible trace context for cross-service correlation.
 *
 * Propagated through MCP tool arguments as `_trace` (optional field).
 * Format matches W3C Trace Context Level 1 so it is zero-migration-cost
 * when HTTP/SSE transport or OpenTelemetry exporters are added later.
 */
export interface TraceContext {
  /** 32-char lowercase hex — W3C trace-id */
  traceId: string;
  /** 16-char lowercase hex — W3C parent-id (this span) */
  spanId: string;
  /** 16-char lowercase hex — the span that produced this context */
  parentSpanId?: string;
  /** W3C trace-flags byte. 0x01 = sampled. Defaults to 1. */
  flags?: number;
}

/** Generate a W3C-compatible 32-char hex trace ID. */
export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** Generate a W3C-compatible 16-char hex span ID. */
export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Create a child span from an existing trace context.
 * Inherits traceId and flags; generates a new spanId; sets parentSpanId.
 */
export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    flags: parent.flags ?? 1,
  };
}

/**
 * Start a brand-new root trace context (no parent).
 */
export function createRootSpan(): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    flags: 1,
  };
}

/**
 * Extract a TraceContext from MCP tool arguments.
 * Looks for the reserved `_trace` field. Returns null if absent or malformed.
 * Callers should treat a null result as "no tracing required" — never throw.
 */
export function extractTrace(args: Record<string, unknown>): TraceContext | null {
  const raw = args["_trace"];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const t = raw as Record<string, unknown>;
  if (typeof t["traceId"] !== "string" || typeof t["spanId"] !== "string") {
    return null;
  }
  return {
    traceId: t["traceId"],
    spanId: t["spanId"],
    parentSpanId: typeof t["parentSpanId"] === "string" ? t["parentSpanId"] : undefined,
    flags: typeof t["flags"] === "number" ? t["flags"] : 1,
  };
}

/**
 * Serialize a TraceContext to W3C traceparent header format.
 * "00-{traceId}-{spanId}-{flags}"
 */
export function formatTraceparent(ctx: TraceContext): string {
  const flags = (ctx.flags ?? 1).toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse a W3C traceparent header string into a TraceContext.
 * Returns null on parse failure.
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flagsHex] = parts;
  if (version !== "00") return null;
  if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
  if (!/^[0-9a-f]{16}$/.test(spanId)) return null;
  const flags = parseInt(flagsHex, 16);
  if (isNaN(flags)) return null;
  return { traceId, spanId, flags };
}

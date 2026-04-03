export const DEBUG_TIME_ZONE = "Asia/Dhaka";

const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEBUG_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface DebugLogContext {
  traceId: string;
  spanId: string;
  timestampUtc: string;
  timestampLocal: string;
}

export function toUtcIsoString(value: Date | number | string): string {
  return new Date(value).toISOString();
}

export function formatDebugTimestamp(
  value: Date | number | string,
  fallback = String(value),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return `${LOCAL_DATE_FORMAT.format(date)} UTC+06:00`;
}

export function createDebugLogContext(
  source: string,
  clock: Date | number | string = Date.now(),
): DebugLogContext {
  const timestampUtc = toUtcIsoString(clock);

  // Strip ISO date punctuation; regex uses Unicode escapes so Tailwind content scan does not emit invalid arbitrary-class CSS
  const stripIsoChars = /[\u002d\u003a\u002eTZ]/g;
  const stripped = timestampUtc.replace(stripIsoChars, "");
  return {
    traceId: `${source}-${stripped.slice(0, 14)}`,
    spanId: stripped.slice(-8),
    timestampUtc,
    timestampLocal: formatDebugTimestamp(timestampUtc),
  };
}

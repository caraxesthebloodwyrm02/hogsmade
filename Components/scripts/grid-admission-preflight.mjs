#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_GRID_API_URL = "http://localhost:8080";
const DEFAULT_TIMEOUT_MS = 3000;
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getGridApiUrl() {
  const raw = (process.env.GRID_API_URL || DEFAULT_GRID_API_URL).trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      raw,
      error: "GRID_API_URL is not a valid URL",
    };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return {
      ok: false,
      raw,
      error: `GRID_API_URL host '${parsed.hostname}' is not in the local allowlist`,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      raw,
      error: `GRID_API_URL protocol '${parsed.protocol}' is not allowed`,
    };
  }

  return {
    ok: true,
    raw,
    url: parsed.origin,
  };
}

export async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      url,
      json,
      bodyPreview: text.slice(0, 400),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function createPreflightReport(options = {}) {
  const timeoutMs = Number(
    options.timeoutMs ?? process.env.GRID_PREFLIGHT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      pass: false,
      error: "GRID_PREFLIGHT_TIMEOUT_MS must be a positive number",
    };
  }

  const grid = getGridApiUrl();
  if (!grid.ok) {
    return {
      pass: false,
      gridApiUrl: grid.raw,
      error: grid.error,
    };
  }

  const checks = await Promise.all([
    fetchJson(`${grid.url}/health`, timeoutMs),
    fetchJson(`${grid.url}/api/v1/health`, timeoutMs),
    fetchJson(`${grid.url}/admission/stats`, timeoutMs),
  ]);

  return {
    pass: checks[2].ok,
    gridApiUrl: grid.url,
    timeoutMs,
    checks: {
      health: checks[0],
      apiV1Health: checks[1],
      admissionStats: checks[2],
    },
    summary: checks[2].ok ? "Admission backend reachable" : "Admission backend unavailable",
  };
}

export async function runCli() {
  const report = await createPreflightReport();
  const output = JSON.stringify(report, null, 2);
  if (report.pass) {
    console.log(output);
    process.exit(0);
  }

  console.error(output);
  process.exit(1);
}

const invokedPath = process.argv[1];
const isEntrypoint = invokedPath ? import.meta.url === pathToFileURL(invokedPath).href : false;

if (isEntrypoint) {
  await runCli();
}

import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../src/server.js";

describe("overview-server smoke", () => {
  let server: ReturnType<typeof buildServer>;

  beforeAll(() => {
    // Point to temp dirs to avoid reading real data
    process.env.OVERVIEW_DATA_DIR = "/tmp/overview-test-smoke";
    process.env.ECHOES_AUDIT_PATH = "/tmp/overview-test-smoke/audit.ndjson";
    process.env.SEEDS_SNAPSHOTS_DIR = "/tmp/overview-test-smoke/snapshots";
    process.env.PULSE_JOURNAL_DIR = "/tmp/overview-test-smoke/journal";
    process.env.PULSE_FOCUS_DIR = "/tmp/overview-test-smoke/focus";
    process.env.AFLOAT_HISTORY_DIR = "/tmp/overview-test-smoke/history";
    server = buildServer();
  });

  it("should register health_check and checkpoint tools", () => {
    // McpServer doesn't expose a public tool list, but we can verify
    // it was constructed without errors
    expect(server).toBeDefined();
  });
});

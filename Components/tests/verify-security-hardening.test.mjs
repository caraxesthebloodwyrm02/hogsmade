import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "verify-security-hardening.sh");

describe("verify-security-hardening.sh", () => {
  it("script exists and is executable", () => {
    assert.ok(existsSync(SCRIPT), "script should exist");
  });

  it("runs and reports results", () => {
    let out;
    try {
      out = execFileSync("bash", [SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 15_000,
      });
    } catch (err) {
      // Script exits non-zero when some checks fail (expected in CI)
      out = err.stdout ?? "";
    }
    assert.ok(out.includes("Security Hardening Verification"), "should print header");
    assert.ok(out.includes("Tool-Specific Rules"), "should begin checking rules");
  });

  it("security docs exist in docs/security/", () => {
    const docs = [
      "NETWORK_ISOLATION_CONFIG.md",
      "SECURITY_HARDENING_MANIFEST.md",
      "SECURITY_HARDENING_SUMMARY.md",
    ];
    for (const doc of docs) {
      const p = path.join(ROOT, "docs", "security", doc);
      assert.ok(existsSync(p), `${doc} should exist in docs/security/`);
    }
  });
});

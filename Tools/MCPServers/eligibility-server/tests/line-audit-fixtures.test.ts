import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkTheLine, holdTheLine } from "../src/line-audit.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), "eligibility-line-audit-"));
});

afterEach(() => {
  delete process.env.ELIGIBILITY_LINE_AUDIT_SRC_DIR;
  delete process.env.ELIGIBILITY_LINE_AUDIT_TEST_DIR;
  rmSync(tmpRoot, { recursive: true, force: true });
});

function wireFixture(srcRel: string, testsRel: string) {
  process.env.ELIGIBILITY_LINE_AUDIT_SRC_DIR = path.join(tmpRoot, srcRel);
  process.env.ELIGIBILITY_LINE_AUDIT_TEST_DIR = path.join(tmpRoot, testsRel);
}

describe("line-audit fixture directories (ELIGIBILITY_LINE_AUDIT_*_DIR)", () => {
  it("reports barrel gap and hold_the_line appends export", () => {
    const src = path.join(tmpRoot, "src");
    const testsDir = path.join(tmpRoot, "tests");
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "index.ts"), `export { x } from "./a.js";\n`);
    writeFileSync(path.join(src, "a.ts"), `export const x = 1;\n`);
    writeFileSync(path.join(src, "b.ts"), `export const y = 2;\n`);
    writeFileSync(
      path.join(testsDir, "smoke.test.ts"),
      `import { describe, it } from "vitest";\ndescribe("x", () => { it("y", () => {}); });\n`,
    );
    wireFixture("src", "tests");

    const first = checkTheLine();
    expect(first.clean).toBe(false);
    expect(first.findings.some((f) => f.rule === "barrel-completeness" && f.file === "b.ts")).toBe(
      true,
    );

    const held = holdTheLine();
    expect(held.fixedCount).toBeGreaterThan(0);
    const indexAfter = readFileSync(path.join(src, "index.ts"), "utf8");
    expect(indexAfter).toContain("./b.js");

    delete process.env.ELIGIBILITY_LINE_AUDIT_SRC_DIR;
    delete process.env.ELIGIBILITY_LINE_AUDIT_TEST_DIR;
    process.env.ELIGIBILITY_LINE_AUDIT_SRC_DIR = src;
    process.env.ELIGIBILITY_LINE_AUDIT_TEST_DIR = testsDir;
    const rescanned = checkTheLine();
    expect(rescanned.findings.some((f) => f.rule === "barrel-completeness")).toBe(false);
  });

  it("detects circular imports with non-clean summary", () => {
    const src = path.join(tmpRoot, "src");
    const testsDir = path.join(tmpRoot, "tests");
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(src, { recursive: true });
    writeFileSync(
      path.join(src, "index.ts"),
      `export { a } from "./ca.js";\nexport { b } from "./cb.js";\n`,
    );
    writeFileSync(path.join(src, "ca.ts"), `import { b } from "./cb.js";\nexport const a = 1;\n`);
    writeFileSync(path.join(src, "cb.ts"), `import { a } from "./ca.js";\nexport const b = 2;\n`);
    writeFileSync(path.join(testsDir, "t.test.ts"), "");
    wireFixture("src", "tests");

    const result = checkTheLine();
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.rule === "circular-import")).toBe(true);
    expect(result.summary).not.toContain("0 findings");
  });

  it("flags mock path misalignment against package imports", () => {
    const src = path.join(tmpRoot, "src");
    const testsDir = path.join(tmpRoot, "tests");
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "index.ts"), `export { useIt } from "./use-it.js";\n`);
    writeFileSync(
      path.join(src, "use-it.ts"),
      `import { emitAudit } from "@cascade/shared-types/audit-client";\nexport function useIt() { return emitAudit; }\n`,
    );
    const cascadeTypesRoot = "@cascade/" + "shared-types";
    writeFileSync(
      path.join(testsDir, "mocked.test.ts"),
      `import { vi } from "vitest";\nvi.mock("${cascadeTypesRoot}", () => ({}));\n`,
    );
    wireFixture("src", "tests");

    const result = checkTheLine();
    expect(result.findings.some((f) => f.rule === "mock-alignment")).toBe(true);
  });

  it("warns on main entry vs subpath split for shared-types", () => {
    const src = path.join(tmpRoot, "src");
    const testsDir = path.join(tmpRoot, "tests");
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(src, { recursive: true });
    writeFileSync(
      path.join(src, "index.ts"),
      `export { a } from "./a.js";\nexport { b } from "./b.js";\n`,
    );
    writeFileSync(
      path.join(src, "a.ts"),
      `import { securityPolicy } from "@cascade/shared-types";\nexport const a = () => securityPolicy;\n`,
    );
    writeFileSync(
      path.join(src, "b.ts"),
      `import { securityPolicy } from "@cascade/shared-types/security-policy";\nexport const b = () => securityPolicy;\n`,
    );
    writeFileSync(path.join(testsDir, "t.test.ts"), "");
    wireFixture("src", "tests");

    const before = checkTheLine();
    expect(before.findings.some((f) => f.message.includes("via main entry"))).toBe(true);

    holdTheLine();
    const aContent = readFileSync(path.join(src, "a.ts"), "utf8");
    expect(aContent).toContain("@cascade/shared-types/security-policy");
  });

  it("fixes dist-style relative import to package subpath", () => {
    const src = path.join(tmpRoot, "src");
    const testsDir = path.join(tmpRoot, "tests");
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "index.ts"), `export { x } from "./zap.js";\n`);
    writeFileSync(
      path.join(src, "zap.ts"),
      `import { emitAudit } from "../../vendor/shared-types/dist/audit-client.js";\nexport const x = emitAudit;\n`,
    );
    writeFileSync(path.join(testsDir, "t.test.ts"), "");
    wireFixture("src", "tests");

    expect(checkTheLine().findings.some((f) => f.rule === "specifier-consistency")).toBe(true);
    holdTheLine();
    const zap = readFileSync(path.join(src, "zap.ts"), "utf8");
    expect(zap).toContain("@cascade/shared-types/audit-client");
    expect(zap).not.toContain("/dist/");
  });
});

/**
 * module-audit — CLI wrapper for line-audit
 *
 *   npx tsx scripts/module-audit.ts          # detect only
 *   npx tsx scripts/module-audit.ts --fix    # detect and auto-fix
 */

import { checkTheLine, holdTheLine } from "../src/line-audit.js";

const fix = process.argv.includes("--fix");
const result = fix ? holdTheLine() : checkTheLine();

if (result.clean) {
  console.log(`module-audit: ${result.summary}`);
  process.exit(0);
}

if (result.fixedCount > 0) {
  console.log(`module-audit: applied ${result.fixedCount} fix(es).`);
}

console.log(`module-audit: ${result.summary}\n`);

const errors = result.findings.filter((f) => f.severity === "error");
const warnings = result.findings.filter((f) => f.severity === "warn");

if (errors.length > 0) {
  console.log("Errors:");
  for (const f of errors) {
    const loc = f.line ? `:${f.line}` : "";
    const tag = f.fixable ? " [fixable]" : "";
    console.log(`  ERROR  [${f.rule}] ${f.file}${loc}: ${f.message}${tag}`);
  }
  console.log();
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const f of warnings) {
    const loc = f.line ? `:${f.line}` : "";
    const tag = f.fixable ? " [fixable]" : "";
    console.log(`  WARN   [${f.rule}] ${f.file}${loc}: ${f.message}${tag}`);
  }
  console.log();
}

process.exit(errors.length > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * registry-build.mjs
 * Validates ~/.claude/registry/chain.yaml against chain.schema.json and
 * regenerates ~/.claude/CHAIN.md from the validated YAML source.
 *
 * Usage:
 *   node scripts/registry-build.mjs [--dry-run] [--validate-only]
 *
 * Exit codes:
 *   0  All checks passed (and CHAIN.md written unless --dry-run or --validate-only).
 *   1  Validation failure or I/O error.
 *
 * Row 7 of the Hogsmade agentic-notebook rollout plan.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

// Load js-yaml from the CascadeProjects workspace node_modules
const _require = createRequire(import.meta.url);
const YAML = _require(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../node_modules/js-yaml/index.js"),
);

const HOME = os.homedir();
const REGISTRY_DIR = path.join(HOME, ".claude", "registry");
const YAML_PATH = path.join(REGISTRY_DIR, "chain.yaml");
const SCHEMA_PATH = path.join(REGISTRY_DIR, "chain.schema.json");
const CHAIN_MD_PATH = path.join(HOME, ".claude", "CHAIN.md");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VALIDATE_ONLY = args.includes("--validate-only");
// --check-release: verify marketplace.json sha resolves to a tagged commit in the local repo
const CHECK_RELEASE = args.includes("--check-release");

// YAML parsing delegated to js-yaml (loaded above via createRequire).

// ---------------------------------------------------------------------------
// Schema validator (minimal JSON Schema draft 2020-12 subset)
// Validates: type, required, properties, additionalProperties, enum,
//            pattern, minLength, minItems, items, $ref, $defs.
// ---------------------------------------------------------------------------
function validateSchema(data, schema, defs = null, path = "#") {
  const errors = [];
  if (!defs && schema.$defs) defs = schema.$defs;

  function resolve(ref) {
    if (!ref.startsWith("#/$defs/")) throw new Error(`Unsupported $ref: ${ref}`);
    const name = ref.replace("#/$defs/", "");
    if (!defs || !defs[name]) throw new Error(`Unknown $def: ${name}`);
    return defs[name];
  }

  function validate(d, s, p) {
    if (s.$ref) {
      s = resolve(s.$ref);
    }
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      const actual = d === null ? "null" : Array.isArray(d) ? "array" : typeof d;
      if (!types.includes(actual)) {
        errors.push(`${p}: expected type ${types.join("|")}, got ${actual}`);
        return;
      }
    }
    if (s.enum && !s.enum.includes(d)) {
      errors.push(`${p}: "${d}" not in enum [${s.enum.join(", ")}]`);
    }
    if (s.pattern && typeof d === "string" && !new RegExp(s.pattern).test(d)) {
      errors.push(`${p}: "${d}" does not match pattern ${s.pattern}`);
    }
    if (s.minLength !== undefined && typeof d === "string" && d.length < s.minLength) {
      errors.push(`${p}: string length ${d.length} < minLength ${s.minLength}`);
    }
    if (s.minItems !== undefined && Array.isArray(d) && d.length < s.minItems) {
      errors.push(`${p}: array length ${d.length} < minItems ${s.minItems}`);
    }
    if (s.required && typeof d === "object" && d !== null && !Array.isArray(d)) {
      for (const req of s.required) {
        if (!(req in d)) {
          errors.push(`${p}: missing required field "${req}"`);
        }
      }
    }
    if (s.properties && typeof d === "object" && d !== null && !Array.isArray(d)) {
      for (const [k, propSchema] of Object.entries(s.properties)) {
        if (k in d) {
          validate(d[k], propSchema, `${p}.${k}`);
        }
      }
      if (s.additionalProperties === false) {
        for (const k of Object.keys(d)) {
          if (!s.properties[k]) {
            errors.push(`${p}: unexpected additional property "${k}"`);
          }
        }
      }
    }
    if (s.items && Array.isArray(d)) {
      d.forEach((item, idx) => validate(item, s.items, `${p}[${idx}]`));
    }
  }

  validate(data, schema, path);
  return errors;
}

// ---------------------------------------------------------------------------
// CHAIN.md renderer
// ---------------------------------------------------------------------------
function renderChainMd(chain) {
  const lines = [
    `# CHAIN.md — Prince's Agent Routing Matrix`,
    `# Source of truth: ~/.claude/registry/chain.yaml (compile with registry-build)`,
    `# Last updated: ${chain.updatedAt ?? new Date().toISOString().slice(0, 10)}`,
    ``,
    `---`,
    ``,
    `## How To Read This`,
    ``,
    `Each workstream entry is a decision tree node, not a menu.`,
    `Format: TRIGGER → AGENT → SKILLS → EFFORT → OUTPUT CONTRACT`,
    ``,
    `The chain is authoritative. If Claude Code infers differently, the chain wins.`,
    ``,
    `---`,
    ``,
    `## Workstream Routing Table`,
    ``,
  ];

  for (const ws of chain.workstreams) {
    if (ws.status === "parked") {
      lines.push(`### ${ws.cmd} *(PARKED ${ws.parkedAt ?? ""})*`);
    } else {
      lines.push(`### ${ws.cmd}`);
    }
    lines.push(`**Trigger:** ${(ws.triggers ?? []).join(", ")}`);
    lines.push(`**Agent:** ${ws.agent}`);
    if (ws.skills && ws.skills.length > 0) {
      lines.push(`**Skills:** ${ws.skills.join(", ")}`);
    } else {
      lines.push(`**Skills:** none`);
    }
    lines.push(`**Effort:** ${ws.effort}`);
    if (ws.constraints && ws.constraints.length > 0) {
      lines.push(`**Constraints:**`);
      for (const c of ws.constraints) lines.push(`  - ${c}`);
    }
    if (ws.sequence && ws.sequence.length > 0) {
      lines.push(`**Sequence (strict order):**`);
      for (const s of ws.sequence) lines.push(`  ${s}`);
      if (ws.classificationGate) {
        lines.push(`**Classification gate per parked item:** ${ws.classificationGate}`);
      }
    }
    lines.push(`**Output contract:** ${ws.outputContract}`);
    if (ws.activeDebt && ws.activeDebt.length > 0) {
      lines.push(`**Active debt:**`);
      for (const d of ws.activeDebt) lines.push(`  - ${d}`);
      if (ws.debtNote) lines.push(`  - *${ws.debtNote}*`);
    }
    lines.push(``, `---`, ``);
  }

  lines.push(
    `## Fallback Rule`,
    ``,
    `If no workstream trigger matches:`,
    `→ Default to ${chain.fallback.agent}`,
    `→ Effort: ${chain.fallback.effort}`,
    `→ Read the relevant file(s) before any edit`,
    `→ Report format: ${chain.fallback.reportFormat}`,
    ``,
    `---`,
    ``,
    `## Chain Maintenance`,
    ``,
    `To add a workstream:`,
    `1. Add entry to ~/.claude/registry/chain.yaml following the schema`,
    `2. Run: node CascadeProjects/scripts/registry-build.mjs --dry-run to verify`,
    `3. Run without --dry-run to write CHAIN.md`,
    ``,
    `To deprecate a workstream:`,
    `1. Set status: parked and parkedAt: YYYY-MM-DD`,
    `2. Do not delete — keeps routing history`,
    ``,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Release pinning check (Row 8a)
// ---------------------------------------------------------------------------
import { execSync } from "node:child_process";

async function checkReleasePinning() {
  // Look for a marketplace.json file in the repo (or a sibling hogsmade-marketplace dir)
  const candidates = [
    path.join(HOME, "hogsmade-marketplace", ".claude-plugin", "marketplace.json"),
    path.join(
      HOME,
      "gruff",
      "workspace",
      "hogsmade-marketplace",
      ".claude-plugin",
      "marketplace.json",
    ),
  ];
  const marketplacePath = candidates.find(existsSync);

  if (!marketplacePath) {
    console.log(
      "  Release check: marketplace.json not found — skipping (create hogsmade-marketplace repo for full pinning)",
    );
    return;
  }

  const marketplace = JSON.parse(await readFile(marketplacePath, "utf-8"));
  const plugins = marketplace.plugins ?? [];
  const hogsmadePlugin = plugins.find((p) => p.name === "hogsmade-notebook");

  if (!hogsmadePlugin) {
    console.error("  FAIL: hogsmade-notebook not found in marketplace.json");
    process.exit(1);
  }

  const sha = hogsmadePlugin.source?.sha;
  if (!sha) {
    console.error(
      "  FAIL: marketplace entry missing source.sha — floating ref violates trust contract",
    );
    process.exit(1);
  }

  // Verify the sha resolves to a tagged commit in the local repo
  try {
    const tags = execSync(`git -C ${HOME}/gruff/workspace/CascadeProjects tag --points-at ${sha}`, {
      encoding: "utf-8",
    }).trim();
    if (!tags) {
      console.error(
        `  FAIL: sha ${sha} does not point to any tag — pin to a tagged release commit`,
      );
      process.exit(1);
    }
    console.log(
      `  Release check: PASS (sha ${sha.slice(0, 8)}... → tags: ${tags.replace(/\n/g, ", ")})`,
    );
  } catch {
    console.error(`  FAIL: sha ${sha.slice(0, 8)}... not found in CascadeProjects git history`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("registry-build — validating CHAIN contract");
  console.log(`  YAML:   ${YAML_PATH}`);
  console.log(`  Schema: ${SCHEMA_PATH}`);
  console.log(`  Output: ${CHAIN_MD_PATH}`);

  // 1. Load files
  if (!existsSync(YAML_PATH)) {
    console.error(`ERROR: ${YAML_PATH} not found`);
    process.exit(1);
  }
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`ERROR: ${SCHEMA_PATH} not found`);
    process.exit(1);
  }

  const yamlText = await readFile(YAML_PATH, "utf-8");
  const schemaText = await readFile(SCHEMA_PATH, "utf-8");

  let chain, schema;
  try {
    chain = YAML.load(yamlText);
  } catch (e) {
    console.error(`ERROR: failed to parse chain.yaml: ${e.message}`);
    process.exit(1);
  }
  try {
    schema = JSON.parse(schemaText);
  } catch (e) {
    console.error(`ERROR: failed to parse chain.schema.json: ${e.message}`);
    process.exit(1);
  }

  // 2. Validate
  const errors = validateSchema(chain, schema);
  if (errors.length > 0) {
    console.error(`VALIDATION FAILED (${errors.length} error${errors.length > 1 ? "s" : ""}):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`  Validation: PASS (${chain.workstreams.length} workstreams)`);

  if (VALIDATE_ONLY) {
    console.log("  Mode: validate-only — skipping CHAIN.md generation");
    process.exit(0);
  }

  // Release pinning check (Row 8a)
  if (CHECK_RELEASE) {
    await checkReleasePinning();
  }

  // 3. Render CHAIN.md
  const mdContent = renderChainMd(chain);

  if (DRY_RUN) {
    console.log("\n--- CHAIN.md (dry-run preview, first 40 lines) ---");
    console.log(mdContent.split("\n").slice(0, 40).join("\n"));
    console.log("---");
    console.log("Mode: dry-run — no files written");
    process.exit(0);
  }

  // 4. Write
  await mkdir(path.dirname(CHAIN_MD_PATH), { recursive: true });
  await writeFile(CHAIN_MD_PATH, mdContent, "utf-8");
  console.log(`  Written: ${CHAIN_MD_PATH}`);
  console.log("RESULT: OK");
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});

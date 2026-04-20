/**
 * line-audit — Structural normalizer core
 *
 * Importable module that detects and fixes import order mismatches,
 * specifier drift, barrel gaps, mock alignment failures, audit coverage
 * holes, and circular imports.
 *
 * Exposed via MCP tools:
 *   check_the_line  — detect only (read-only)
 *   hold_the_line   — detect and auto-fix
 *
 * Also used by scripts/module-audit.ts as CLI.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── Configuration ──

const BARREL = "index.ts";
const HANDLER_SUFFIX = "Handler";
const AUDIT_CALL_PATTERN = /emit(?:Eligibility)?Audit|emitCycleAudit|emitAudit/;

const CANONICAL_PACKAGES: CanonicalPackage[] = [
  {
    matchKey: "shared-types",
    prefix: "@cascade/shared-types",
    subpaths: {
      "/audit-client": ["emitAudit", "AuditEvent"],
      "/security-policy": ["securityPolicy"],
      "/session-rate-limit": ["sessionRateLimit"],
      "/trace-context": [
        "TraceContext",
        "extractTrace",
        "formatTraceparent",
        "createRootSpan",
        "createChildSpan",
      ],
    },
  },
  {
    matchKey: "shared-pipeline",
    prefix: "@cascade/shared-pipeline",
    subpaths: {},
  },
];

// ── Types ──

interface CanonicalPackage {
  matchKey: string;
  prefix: string;
  subpaths: Record<string, string[]>;
}

export interface LineFinding {
  rule: string;
  severity: "error" | "warn";
  file: string;
  line?: number;
  message: string;
  fixable: boolean;
}

interface InternalFinding extends LineFinding {
  fix?: () => void;
}

interface ImportEntry {
  specifier: string;
  line: number;
  isType: boolean;
  rawLine: string;
}

interface ModuleInfo {
  file: string;
  relativePath: string;
  content: string;
  lines: string[];
  imports: ImportEntry[];
  exportedNames: string[];
  handlerNames: string[];
}

export interface LineAuditResult {
  clean: boolean;
  errorCount: number;
  warningCount: number;
  fixableCount: number;
  fixedCount: number;
  findings: LineFinding[];
  summary: string;
}

// ── Parsing ──

function listTsFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function parseImports(lines: string[]): ImportEntry[] {
  const entries: ImportEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^import\s+(type\s+)?.*?(?:from\s+)?["']([^"']+)["']/);
    if (match) {
      entries.push({
        specifier: match[2],
        line: i + 1,
        isType: Boolean(match[1]),
        rawLine: line,
      });
    }
  }
  return entries;
}

function parseExportedNames(lines: string[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    const fnMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) names.push(fnMatch[1]);
    const classMatch = line.match(/^export\s+class\s+(\w+)/);
    if (classMatch) names.push(classMatch[1]);
    const constMatch = line.match(/^export\s+(?:const|let)\s+(\w+)/);
    if (constMatch) names.push(constMatch[1]);
  }
  return names;
}

function buildModuleInfo(filePath: string, baseDir: string): ModuleInfo {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const exportedNames = parseExportedNames(lines);
  return {
    file: filePath,
    relativePath: path.relative(baseDir, filePath),
    content,
    lines,
    imports: parseImports(lines),
    exportedNames,
    handlerNames: exportedNames.filter((n) => n.endsWith(HANDLER_SUFFIX)),
  };
}

function rewriteLine(filePath: string, lineNumber: number, oldLine: string, newLine: string): void {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const idx = lineNumber - 1;
  if (lines[idx] === oldLine) {
    lines[idx] = newLine;
    writeFileSync(filePath, lines.join("\n"));
  }
}

// ── Rule Implementations ──

function resolveCanonicalSpecifier(importLine: string, pkg: CanonicalPackage): string {
  const namesMatch = importLine.match(/import\s+(?:type\s+)?{([^}]+)}/);
  const importedNames = namesMatch
    ? namesMatch[1].split(",").map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
    : [];
  for (const [subpath, knownNames] of Object.entries(pkg.subpaths)) {
    if (importedNames.some((name) => knownNames.includes(name))) {
      return `${pkg.prefix}${subpath}`;
    }
  }
  return pkg.prefix;
}

function checkSpecifierConsistency(modules: ModuleInfo[], srcDir: string): InternalFinding[] {
  const findings: InternalFinding[] = [];

  for (const mod of modules) {
    for (const imp of mod.imports) {
      for (const pkg of CANONICAL_PACKAGES) {
        const isRelativeToPackage =
          imp.specifier.includes(`/${pkg.matchKey}/`) ||
          imp.specifier.includes(`/${pkg.matchKey.replace("@cascade/", "")}/`);
        const isPackageImport = imp.specifier.startsWith(pkg.prefix);
        const isRelativeDistPath = imp.specifier.includes("/dist/") && isRelativeToPackage;

        if (isRelativeDistPath && !isPackageImport) {
          const canonical = resolveCanonicalSpecifier(imp.rawLine, pkg);
          const newLine = imp.rawLine.replace(imp.specifier, canonical);
          findings.push({
            rule: "specifier-consistency",
            severity: "error",
            file: mod.relativePath,
            line: imp.line,
            message: `Import "${imp.specifier}" bypasses package contract → "${canonical}"`,
            fixable: true,
            fix: () => rewriteLine(mod.file, imp.line, imp.rawLine, newLine),
          });
        }
      }
    }
  }

  // Cross-module main-vs-subpath split
  const specsByDep = new Map<
    string,
    Map<string, { file: string; line: number; rawLine: string }[]>
  >();
  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (imp.specifier.startsWith(".") || imp.isType) continue;
      const parts = imp.specifier.split("/");
      const pkgRoot = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
      const bucket = specsByDep.get(pkgRoot) ?? new Map();
      const list = bucket.get(imp.specifier) ?? [];
      list.push({ file: mod.relativePath, line: imp.line, rawLine: imp.rawLine });
      bucket.set(imp.specifier, list);
      specsByDep.set(pkgRoot, bucket);
    }
  }

  for (const [pkgRoot, specMap] of specsByDep) {
    const specifiers = [...specMap.keys()];
    if (specifiers.length <= 1) continue;
    const hasMain = specifiers.some((s) => s === pkgRoot);
    const subpaths = specifiers.filter((s) => s !== pkgRoot && s.startsWith(pkgRoot + "/"));
    if (hasMain && subpaths.length > 0) {
      const mainLocs = specMap.get(pkgRoot) ?? [];
      const pkg = CANONICAL_PACKAGES.find((p) => p.prefix === pkgRoot);
      for (const loc of mainLocs) {
        const canonical = pkg ? resolveCanonicalSpecifier(loc.rawLine, pkg) : subpaths[0];
        const canFix = canonical !== pkgRoot;
        findings.push({
          rule: "specifier-consistency",
          severity: "warn",
          file: loc.file,
          line: loc.line,
          message: `"${pkgRoot}" via main entry; prefer subpath "${canonical}"`,
          fixable: canFix,
          fix: canFix
            ? () => {
                const srcContent = readFileSync(path.join(srcDir, loc.file), "utf8");
                const newLine = loc.rawLine
                  .replace(`"${pkgRoot}"`, `"${canonical}"`)
                  .replace(`'${pkgRoot}'`, `'${canonical}'`);
                writeFileSync(
                  path.join(srcDir, loc.file),
                  srcContent.replace(loc.rawLine, newLine),
                );
              }
            : undefined,
        });
      }
    }
  }

  return findings;
}

function checkBarrelCompleteness(modules: ModuleInfo[]): InternalFinding[] {
  const findings: InternalFinding[] = [];
  const barrel = modules.find((mod) => mod.relativePath === BARREL);
  if (!barrel) {
    findings.push({
      rule: "barrel-completeness",
      severity: "error",
      file: BARREL,
      message: "Barrel index.ts not found.",
      fixable: false,
    });
    return findings;
  }

  const barrelContent = barrel.content;
  for (const mod of modules) {
    if (mod.relativePath === BARREL || mod.relativePath.startsWith("..")) continue;
    const moduleSlug = "./" + mod.relativePath.replace(/\.ts$/, ".js");
    const escaped = moduleSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`from\\s+["']${escaped}["']`).test(barrelContent)) {
      findings.push({
        rule: "barrel-completeness",
        severity: "warn",
        file: mod.relativePath,
        message: `No re-export in ${BARREL}.`,
        fixable: true,
        fix: () => {
          const publicNames = mod.exportedNames.filter((n) => !n.startsWith("_"));
          if (publicNames.length === 0) return;
          const exportLine = `export { ${publicNames.join(", ")} } from "${moduleSlug}";\n`;
          const current = readFileSync(barrel.file, "utf8");
          writeFileSync(barrel.file, current.trimEnd() + "\n" + exportLine);
        },
      });
    }
  }

  return findings;
}

function checkMockAlignment(
  srcModules: ModuleInfo[],
  testModules: ModuleInfo[],
): InternalFinding[] {
  const findings: InternalFinding[] = [];

  const mocked = new Set<string>();
  for (const t of testModules) {
    for (const m of t.content.matchAll(/vi\.mock\(\s*["']([^"']+)["']/g)) {
      mocked.add(m[1]);
    }
  }
  if (mocked.size === 0) return findings;

  const srcSpecs = new Map<
    string,
    { file: string; line: number; rawLine: string; mod: ModuleInfo }[]
  >();
  for (const mod of srcModules) {
    for (const imp of mod.imports) {
      if (imp.specifier.startsWith(".") || imp.isType) continue;
      const list = srcSpecs.get(imp.specifier) ?? [];
      list.push({ file: mod.relativePath, line: imp.line, rawLine: imp.rawLine, mod });
      srcSpecs.set(imp.specifier, list);
    }
  }

  for (const [srcSpec, locs] of srcSpecs) {
    if (mocked.has(srcSpec)) continue;
    const srcRoot = srcSpec.startsWith("@")
      ? srcSpec.split("/").slice(0, 2).join("/")
      : srcSpec.split("/")[0];
    for (const mockSpec of mocked) {
      const mockRoot = mockSpec.startsWith("@")
        ? mockSpec.split("/").slice(0, 2).join("/")
        : mockSpec.split("/")[0];
      if (srcRoot === mockRoot && srcSpec !== mockSpec) {
        for (const loc of locs) {
          const newLine = loc.rawLine
            .replace(`"${srcSpec}"`, `"${mockSpec}"`)
            .replace(`'${srcSpec}'`, `'${mockSpec}'`);
          findings.push({
            rule: "mock-alignment",
            severity: "error",
            file: loc.file,
            line: loc.line,
            message: `Source "${srcSpec}" vs mock "${mockSpec}" — mock won't intercept.`,
            fixable: true,
            fix: () => rewriteLine(loc.mod.file, loc.line, loc.rawLine, newLine),
          });
        }
      }
    }
  }

  return findings;
}

function checkAuditSymmetry(modules: ModuleInfo[]): InternalFinding[] {
  const findings: InternalFinding[] = [];
  for (const mod of modules) {
    for (const name of mod.handlerNames) {
      const start = mod.lines.findIndex((l) =>
        l.match(new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`)),
      );
      if (start < 0) continue;
      let end = mod.lines.length;
      for (let i = start + 1; i < mod.lines.length; i++) {
        if (mod.lines[i].match(/^export\s+(?:async\s+)?function\s+\w+/)) {
          end = i;
          break;
        }
      }
      if (!AUDIT_CALL_PATTERN.test(mod.lines.slice(start, end).join("\n"))) {
        findings.push({
          rule: "audit-symmetry",
          severity: "warn",
          file: mod.relativePath,
          line: start + 1,
          message: `Handler "${name}" has no audit emit call.`,
          fixable: false,
        });
      }
    }
  }
  return findings;
}

function checkCircularImports(modules: ModuleInfo[]): InternalFinding[] {
  const findings: InternalFinding[] = [];
  const graph = new Map<string, string[]>();
  for (const mod of modules) {
    const edges: string[] = [];
    for (const imp of mod.imports) {
      if (!imp.specifier.startsWith(".")) continue;
      edges.push(
        path.normalize(
          path.join(path.dirname(mod.relativePath), imp.specifier.replace(/\.js$/, ".ts")),
        ),
      );
    }
    graph.set(mod.relativePath, edges);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  function dfs(node: string, trail: string[]): void {
    if (inStack.has(node)) {
      const cycle = trail.slice(trail.indexOf(node)).concat(node);
      findings.push({
        rule: "circular-import",
        severity: "error",
        file: node,
        message: `Circular: ${cycle.join(" → ")}`,
        fixable: false,
      });
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    for (const nb of graph.get(node) ?? []) {
      if (graph.has(nb)) dfs(nb, [...trail, node]);
    }
    inStack.delete(node);
  }
  for (const node of graph.keys()) dfs(node, []);
  return findings;
}

function checkOrphanedExports(modules: ModuleInfo[]): InternalFinding[] {
  const findings: InternalFinding[] = [];
  if (!modules.some((m) => m.relativePath === BARREL)) return findings;
  const allContent = modules.map((m) => m.content).join("\n");
  for (const mod of modules) {
    if (mod.relativePath === BARREL) continue;
    for (const name of mod.exportedNames) {
      const matches = allContent.match(new RegExp(`\\b${name}\\b`, "g"));
      if (matches && matches.length <= 1) {
        findings.push({
          rule: "orphaned-export",
          severity: "warn",
          file: mod.relativePath,
          message: `"${name}" exported but never referenced.`,
          fixable: false,
        });
      }
    }
  }
  return findings;
}

// ── Public API ──

function resolveDirs(): { srcDir: string; testDir: string } {
  const envSrc = process.env.ELIGIBILITY_LINE_AUDIT_SRC_DIR;
  const envTest = process.env.ELIGIBILITY_LINE_AUDIT_TEST_DIR;
  if (envSrc && envTest) {
    return {
      srcDir: path.resolve(envSrc),
      testDir: path.resolve(envTest),
    };
  }
  // Package-local sweep only: this directory's package (eligibility-server), not CascadeProjects or workspace root.
  const thisDir = path.dirname(new URL(import.meta.url).pathname);
  const projectRoot = path.resolve(thisDir, "..");
  return {
    srcDir: path.join(projectRoot, "src"),
    testDir: path.join(projectRoot, "tests"),
  };
}

function collectFindings(srcDir: string, testDir: string): InternalFinding[] {
  const srcFiles = listTsFiles(srcDir);
  const testFiles = listTsFiles(testDir);
  if (srcFiles.length === 0) return [];

  const srcModules = srcFiles.map((f) => buildModuleInfo(f, srcDir));
  const testModules = testFiles.map((f) => buildModuleInfo(f, testDir));

  return [
    ...checkSpecifierConsistency(srcModules, srcDir),
    ...checkBarrelCompleteness(srcModules),
    ...checkMockAlignment(srcModules, testModules),
    ...checkAuditSymmetry(srcModules),
    ...checkCircularImports(srcModules),
    ...checkOrphanedExports(srcModules),
  ];
}

function toPublic(f: InternalFinding): LineFinding {
  return {
    rule: f.rule,
    severity: f.severity,
    file: f.file,
    line: f.line,
    message: f.message,
    fixable: f.fixable,
  };
}

function buildSummary(errors: number, warnings: number, fixable: number, fixed: number): string {
  if (errors === 0 && warnings === 0) return "Line is clean. 6 rules, 0 findings.";
  const parts = [`${errors} error(s), ${warnings} warning(s)`];
  if (fixed > 0) parts.push(`${fixed} fixed`);
  else if (fixable > 0) parts.push(`${fixable} fixable`);
  return parts.join(", ");
}

/**
 * check_the_line — read-only structural audit.
 * Returns findings without modifying any files.
 */
export function checkTheLine(): LineAuditResult {
  const { srcDir, testDir } = resolveDirs();
  const findings = collectFindings(srcDir, testDir);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const fixable = findings.filter((f) => f.fixable).length;

  return {
    clean: errors === 0 && warnings === 0,
    errorCount: errors,
    warningCount: warnings,
    fixableCount: fixable,
    fixedCount: 0,
    findings: findings.map(toPublic),
    summary: buildSummary(errors, warnings, fixable, 0),
  };
}

/**
 * hold_the_line — detect and auto-fix.
 * Applies all fixable corrections, re-scans, and returns remaining findings.
 */
export function holdTheLine(): LineAuditResult {
  const { srcDir, testDir } = resolveDirs();
  const findings = collectFindings(srcDir, testDir);
  const fixable = findings.filter((f) => f.fix);

  let fixedCount = 0;
  for (const f of fixable) {
    f.fix!();
    fixedCount++;
  }

  // Re-scan after fixes
  const remaining = collectFindings(srcDir, testDir);
  const errors = remaining.filter((f) => f.severity === "error").length;
  const warnings = remaining.filter((f) => f.severity === "warn").length;
  const stillFixable = remaining.filter((f) => f.fixable).length;

  return {
    clean: errors === 0 && warnings === 0,
    errorCount: errors,
    warningCount: warnings,
    fixableCount: stillFixable,
    fixedCount,
    findings: remaining.map(toPublic),
    summary: buildSummary(errors, warnings, stillFixable, fixedCount),
  };
}

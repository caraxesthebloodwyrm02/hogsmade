#!/usr/bin/env node
import fs from "node:fs";
import { execSync } from "node:child_process";

const ROOT = "/home/caraxes/CascadeProjects";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function listRegisterTools(file) {
  const src = read(file);
  const re = /registerTool\(\s*["']([^"']+)["']/g;
  const tools = [];
  let m;
  while ((m = re.exec(src))) {
    tools.push(m[1]);
  }
  return tools;
}

function runPythonDepsCheck() {
  const cmd = `python - <<'PY'
mods=['pydantic','httpx','mcp']
for m in mods:
  try:
    __import__(m)
    print(m+':ok')
  except Exception as e:
    print(m+':missing:'+type(e).__name__)
PY`;
  let out = "";
  try {
    out = execSync(cmd, { encoding: "utf8", cwd: ROOT });
  } catch (error) {
    // Some sandboxed environments throw even when stdout is produced.
    out = typeof error?.stdout === "string" ? error.stdout : "";
  }
  const rows = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, status, detail] = line.split(":");
      return { name, status, detail: detail ?? null };
    });
  const missing = rows.filter((r) => r.status !== "ok").map((r) => r.name);
  return { rows, missing };
}

function boolStatus(ok) {
  return ok ? "pass" : "fail";
}

const srcServer = `${ROOT}/echoes-server/src/server.ts`;
const distServer = `${ROOT}/echoes-server/dist/server.js`;
const precedentStore = `${ROOT}/echoes-server/src/precedent-store.ts`;

const srcTools = listRegisterTools(srcServer);
const distTools = listRegisterTools(distServer);
const missingInDist = srcTools.filter((t) => !distTools.includes(t));

const precedentStoreSrc = read(precedentStore);
const precedentUsesHomeDefault =
  precedentStoreSrc.includes("homedir()") && precedentStoreSrc.includes("DEFAULT_DIR");

const serverSrc = read(srcServer);
const queryAuditErrorAlias =
  serverSrc.includes("filter.status === 'error'") &&
  serverSrc.includes("entry.status === 'failure'");
const runModeExplicit = /run[_-]?mode|runMode/.test(serverSrc);

const dep = runPythonDepsCheck();

const checks = [
  {
    pillar: "isolation",
    id: "mutating_run_mode_flag",
    description: "Mutating tool calls require explicit run mode.",
    status: boolStatus(runModeExplicit),
    evidence: runModeExplicit
      ? "runMode control detected in echoes-server/src/server.ts"
      : "No runMode-style flag detected in echoes-server/src/server.ts",
  },
  {
    pillar: "isolation",
    id: "precedent_store_env_scoped",
    description: "Precedent store root is derived from env-scoped data dir in sandbox mode.",
    status: boolStatus(!precedentUsesHomeDefault),
    evidence: precedentUsesHomeDefault
      ? "precedent-store.ts defaults to ~/.echoes/precedents via homedir()"
      : "No hardcoded homedir precedent default found",
  },
  {
    pillar: "dependency_completeness",
    id: "echoes_src_dist_tool_parity",
    description: "echoes-server dist exports all tools present in src.",
    status: boolStatus(missingInDist.length === 0),
    evidence:
      missingInDist.length === 0
        ? "src and dist tool sets match"
        : `Missing in dist: ${missingInDist.join(", ")}`,
  },
  {
    pillar: "dependency_completeness",
    id: "local_python_runtime_deps",
    description: "Current local Python runtime has minimum imports for GRID intelligence tooling.",
    status: boolStatus(dep.missing.length === 0),
    evidence:
      dep.missing.length === 0
        ? "pydantic/httpx/mcp importable"
        : `Missing imports: ${dep.missing.join(", ")}`,
  },
  {
    pillar: "signal_fidelity",
    id: "query_audit_error_filter_pure",
    description: "query_audit(status='error') returns only error rows.",
    status: boolStatus(!queryAuditErrorAlias),
    evidence: queryAuditErrorAlias
      ? "server.ts contains legacy alias that treats failure as error in filter path"
      : "No error/failure alias detected",
  },
  {
    pillar: "signal_fidelity",
    id: "parse_error_accounting",
    description: "Audit query reports parse/corruption counts.",
    status: boolStatus(serverSrc.includes("parseErrors")),
    evidence: serverSrc.includes("parseErrors")
      ? "query_audit returns parseErrors metadata"
      : "No parseErrors accounting found",
  },
];

const byPillar = checks.reduce((acc, c) => {
  acc[c.pillar] ||= { pass: 0, fail: 0 };
  acc[c.pillar][c.status] += 1;
  return acc;
}, {});

const summary = {
  timestamp: new Date().toISOString(),
  checksTotal: checks.length,
  pass: checks.filter((c) => c.status === "pass").length,
  fail: checks.filter((c) => c.status === "fail").length,
  byPillar,
  sourceFiles: {
    srcServer,
    distServer,
    precedentStore,
  },
};

console.log(
  JSON.stringify(
    {
      summary,
      checks,
      details: {
        srcTools,
        distTools,
        missingInDist,
        pythonDeps: dep.rows,
      },
    },
    null,
    2,
  ),
);

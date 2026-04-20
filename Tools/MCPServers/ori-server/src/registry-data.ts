/**
 * Default project registry — seed data for all CascadeProjects test suites.
 *
 * This is the static seed. The living state is persisted at ~/.ori/registry/registry.json
 * and updated after each test run or discovery pass.
 */

import path from "path";
import { getConfig } from "./config.js";
import type { ProjectEntry } from "./types.js";

const config = getConfig();
const CASCADE = config.cascadeRoot;
const HOME = path.resolve(CASCADE, "..");
const CANOPY = process.env.ORI_CANOPY_ROOT?.trim() || path.join(HOME, "canopy");
const ROOTS = process.env.ORI_ROOTS_ROOT?.trim() || path.join(HOME, "roots");
const GROVE = process.env.ORI_GROVE_ROOT?.trim() || path.join(HOME, "grove");
const MCP = `${CASCADE}/Tools/MCPServers`;

export const DEFAULT_PROJECTS: ProjectEntry[] = [
  // ── Core Projects ──
  {
    id: "grid-main",
    name: "GRID-main",
    location: `${CASCADE}/Projects/GRID-main`,
    runner: {
      type: "pytest",
      command: "uv",
      args: [
        "run",
        "pytest",
        "tests/unit",
        "tests/integration",
        "tests/security",
        "tests/api",
        "-q",
        "--tb=short",
      ],
      cwd: `${CASCADE}/Projects/GRID-main`,
      envOverrides: {
        PYTHONPATH: "src",
        MOTHERSHIP_ENVIRONMENT: "test",
        MOTHERSHIP_DATABASE_URL: "sqlite:///:memory:",
        MOTHERSHIP_USE_DATABRICKS: "false",
      },
      timeoutMs: 300000,
    },
    approxTestFiles: 297,
    tags: ["python", "core", "ai-framework", "security", "api"],
    threatModelIds: ["TM-001", "TM-002", "TM-003", "TM-004", "TM-005", "TM-006"],
  },
  {
    id: "echoes",
    name: "canopy/echoes",
    location: `${CANOPY}/echoes`,
    runner: {
      type: "pytest",
      command: "uv",
      args: ["run", "pytest", "tests/", "-v", "--tb=short"],
      cwd: `${CANOPY}/echoes`,
      timeoutMs: 120000,
    },
    approxTestFiles: 35,
    tags: ["python", "audit", "observability", "fastapi"],
    threatModelIds: ["TM-003"],
  },
  {
    id: "afloat",
    name: "canopy/afloat",
    location: `${CANOPY}/afloat`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${CANOPY}/afloat`,
      timeoutMs: 120000,
    },
    approxTestFiles: 33,
    tags: ["typescript", "nextjs", "workflow", "safety"],
    threatModelIds: ["TM-003"],
  },
  {
    id: "dio",
    name: "DIO",
    location: `${CASCADE}/Projects/DIO`,
    runner: {
      type: "pytest",
      command: "uv",
      args: ["run", "pytest"],
      cwd: `${CASCADE}/Projects/DIO`,
      timeoutMs: 60000,
    },
    approxTestFiles: 9,
    tags: ["python", "control-room", "discipline"],
  },

  // ── Shared Components ──
  {
    id: "shared-types",
    name: "shared-types",
    location: `${CASCADE}/Components/shared-types`,
    runner: {
      type: "node-test",
      command: "node",
      args: ["--test", "tests/**/*.test.mjs"],
      cwd: `${CASCADE}/Components/shared-types`,
      timeoutMs: 30000,
    },
    approxTestFiles: 3,
    tags: ["typescript", "shared", "foundation"],
  },
  {
    id: "shared-resilience",
    name: "shared-resilience",
    location: `${CASCADE}/Components/shared-resilience`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${CASCADE}/Components/shared-resilience`,
      timeoutMs: 30000,
    },
    approxTestFiles: 4,
    tags: ["typescript", "shared", "resilience"],
  },
  {
    id: "shared-pipeline",
    name: "shared-pipeline",
    location: `${CASCADE}/Components/shared-pipeline`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${CASCADE}/Components/shared-pipeline`,
      timeoutMs: 30000,
    },
    approxTestFiles: 4,
    tags: ["typescript", "shared", "pipeline"],
  },

  // ── Applications ──
  {
    id: "glimpse-artifact",
    name: "glimpse-artifact",
    location: `${CASCADE}/Applications/glimpse-artifact`,
    runner: {
      type: "node-test",
      command: "node",
      args: ["--import", "tsx", "--test", "tests/*.test.ts"],
      cwd: `${CASCADE}/Applications/glimpse-artifact`,
      timeoutMs: 30000,
    },
    approxTestFiles: 8,
    tags: ["typescript", "react", "ui"],
  },
  {
    id: "glimpse-engine",
    name: "glimpse-engine",
    location: `${CASCADE}/Applications/glimpse-engine`,
    runner: {
      type: "node-test",
      command: "node",
      args: ["--test", "tests/*.test.js", "tests/**/*.test.js"],
      cwd: `${CASCADE}/Applications/glimpse-engine`,
      timeoutMs: 60000,
    },
    approxTestFiles: 12,
    tags: ["javascript", "visualization", "engine"],
  },

  // ── MCP Servers ──
  {
    id: "mcp-afloat-server",
    name: "afloat-server",
    location: `${MCP}/afloat-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/afloat-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "workflow"],
    threatModelIds: ["TM-003"],
  },
  {
    id: "mcp-echoes-server",
    name: "echoes-server",
    location: `${MCP}/echoes-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/echoes-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "audit"],
    threatModelIds: ["TM-003"],
  },
  {
    id: "mcp-grid-server",
    name: "grid-server",
    location: `${MCP}/grid-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/grid-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 2,
    tags: ["typescript", "mcp", "grid"],
    threatModelIds: ["TM-002", "TM-005"],
  },
  {
    id: "mcp-eligibility-server",
    name: "eligibility-server",
    location: `${MCP}/eligibility-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/eligibility-server`,
      timeoutMs: 60000,
    },
    approxTestFiles: 9,
    tags: ["typescript", "mcp", "eligibility", "governance"],
  },
  {
    id: "mcp-glimpse-server",
    name: "glimpse-server",
    location: `${MCP}/glimpse-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/glimpse-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "glimpse"],
  },
  {
    id: "mcp-lots-server",
    name: "lots-server",
    location: `${MCP}/lots-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/lots-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "experiments"],
    threatModelIds: ["TM-006"],
  },
  {
    id: "mcp-maintain-server",
    name: "maintain-server",
    location: `${MCP}/maintain-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/maintain-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "maintenance"],
    threatModelIds: ["TM-006"],
  },
  {
    id: "mcp-mangrove-server",
    name: "mangrove-server",
    location: `${MCP}/mangrove-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/mangrove-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "mangrove"],
  },
  {
    id: "mcp-overview-server",
    name: "overview-server",
    location: `${MCP}/overview-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/overview-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 4,
    tags: ["typescript", "mcp", "overview"],
  },
  {
    id: "mcp-pulse-server",
    name: "pulse-server",
    location: `${MCP}/pulse-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/pulse-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "pulse"],
    threatModelIds: ["TM-003"],
  },
  {
    id: "mcp-seeds-server",
    name: "seeds-server",
    location: `${MCP}/seeds-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/seeds-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "seeds"],
    threatModelIds: ["TM-006"],
  },
  {
    id: "mcp-ori-server",
    name: "ori-server",
    location: `${MCP}/ori-server`,
    runner: {
      type: "vitest",
      command: "npx",
      args: ["vitest", "run"],
      cwd: `${MCP}/ori-server`,
      timeoutMs: 30000,
    },
    approxTestFiles: 1,
    tags: ["typescript", "mcp", "research"],
  },

  // ── Root Projects ──
  {
    id: "apiguard",
    name: "apiguard",
    location: `${CASCADE}/Projects/apiguard`,
    runner: {
      type: "pytest",
      command: "uv",
      args: ["run", "pytest", "tests/"],
      cwd: `${CASCADE}/Projects/apiguard`,
      timeoutMs: 60000,
    },
    approxTestFiles: 9,
    tags: ["python", "api", "security", "gateway"],
  },
  {
    id: "vision",
    name: "Vision",
    location: `${CASCADE}/Projects/Vision`,
    runner: {
      type: "pytest",
      command: "uv",
      args: ["run", "pytest"],
      cwd: `${CASCADE}/Projects/Vision`,
      timeoutMs: 60000,
    },
    approxTestFiles: 7,
    tags: ["python", "ai", "vision", "ocr"],
  },
];

/**
 * Project registry — load, save, query, and discover test suites.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import { DEFAULT_PROJECTS } from "./registry-data.js";
import type { ProjectEntry, ProjectRegistry } from "./types.js";

const SCHEMA_VERSION = "1.0.0";
const config = getConfig();

function registryPath(): string {
  return path.join(config.registryDir, "registry.json");
}

export async function loadRegistry(): Promise<ProjectRegistry> {
  try {
    const raw = await fs.readFile(registryPath(), "utf-8");
    const parsed = JSON.parse(raw) as ProjectRegistry;
    if (parsed.schemaVersion && Array.isArray(parsed.projects)) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is corrupt — seed from defaults
  }

  const registry: ProjectRegistry = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    projects: structuredClone(DEFAULT_PROJECTS),
  };

  await saveRegistry(registry);
  return registry;
}

export async function saveRegistry(registry: ProjectRegistry): Promise<void> {
  await fs.mkdir(config.registryDir, { recursive: true });
  registry.updatedAt = new Date().toISOString();
  const tmpPath = registryPath() + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2), "utf-8");
  await fs.rename(tmpPath, registryPath());
}

export async function getProject(id: string): Promise<ProjectEntry | null> {
  const registry = await loadRegistry();
  return registry.projects.find((p) => p.id === id) ?? null;
}

export async function listProjects(filter?: {
  tags?: string[];
  healthStatus?: string;
}): Promise<ProjectEntry[]> {
  const registry = await loadRegistry();
  let projects = registry.projects;

  if (filter?.tags && filter.tags.length > 0) {
    const tagSet = new Set(filter.tags);
    projects = projects.filter((p) => p.tags.some((t) => tagSet.has(t)));
  }

  if (filter?.healthStatus) {
    projects = projects.filter((p) => p.healthStatus === filter.healthStatus);
  }

  return projects;
}

export async function updateProjectHealth(
  id: string,
  update: Partial<Pick<ProjectEntry, "healthStatus" | "lastRunTimestamp" | "lastRunSummary">>,
): Promise<boolean> {
  const registry = await loadRegistry();
  const project = registry.projects.find((p) => p.id === id);
  if (!project) return false;

  if (update.healthStatus !== undefined) project.healthStatus = update.healthStatus;
  if (update.lastRunTimestamp !== undefined) project.lastRunTimestamp = update.lastRunTimestamp;
  if (update.lastRunSummary !== undefined) project.lastRunSummary = update.lastRunSummary;

  await saveRegistry(registry);
  return true;
}

export async function discoverTestSuites(id: string): Promise<{
  found: boolean;
  testFiles: number;
  details: string;
}> {
  const registry = await loadRegistry();
  const project = registry.projects.find((p) => p.id === id);
  if (!project) {
    return { found: false, testFiles: 0, details: `Project "${id}" not found in registry` };
  }

  // Verify the project directory exists
  try {
    await fs.access(project.location);
  } catch {
    return {
      found: false,
      testFiles: 0,
      details: `Project directory does not exist: ${project.location}`,
    };
  }

  // Count test files based on runner type
  let testFiles = 0;
  const testDirs: string[] = [];

  try {
    if (project.runner.type === "pytest") {
      // Look for tests/ directory and count .py test files
      const testsDir = path.join(project.runner.cwd, "tests");
      testFiles = await countFilesRecursive(testsDir, /^test_.*\.py$|.*_test\.py$/);
      if (testFiles > 0) testDirs.push(testsDir);
    } else if (project.runner.type === "vitest") {
      // Look for tests/ directory and count .test.ts files
      const testsDir = path.join(project.runner.cwd, "tests");
      testFiles = await countFilesRecursive(testsDir, /\.test\.ts$/);
      if (testFiles > 0) testDirs.push(testsDir);
    } else if (project.runner.type === "node-test") {
      // Look for tests/ directory and count .test.* files
      const testsDir = path.join(project.runner.cwd, "tests");
      testFiles = await countFilesRecursive(testsDir, /\.test\.(ts|js|mjs)$/);
      if (testFiles > 0) testDirs.push(testsDir);
    }
  } catch {
    // Test directory doesn't exist or can't be read
  }

  // Update the registry with discovered count
  project.approxTestFiles = testFiles;
  await saveRegistry(registry);

  return {
    found: true,
    testFiles,
    details: testFiles > 0
      ? `Found ${testFiles} test file(s) in ${testDirs.join(", ")}`
      : `No test files found in ${project.runner.cwd}`,
  };
}

async function countFilesRecursive(dir: string, pattern: RegExp): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await countFilesRecursive(path.join(dir, entry.name), pattern);
      } else if (pattern.test(entry.name)) {
        count++;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return count;
}

/**
 * Data layer — NDJSON log persistence and directory management.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import type { LogEntry } from "./types.js";

const config = getConfig();

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(config.logDir, { recursive: true });
  await fs.mkdir(config.probeDir, { recursive: true });
  await fs.mkdir(config.recommendationsDir, { recursive: true });
  await fs.mkdir(config.registryDir, { recursive: true });
  await fs.mkdir(config.runsDir, { recursive: true });
  await fs.mkdir(config.reportsDir, { recursive: true });
  await fs.mkdir(config.threatModelDir, { recursive: true });
  await fs.mkdir(config.notebookDir, { recursive: true });
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayLogFile(): string {
  return path.join(config.logDir, `${todayKey()}.ndjson`);
}

export async function appendLogEntries(entries: LogEntry[]): Promise<void> {
  const filepath = todayLogFile();
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await fs.appendFile(filepath, lines, "utf-8");
}

export async function readTodayLogs(): Promise<LogEntry[]> {
  const filepath = todayLogFile();
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as LogEntry[];
  } catch {
    return [];
  }
}

export async function readAllLogs(): Promise<LogEntry[]> {
  try {
    const files = await fs.readdir(config.logDir);
    const all: LogEntry[] = [];
    for (const file of files.filter((f) => f.endsWith(".ndjson")).sort()) {
      const content = await fs.readFile(path.join(config.logDir, file), "utf-8");
      for (const line of content.trim().split("\n").filter(Boolean)) {
        try {
          all.push(JSON.parse(line) as LogEntry);
        } catch {
          /* skip corrupt */
        }
      }
    }
    return all;
  } catch {
    return [];
  }
}

export async function clearAllLogs(): Promise<void> {
  try {
    const files = await fs.readdir(config.logDir);
    for (const file of files.filter((f) => f.endsWith(".ndjson"))) {
      await fs.unlink(path.join(config.logDir, file));
    }
  } catch {
    /* dir may not exist */
  }
}

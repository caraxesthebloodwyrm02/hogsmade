/**
 * Structured NDJSON logger for MCP servers.
 *
 * Writes structured log entries to ~/.echoes/mcp-logs/{server}.ndjson
 * while also emitting to stderr for stdio transport compatibility.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".echoes", "mcp-logs");

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  server: string;
  message: string;
  [key: string]: unknown;
}

export class McpLogger {
  private readonly logPath: string;
  private dirReady = false;

  constructor(private readonly serverName: string) {
    this.logPath = join(LOG_DIR, `${serverName}.ndjson`);
  }

  private ensureDir(): void {
    if (!this.dirReady) {
      try {
        mkdirSync(LOG_DIR, { recursive: true });
      } catch {
        // Directory may already exist
      }
      this.dirReady = true;
    }
  }

  private write(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      server: this.serverName,
      message,
      ...extra,
    };
    const line = JSON.stringify(entry);

    // Always write to stderr (MCP-safe)
    process.stderr.write(`[${this.serverName}] ${level.toUpperCase()}: ${message}\n`);

    // Also persist to NDJSON file
    try {
      this.ensureDir();
      appendFileSync(this.logPath, line + "\n", "utf-8");
    } catch {
      // Logging should never throw
    }
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.write("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.write("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.write("warn", message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.write("error", message, extra);
  }
}

/**
 * Precedent Store — File-based persistence for enforcement precedents.
 *
 * Follows the EvolutionCycleStore pattern from eligibility-server:
 * JSON file with in-memory cache, sync read/write.
 *
 * Storage: <configured-dir>/precedent-store.json
 */

import { generateId } from "@cascade/shared-types/id";
import type {
  EscalationLevel,
  PrecedentFingerprint,
  PrecedentOccurrence,
  PrecedentRecord,
  PrecedentResolution,
} from "@cascade/shared-types/precedent";
import {
  ARCHIVE_THRESHOLD_MS,
  MAX_OCCURRENCES_PER_RECORD,
  fingerprintKey,
} from "@cascade/shared-types/precedent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface PrecedentStoreData {
  schemaVersion: string;
  precedents: PrecedentRecord[];
}

export class PrecedentStore {
  private cache: PrecedentStoreData | null = null;
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "precedent-store.json");
  }

  private ensureLoaded(): PrecedentStoreData {
    if (this.cache) return this.cache;

    const directory = path.dirname(this.filePath);
    mkdirSync(directory, { recursive: true });

    if (!existsSync(this.filePath)) {
      this.cache = { schemaVersion: "1.0.0", precedents: [] };
      writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
      return this.cache;
    }

    const raw = readFileSync(this.filePath, "utf8");
    this.cache = raw.trim()
      ? (JSON.parse(raw) as PrecedentStoreData)
      : { schemaVersion: "1.0.0", precedents: [] };
    this.cache.precedents ||= [];
    return this.cache;
  }

  private save(): void {
    if (!this.cache) return;
    const directory = path.dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
  }

  findByFingerprint(fp: PrecedentFingerprint): PrecedentRecord | undefined {
    const key = fingerprintKey(fp);
    return this.ensureLoaded().precedents.find((r) => r.fingerprintKey === key);
  }

  findById(id: string): PrecedentRecord | undefined {
    return this.ensureLoaded().precedents.find((r) => r.id === id);
  }

  upsert(
    fp: PrecedentFingerprint,
    level: EscalationLevel,
    occurrence: PrecedentOccurrence,
  ): PrecedentRecord {
    const data = this.ensureLoaded();
    const key = fingerprintKey(fp);
    const existing = data.precedents.find((r) => r.fingerprintKey === key);

    if (existing) {
      existing.lastSeen = occurrence.timestamp;
      existing.occurrenceCount += 1;
      existing.escalationLevel = level;
      existing.consecutiveSuccesses = 0;
      existing.occurrences.push(occurrence);
      if (existing.occurrences.length > MAX_OCCURRENCES_PER_RECORD) {
        existing.occurrences = existing.occurrences.slice(-MAX_OCCURRENCES_PER_RECORD);
      }
      this.save();
      return existing;
    }

    const record: PrecedentRecord = {
      id: generateId("prec"),
      fingerprint: fp,
      fingerprintKey: key,
      firstSeen: occurrence.timestamp,
      lastSeen: occurrence.timestamp,
      occurrenceCount: 1,
      escalationLevel: level,
      occurrences: [occurrence],
      resolution: null,
      consecutiveSuccesses: 0,
    };
    data.precedents.push(record);
    this.save();
    return record;
  }

  resolve(id: string, resolution: PrecedentResolution): PrecedentRecord | undefined {
    const data = this.ensureLoaded();
    const record = data.precedents.find((r) => r.id === id);
    if (!record) return undefined;

    record.resolution = resolution;
    record.escalationLevel = "observed";
    this.save();
    return record;
  }

  recordSuccess(source: string, tool: string): void {
    const data = this.ensureLoaded();
    let changed = false;
    for (const record of data.precedents) {
      if (record.fingerprint.source === source && record.fingerprint.tool === tool) {
        record.consecutiveSuccesses += 1;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  listActive(limit = 50): PrecedentRecord[] {
    return this.ensureLoaded()
      .precedents.filter((r) => r.resolution === null || this.isInCooldown(r))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, limit);
  }

  listByLevel(level: EscalationLevel): PrecedentRecord[] {
    return this.ensureLoaded()
      .precedents.filter((r) => r.escalationLevel === level)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  /**
   * Prune resolved precedents older than ARCHIVE_THRESHOLD_MS.
   * Returns the number of records removed.
   */
  prune(): number {
    const data = this.ensureLoaded();
    const now = Date.now();
    const before = data.precedents.length;
    data.precedents = data.precedents.filter((r) => {
      if (!r.resolution) return true;
      const resolvedAge = now - new Date(r.resolution.resolvedAt).getTime();
      const lastSeenAge = now - new Date(r.lastSeen).getTime();
      return resolvedAge < ARCHIVE_THRESHOLD_MS || lastSeenAge < ARCHIVE_THRESHOLD_MS;
    });
    const removed = before - data.precedents.length;
    if (removed > 0) this.save();
    return removed;
  }

  private isInCooldown(record: PrecedentRecord): boolean {
    if (!record.resolution?.cooldownUntil) return false;
    return new Date(record.resolution.cooldownUntil).getTime() > Date.now();
  }

  /** Reload from disk (used after external changes or for testing) */
  reload(): void {
    this.cache = null;
  }

  get storePath(): string {
    return this.filePath;
  }
}

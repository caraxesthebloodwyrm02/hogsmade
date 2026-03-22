/**
 * Pulse Server — Developer Dashboard & Session Journal MCP Server
 *
 * A "meta-server" that helps you start your day, track your sessions,
 * and get an aggregated view across the entire MCP ecosystem:
 *
 * - Morning briefing: what changed overnight, what needs attention
 * - Session journal: log what you worked on, decisions made, blockers hit
 * - Focus timer: track deep work blocks with context
 * - Cross-server status aggregation (reads from other servers' data)
 * - Daily/weekly digest generation
 *
 * Example usage scenario:
 *   You sit down at your desk. You ask Cascade:
 *     "Use morning_briefing"
 *   Pulse scans your ecosystem, checks recent audit entries, workflow history,
 *   experiment results, and repo health — then gives you a prioritized summary.
 *
 *   During the day you say:
 *     "Use journal_add with entry='Fixed GRID auth bug, updated tests'"
 *   At end of day:
 *     "Use daily_digest"
 *   And get a formatted summary of everything you accomplished.
 *
 * Follows the same patterns as echoes-server, grid-server, etc.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import * as z from "zod";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "pulse-server";
const VERSION = "1.0.0";
const config = getConfig();
const DATA_DIR = config.dataDir;
const JOURNAL_DIR = config.journalDir;
const FOCUS_DIR = config.focusDir;
const DIGESTS_DIR = config.digestsDir;

// Paths to other servers' data (read-only aggregation)
const ECHOES_AUDIT = config.echoesAuditPath;
const ECHOES_TELEMETRY = config.echoesTelemetryDir;
const AFLOAT_WORKFLOWS = config.afloatWorkflowsDir;
const AFLOAT_HISTORY = config.afloatHistoryDir;
const SEEDS_SNAPSHOTS = config.seedsSnapshotsDir;

// Canonical names for legacy repos found in older snapshots/audit metadata.
const LEGACY_REPO_NAME_ALIASES: Record<string, string> = {
  "grid-main": "GRID",
  grid_main: "GRID",
};

// ── Types ──

interface JournalEntry {
  id: string;
  timestamp: string;
  entry: string;
  tags: string[];
  mood?: "focused" | "scattered" | "blocked" | "flow";
  linkedServer?: string;
}

interface FocusSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  task: string;
  project?: string;
  durationMinutes?: number;
  interruptions: number;
  outcome?: string;
}

interface DailyDigest {
  date: string;
  generatedAt: string;
  journalEntries: number;
  focusSessions: number;
  totalFocusMinutes: number;
  auditEvents: number;
  workflowsRun: number;
  ecosystemScore?: number;
  highlights: string[];
  blockers: string[];
  tomorrowSuggestions: string[];
}

interface Preferences {
  skippedBriefingSections: string[];
  promotedSignals: string[];
}

const BRIEFING_SECTION_KEYS = [
  "ecosystem",
  "overnightActivity",
  "correlations",
  "currentState",
  "warnings",
  "priorities",
] as const;
type BriefingSectionKey = (typeof BRIEFING_SECTION_KEYS)[number];

function applyPromotedOrder<T extends string>(
  items: T[],
  promotedSignals: string[],
): T[] {
  if (promotedSignals.length === 0) return items;
  const promoted = items.filter((item) =>
    promotedSignals.some((sig) =>
      item.toLowerCase().includes(sig.toLowerCase()),
    ),
  );
  const rest = items.filter(
    (item) =>
      !promotedSignals.some((sig) =>
        item.toLowerCase().includes(sig.toLowerCase()),
      ),
  );
  return [...promoted, ...rest];
}

// ── Data Layer ──

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(JOURNAL_DIR, { recursive: true });
  await fs.mkdir(FOCUS_DIR, { recursive: true });
  await fs.mkdir(DIGESTS_DIR, { recursive: true });
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getTodayJournal(): Promise<JournalEntry[]> {
  const filepath = path.join(JOURNAL_DIR, `${todayKey()}.json`);
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as JournalEntry[];
  } catch {
    return [];
  }
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

/** Max audit file size guard (100MB) */
const MAX_AUDIT_FILE_BYTES = 100 * 1024 * 1024;

async function saveTodayJournal(entries: JournalEntry[]): Promise<void> {
  const filepath = path.join(JOURNAL_DIR, `${todayKey()}.json`);
  await atomicWriteJson(filepath, entries);
}

async function getActiveFocus(): Promise<FocusSession | null> {
  const filepath = path.join(FOCUS_DIR, "active.json");
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as FocusSession;
  } catch {
    return null;
  }
}

async function saveActiveFocus(session: FocusSession | null): Promise<void> {
  const filepath = path.join(FOCUS_DIR, "active.json");
  if (session === null) {
    try {
      await fs.unlink(filepath);
    } catch {
      /* no active session */
    }
  } else {
    await atomicWriteJson(filepath, session);
  }
}

async function archiveFocusSession(session: FocusSession): Promise<void> {
  const filepath = path.join(FOCUS_DIR, `${todayKey()}.json`);
  let sessions: FocusSession[] = [];
  try {
    const content = await fs.readFile(filepath, "utf-8");
    sessions = JSON.parse(content) as FocusSession[];
  } catch {
    /* new file */
  }
  sessions.push(session);
  await atomicWriteJson(filepath, sessions);
}

async function loadPreferences(): Promise<Preferences> {
  try {
    const content = await fs.readFile(config.preferencesPath, "utf-8");
    return JSON.parse(content) as Preferences;
  } catch {
    return {
      skippedBriefingSections: [],
      promotedSignals: [],
    };
  }
}

async function savePreferences(preferences: Preferences): Promise<void> {
  await atomicWriteJson(config.preferencesPath, preferences);
}

// ── Cross-Server Aggregation (read-only) ──

async function readRecentAuditEntries(limit: number): Promise<unknown[]> {
  try {
    // File size guard — prevent loading huge audit files into memory
    const stat = await fs.stat(ECHOES_AUDIT);
    if (stat.size > MAX_AUDIT_FILE_BYTES) {
      console.error(`[${SERVER_NAME}] Audit log too large (${Math.round(stat.size / (1024 * 1024))}MB) — skipping`);
      return [];
    }
    const content = await fs.readFile(ECHOES_AUDIT, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function countRecentWorkflows(): Promise<number> {
  try {
    const files = await fs.readdir(AFLOAT_HISTORY);
    const today = todayKey();
    let count = 0;
    for (const file of files.filter((f: string) => f.endsWith(".json"))) {
      try {
        const content = await fs.readFile(
          path.join(AFLOAT_HISTORY, file),
          "utf-8",
        );
        const exec = JSON.parse(content);
        if (exec.startedAt?.startsWith(today)) count++;
      } catch {
        /* skip */
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function getLatestTelemetry(): Promise<unknown | null> {
  try {
    const files = await fs.readdir(ECHOES_TELEMETRY);
    const latest = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()[0];
    if (!latest) return null;
    const content = await fs.readFile(
      path.join(ECHOES_TELEMETRY, latest),
      "utf-8",
    );
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hoursSince(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
}

function isFailureStatus(status?: string): boolean {
  return status === "failure" || status === "blocked" || status === "error";
}

type SnapshotMetadata = {
  sourceFile: string | null;
  snapshotTimestamp: string | null;
  normalizedRepoNames: Record<string, string>;
  deduplicatedEntries: number;
};

type SeedsSnapshotResult = {
  snapshot: Record<string, any> | null;
  metadata: SnapshotMetadata;
};

type SnapshotCandidate = {
  file: string;
  snapshot: Record<string, any>;
  sortTimestampMs: number;
};

function defaultSnapshotMetadata(): SnapshotMetadata {
  return {
    sourceFile: null,
    snapshotTimestamp: null,
    normalizedRepoNames: {},
    deduplicatedEntries: 0,
  };
}

function canonicalRepoName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const alias = LEGACY_REPO_NAME_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

function scoreRepoEntry(repo: Record<string, any>): number {
  let score = 0;
  if (repo.exists === true) score += 1000;
  if (repo.hasGit === true) score += 200;
  if (repo.hasDependencyFile === true) score += 100;
  if (repo.hasTests === true) score += 100;
  if (typeof repo.healthScore === "number") score += repo.healthScore;
  if (Array.isArray(repo.issues)) score -= repo.issues.length * 5;
  return score;
}

function normalizeSeedsSnapshot(
  snapshot: Record<string, any>,
): {
  snapshot: Record<string, any>;
  metadata: Pick<
    SnapshotMetadata,
    "normalizedRepoNames" | "deduplicatedEntries" | "snapshotTimestamp"
  >;
} {
  const repos = Array.isArray(snapshot.repos)
    ? (snapshot.repos as Record<string, any>[])
    : [];
  const normalizedRepoNames: Record<string, string> = {};
  let deduplicatedEntries = 0;

  const canonicalRepos = new Map<string, Record<string, any>>();

  for (const rawRepo of repos) {
    if (!rawRepo || typeof rawRepo !== "object") continue;
    const originalName =
      typeof rawRepo.name === "string" ? rawRepo.name.trim() : "";
    const canonicalName = originalName
      ? canonicalRepoName(originalName)
      : originalName;
    const normalizedRepo =
      canonicalName && canonicalName !== originalName
        ? { ...rawRepo, name: canonicalName }
        : rawRepo;

    if (canonicalName && canonicalName !== originalName) {
      normalizedRepoNames[originalName] = canonicalName;
    }

    const key = canonicalName || originalName;
    if (!key) continue;

    const current = canonicalRepos.get(key);
    if (!current) {
      canonicalRepos.set(key, normalizedRepo);
      continue;
    }

    const keepNew = scoreRepoEntry(normalizedRepo) > scoreRepoEntry(current);
    canonicalRepos.set(key, keepNew ? normalizedRepo : current);
    deduplicatedEntries += 1;
  }

  const normalizedRepos = [...canonicalRepos.values()];
  const existingRepos = normalizedRepos.filter((repo) => repo.exists === true);
  const overallScore =
    existingRepos.length > 0
      ? Math.round(
          existingRepos.reduce(
            (sum, repo) => sum + (repo.healthScore ?? 0),
            0,
          ) / existingRepos.length,
        )
      : 0;
  const activeCount = existingRepos.filter(
    (repo) => (repo.healthScore ?? 0) >= 60,
  ).length;
  const staleCount = existingRepos.filter(
    (repo) => (repo.healthScore ?? 0) < 40,
  ).length;
  const issueCount = normalizedRepos.reduce(
    (sum, repo) => sum + (Array.isArray(repo.issues) ? repo.issues.length : 0),
    0,
  );

  const normalizedSnapshot: Record<string, any> = {
    ...snapshot,
    repos: normalizedRepos,
    overallScore,
    activeCount,
    staleCount,
    issueCount,
  };

  return {
    snapshot: normalizedSnapshot,
    metadata: {
      normalizedRepoNames,
      deduplicatedEntries,
      snapshotTimestamp:
        typeof normalizedSnapshot.timestamp === "string"
          ? normalizedSnapshot.timestamp
          : null,
    },
  };
}

async function buildSnapshotCandidate(
  file: string,
): Promise<SnapshotCandidate | null> {
  try {
    const content = await fs.readFile(path.join(SEEDS_SNAPSHOTS, file), "utf-8");
    const snapshot = JSON.parse(content) as Record<string, any>;

    let sortTimestampMs: number | null = null;
    if (typeof snapshot.timestamp === "string") {
      const parsed = Date.parse(snapshot.timestamp);
      if (Number.isFinite(parsed)) sortTimestampMs = parsed;
    }
    if (sortTimestampMs === null) {
      const stat = await fs.stat(path.join(SEEDS_SNAPSHOTS, file));
      sortTimestampMs = stat.mtimeMs;
    }

    return {
      file,
      snapshot,
      sortTimestampMs,
    };
  } catch {
    return null;
  }
}

async function getLatestSeedsSnapshot(): Promise<SeedsSnapshotResult> {
  const metadata = defaultSnapshotMetadata();
  try {
    const files = await fs.readdir(SEEDS_SNAPSHOTS);
    const candidates: SnapshotCandidate[] = [];

    for (const file of files.filter((f: string) => f.endsWith(".json"))) {
      const candidate = await buildSnapshotCandidate(file);
      if (candidate) candidates.push(candidate);
    }

    if (candidates.length === 0) {
      return { snapshot: null, metadata };
    }

    candidates.sort((a, b) => b.sortTimestampMs - a.sortTimestampMs);
    const latest = candidates[0];
    const normalized = normalizeSeedsSnapshot(latest.snapshot);

    return {
      snapshot: normalized.snapshot,
      metadata: {
        sourceFile: latest.file,
        snapshotTimestamp: normalized.metadata.snapshotTimestamp,
        normalizedRepoNames: normalized.metadata.normalizedRepoNames,
        deduplicatedEntries: normalized.metadata.deduplicatedEntries,
      },
    };
  } catch {
    return { snapshot: null, metadata };
  }
}

async function getLatestEcosystemScore(): Promise<number | null> {
  const latest = await getLatestSeedsSnapshot();
  return latest.snapshot?.overallScore ?? null;
}

async function listRecentWorkflowExecutions(
  limit: number,
): Promise<Record<string, any>[]> {
  try {
    const files = (await fs.readdir(AFLOAT_HISTORY))
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);

    const executions: Record<string, any>[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(
          path.join(AFLOAT_HISTORY, file),
          "utf-8",
        );
        executions.push(JSON.parse(content) as Record<string, any>);
      } catch {
        /* skip corrupt */
      }
    }

    return executions;
  } catch {
    return [];
  }
}

function getLowHealthRepos(
  snapshot: Record<string, any> | null,
  threshold = 70,
): Array<Record<string, any>> {
  if (!snapshot || !Array.isArray(snapshot.repos)) return [];
  return snapshot.repos.filter(
    (repo: Record<string, any>) => (repo.healthScore ?? 0) < threshold,
  );
}

function inferRelatedRepo(
  event: Record<string, any>,
  repoNames: string[],
): string | null {
  const canonicalRepoNames = repoNames.map(canonicalRepoName);
  const metadata =
    event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};

  if (
    typeof metadata.relatedRepo === "string" &&
    metadata.relatedRepo.length > 0
  ) {
    const canonical = canonicalRepoName(metadata.relatedRepo);
    return canonicalRepoNames.includes(canonical)
      ? canonical
      : metadata.relatedRepo;
  }

  const haystacks = [
    typeof metadata.name === "string" ? metadata.name : "",
    typeof event.tool === "string" ? event.tool : "",
    typeof event.source === "string" ? event.source : "",
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase()) as string[];

  for (let i = 0; i < repoNames.length; i++) {
    const repoName = repoNames[i];
    const canonicalName = canonicalRepoNames[i];
    const repoNameLower = repoName.toLowerCase();
    const canonicalLower = canonicalName.toLowerCase();
    if (
      haystacks.some(
        (value) => value.includes(repoNameLower) || value.includes(canonicalLower),
      )
    ) {
      return canonicalName;
    }
  }

  return null;
}

function formatRepoIssue(repo: Record<string, any>): string {
  const issues = Array.isArray(repo.issues)
    ? repo.issues.slice(0, 2).join(", ")
    : "health degradation detected";
  return `${repo.name} (${repo.healthScore ?? "?"}/100): ${issues}`;
}

interface PriorityRules {
  failureWeight: number;
  healthThreshold: number;
  timeDecayHours: number;
  maxAgeHours: number;
  correlationBoost: number;
  workflowFailureWeight: number;
  unfinishedFocusPenalty: number;
  staleItemBoost: number;
  minStaleHours: number;
}

const DEFAULT_RULES: PriorityRules = {
  failureWeight: 10,
  healthThreshold: 70,
  timeDecayHours: 24,
  maxAgeHours: 72,
  correlationBoost: 15,
  workflowFailureWeight: 8,
  unfinishedFocusPenalty: 5,
  staleItemBoost: 3,
  minStaleHours: 48,
};

interface ScoredItem {
  score: number;
  priority: "high" | "medium" | "low";
  title: string;
  reasoning: string[];
  source: string;
  firstSeen: string;
  occurrenceCount: number;
}

function calculateTimeDecay(hoursAgo: number, decayHours: number): number {
  if (hoursAgo <= 0) return 1;
  return Math.max(0.2, 1 - hoursAgo / decayHours);
}

function groupFailuresBySource(
  failures: Array<Record<string, any>>,
): Map<string, Array<Record<string, any>>> {
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const failure of failures) {
    const source = failure.source ?? "unknown";
    const tool = failure.tool ?? "unknown";
    const key = `${source}:${tool}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(failure);
  }
  return groups;
}

function getJournalContext(journal: JournalEntry[]): {
  workedOn: Set<string>;
  blockedTags: Set<string>;
  urgentMentions: boolean;
} {
  const workedOn = new Set<string>();
  const blockedTags = new Set<string>();
  let urgentMentions = false;

  for (const entry of journal) {
    // Extract project/server mentions from entry text
    const serverMentions = entry.entry.match(
      /\b(grid|seeds|maintain|lots|echoes|afloat|pulse)[-\s]?server\b/gi,
    );
    if (serverMentions) {
      for (const m of serverMentions)
        workedOn.add(m.toLowerCase().replace(/\s/g, ""));
    }

    // Track blocked mood entries
    if (entry.mood === "blocked" && entry.linkedServer) {
      blockedTags.add(entry.linkedServer.toLowerCase());
    }

    // Check for urgency keywords
    if (/\b(urgent|asap|critical|blocking|deadline)\b/i.test(entry.entry)) {
      urgentMentions = true;
    }
  }

  return { workedOn, blockedTags, urgentMentions };
}

function scoreAndRankItems(
  recentFailures: Array<Record<string, any>>,
  lowHealthRepos: Array<Record<string, any>>,
  failedWorkflows: Array<Record<string, any>>,
  activeFocus: FocusSession | null,
  journal: JournalEntry[],
  rules: PriorityRules = DEFAULT_RULES,
  allAuditEntries?: Array<Record<string, any>>,
  ecosystemScore?: number | null,
): ScoredItem[] {
  const items: ScoredItem[] = [];
  const now = Date.now();
  const journalContext = getJournalContext(journal);

  // Group failures by source for frequency escalation
  const failureGroups = groupFailuresBySource(recentFailures);
  const repoNames = lowHealthRepos
    .map((r) => r.name)
    .filter(Boolean) as string[];

  // Track which repos are already mentioned via correlated failures
  // (explicit tracking instead of fragile title-parsing)
  const correlatedRepoNames = new Set<string>();

  // 1. Correlated failures + low health (highest priority)
  for (const [key, group] of failureGroups) {
    const latest = group[0];
    const age = hoursSince(latest.timestamp) ?? 0;
    const relatedRepo = inferRelatedRepo(latest, repoNames);

    const repo = relatedRepo
      ? lowHealthRepos.find((r) => r.name === relatedRepo)
      : null;

    // Unlinked failures or failures not matching a low-health repo → medium priority
    if (!relatedRepo || !repo) {
      const timeDecay = calculateTimeDecay(age, rules.timeDecayHours);
      const score = rules.failureWeight * 0.6 * timeDecay;
      items.push({
        score,
        priority: "medium",
        title: `${latest.source ?? "unknown"} ${latest.tool ?? "tool"} failure${relatedRepo ? ` (${relatedRepo})` : ""}`,
        reasoning: [
          `Recent status: ${latest.status ?? "unknown"}`,
          group.length > 1 ? `${group.length} occurrences` : "",
        ].filter(Boolean),
        source: key,
        firstSeen: group[group.length - 1].timestamp,
        occurrenceCount: group.length,
      });
      continue;
    }

    // Track this repo as correlated so we don't duplicate it in section 2
    correlatedRepoNames.add(relatedRepo);

    const frequencyBonus = Math.min(group.length * 3, 15); // Cap at +15
    const timeDecay = calculateTimeDecay(age, rules.timeDecayHours);
    const correlationBonus = rules.correlationBoost;

    let score =
      (rules.failureWeight + frequencyBonus + correlationBonus) * timeDecay;

    // Boost if user mentioned being blocked on this in journal
    if (journalContext.blockedTags.has(relatedRepo.toLowerCase())) {
      score += 10;
    }

    items.push({
      score,
      priority: score >= 20 ? "high" : "medium",
      title: `${latest.source ?? "unknown"} ${latest.tool ?? "tool"} failure linked to ${relatedRepo}`,
      reasoning: [
        `Recent status: ${latest.status ?? "unknown"}`,
        formatRepoIssue(repo),
        group.length > 1 ? `${group.length} occurrences (escalated)` : "",
        journalContext.blockedTags.has(relatedRepo.toLowerCase())
          ? "You reported being blocked on this"
          : "",
      ].filter(Boolean),
      source: key,
      firstSeen: group[group.length - 1].timestamp,
      occurrenceCount: group.length,
    });
  }

  // 2. Uncorrelated low-health repos (medium priority)
  for (const repo of lowHealthRepos) {
    if (correlatedRepoNames.has(repo.name)) continue;

    const score = rules.failureWeight * 0.5; // Lower base score
    items.push({
      score,
      priority: "medium",
      title: `Repo health below threshold: ${repo.name}`,
      reasoning: [formatRepoIssue(repo)],
      source: `repo:${repo.name}`,
      firstSeen: repo.lastUpdated ?? new Date().toISOString(),
      occurrenceCount: 1,
    });
  }

  // 3. Scheduler diagnostics follow-up (uses existing audit data)
  if (allAuditEntries) {
    const schedulerEvent = allAuditEntries.find(
      (e) =>
        e.source === "afloat-scheduler" &&
        e.tool === "scheduled_diagnostics" &&
        (hoursSince(e.timestamp) ?? Infinity) <= 24,
    );
    if (schedulerEvent) {
      const meta =
        schedulerEvent.metadata && typeof schedulerEvent.metadata === "object"
          ? (schedulerEvent.metadata as Record<string, unknown>)
          : undefined;
      const followUp =
        meta?.followUp && typeof meta.followUp === "object"
          ? (meta.followUp as Record<string, unknown>)
          : undefined;
      const diagAge = hoursSince(schedulerEvent.timestamp) ?? 0;
      const timeDecay = calculateTimeDecay(diagAge, rules.timeDecayHours);

      if (followUp?.triggered) {
        const reasoning: string[] = [];
        if (typeof meta?.overallScore === "number")
          reasoning.push(`Diagnostic score: ${meta.overallScore}/100`);
        if (followUp.recommendation)
          reasoning.push(String(followUp.recommendation));
        if (typeof followUp.totalReclaimableMB === "number")
          reasoning.push(`Reclaimable: ${followUp.totalReclaimableMB} MB`);

        // Score below health threshold → medium, otherwise low (informational)
        const diagScore =
          typeof meta?.overallScore === "number" ? meta.overallScore : null;
        const isBelowThreshold =
          diagScore !== null && diagScore < rules.healthThreshold;
        const baseScore = isBelowThreshold
          ? rules.failureWeight * 0.7
          : rules.failureWeight * 0.3;

        items.push({
          score: baseScore * timeDecay,
          priority: isBelowThreshold ? "medium" : "low",
          title: isBelowThreshold
            ? "Scheduled diagnostics: workspace health below threshold"
            : "Scheduled diagnostics suggested cleanup",
          reasoning,
          source: "scheduler:diagnostics",
          firstSeen: schedulerEvent.timestamp ?? new Date().toISOString(),
          occurrenceCount: 1,
        });
      }
    }
  }

  // 4. Ecosystem-wide health signal (when overall score is critically low)
  if (typeof ecosystemScore === "number" && ecosystemScore < 50) {
    items.push({
      score: rules.failureWeight * 0.6,
      priority: "medium",
      title: `Ecosystem health critically low: ${ecosystemScore}/100`,
      reasoning: [
        `Overall score ${ecosystemScore}/100 is well below threshold`,
        "Run ecosystem_scan to identify root causes across all repos",
      ],
      source: "ecosystem:overall",
      firstSeen: new Date().toISOString(),
      occurrenceCount: 1,
    });
  }

  // 5. Failed workflows with time decay
  for (const workflow of failedWorkflows) {
    const age = hoursSince(workflow.startedAt) ?? 0;
    const timeDecay = calculateTimeDecay(age, rules.timeDecayHours);
    const score = rules.workflowFailureWeight * timeDecay;

    // Boost stale workflows (sitting failed for >48h)
    const isStale = age > rules.minStaleHours;

    items.push({
      score: isStale ? score + rules.staleItemBoost : score,
      priority: isStale ? "high" : "medium",
      title: `Workflow needs review: ${workflow.workflowId ?? workflow.executionId ?? "unknown"}`,
      reasoning: [
        `Status: ${workflow.status ?? "unknown"}`,
        `Started: ${workflow.startedAt ?? "unknown"}`,
        isStale ? `Stale: ${Math.round(age)}h since failure` : "",
      ].filter(Boolean),
      source: `workflow:${workflow.workflowId ?? workflow.executionId}`,
      firstSeen: workflow.startedAt,
      occurrenceCount: 1,
    });
  }

  // 6. Unfinished focus session (penalty-based priority)
  if (activeFocus) {
    const hoursRunning =
      (now - new Date(activeFocus.startedAt).getTime()) / (1000 * 60 * 60);
    const isStale = hoursRunning > 4;

    items.push({
      score: rules.unfinishedFocusPenalty + (isStale ? 10 : 0),
      priority: isStale ? "high" : "medium",
      title: `Resolve unfinished focus session: ${activeFocus.task}`,
      reasoning: [
        `Started at ${activeFocus.startedAt}`,
        isStale
          ? `Running for ${Math.round(hoursRunning)}h — may indicate blocker`
          : "",
        activeFocus.interruptions > 0
          ? `${activeFocus.interruptions} interruptions recorded`
          : "",
      ].filter(Boolean),
      source: "focus:unfinished",
      firstSeen: activeFocus.startedAt,
      occurrenceCount: 1,
    });
  }

  // Sort by score descending, then by firstSeen ascending (older first)
  return items
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime();
    })
    .slice(0, 5);
}

function getRecentScheduledDiagnosticsFollowUp(
  recentAudit: Array<Record<string, any>>,
  maxAgeHours = 24,
): {
  recommendation: string;
  totalReclaimableMB?: number;
  timestamp: string;
} | null {
  for (const event of recentAudit) {
    if (
      event.source !== "afloat-scheduler" ||
      event.tool !== "scheduled_diagnostics"
    )
      continue;
    const age = hoursSince(event.timestamp);
    if (age === null || age > maxAgeHours) continue;
    const followUp =
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as Record<string, any>).followUp
        : undefined;
    if (!followUp || typeof followUp !== "object" || !followUp.triggered)
      continue;
    const rec =
      followUp.recommendation ??
      "Run cleanup_execute with dry-run first to reclaim space.";
    return {
      recommendation: rec,
      totalReclaimableMB: followUp.totalReclaimableMB,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
  }
  return null;
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  // Health check
  server.registerTool(
    "health_check",
    { description: "Check pulse-server health and connected data sources" },
    async () => {
      await ensureDataDir();
      const journal = await getTodayJournal();
      const activeFocus = await getActiveFocus();
      const auditAvailable = await fileExists(ECHOES_AUDIT);
      const workflowsAvailable = await fileExists(AFLOAT_HISTORY);
      const seedsAvailable = await fileExists(SEEDS_SNAPSHOTS);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ok",
                server: SERVER_NAME,
                version: VERSION,
                dataDir: DATA_DIR,
                today: todayKey(),
                journalEntries: journal.length,
                activeFocusSession: !!activeFocus,
                dataSources: {
                  echoesAudit: auditAvailable,
                  afloatWorkflows: workflowsAvailable,
                  seedsSnapshots: seedsAvailable,
                },
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Morning Briefing ──

  server.registerTool(
    "morning_briefing",
    {
      description:
        "Generate a morning briefing by aggregating status from all MCP servers. " +
        "Shows overnight changes, pending work, ecosystem health, and suggested priorities for the day. " +
        "This is the first thing you should run when starting your workday.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDir();

      // Gather data from all sources
      const recentAudit = (await readRecentAuditEntries(100)) as Array<
        Record<string, any>
      >;
      const latestSnapshotResult = await getLatestSeedsSnapshot();
      const latestSnapshot = latestSnapshotResult.snapshot;
      const recentExecutions = await listRecentWorkflowExecutions(20);
      const workflowsToday = recentExecutions.filter((execution) =>
        execution.startedAt?.startsWith(todayKey()),
      ).length;
      const ecosystemScore =
        latestSnapshot?.overallScore ?? (await getLatestEcosystemScore());
      const telemetry = await getLatestTelemetry();
      const journal = await getTodayJournal();
      const activeFocus = await getActiveFocus();
      const preferences = await loadPreferences();

      // Analyze audit for overnight events
      const overnightEvents = recentAudit.filter((event) => {
        const age = hoursSince(event.timestamp);
        return age !== null && age <= 24;
      });

      const recentFailures = overnightEvents.filter((event) =>
        isFailureStatus(event.status),
      );
      const lowHealthRepos = getLowHealthRepos(latestSnapshot, 70);
      const failedWorkflows = recentExecutions.filter(
        (execution) => execution.status && execution.status !== "completed",
      );
      const repoNames = lowHealthRepos.map((repo) => repo.name).filter(Boolean);
      const correlatedSignals = recentFailures
        .map((event) => {
          const repo = inferRelatedRepo(event, repoNames);
          if (!repo) {
            return null;
          }

          const repoHealth = lowHealthRepos.find(
            (candidate) => candidate.name === repo,
          );
          if (!repoHealth) {
            return null;
          }

          return `${event.tool ?? "unknown_tool"} failed and ${repo} health is ${repoHealth.healthScore}/100 (${(repoHealth.issues ?? []).join(", ") || "no issues listed"})`;
        })
        .filter(Boolean) as string[];
      const correlatedItems = correlatedSignals.map((message) => ({ message }));
      const priorities: string[] = [];
      const warnings: string[] = [];
      if (recentFailures.length > 0) {
        warnings.push(
          `${recentFailures.length} recent failure/block events in the last 24 hours`,
        );
        priorities.push("Review blocked pipeline events");
      }

      if (lowHealthRepos.length > 0) {
        warnings.push(
          `${lowHealthRepos.length} repo(s) below health threshold: ${lowHealthRepos.map((repo) => `${repo.name} (${repo.healthScore})`).join(", ")}`,
        );
        priorities.push("Run ecosystem_scan to inspect degraded repositories");
      }

      if (failedWorkflows.length > 0) {
        warnings.push(
          `${failedWorkflows.length} workflow execution(s) are incomplete or failed`,
        );
        priorities.push(
          "Review recent workflow executions before starting new automation",
        );
      }

      if (ecosystemScore !== null && ecosystemScore < 60) {
        warnings.push(
          `Ecosystem health score is ${ecosystemScore}/100 — below threshold`,
        );
        priorities.push("Run ecosystem_scan to identify degraded repos");
      }

      if (correlatedSignals.length > 0) {
        priorities.unshift(
          "Address correlated failures before starting new work",
        );
      }

      if (activeFocus) {
        warnings.push(
          `You have an unfinished focus session: "${activeFocus.task}"`,
        );
        priorities.push("Close or resume the unfinished focus session");
      }

      if (priorities.length === 0) {
        priorities.push(
          "All systems healthy — great day for deep work!",
          "Consider running a focus session on your highest-priority project",
        );
      }

      // Apply adaptive preferences (section skip + promoted order)
      const orderedPriorities = applyPromotedOrder(
        priorities,
        preferences.promotedSignals,
      );
      const orderedWarnings = applyPromotedOrder(
        warnings,
        preferences.promotedSignals,
      );

      const rawPayload: Record<string, unknown> = {
        briefing: "Good morning! Here's your developer dashboard.",
        date: todayKey(),
        generatedAt: new Date().toISOString(),
        ecosystem: {
          healthScore:
            ecosystemScore ?? "No snapshots yet — run ecosystem_scan",
          latestTelemetry: telemetry ? "Available" : "No telemetry snapshots",
          snapshot: {
            sourceFile: latestSnapshotResult.metadata.sourceFile,
            timestamp: latestSnapshotResult.metadata.snapshotTimestamp,
            normalizedRepoNames: latestSnapshotResult.metadata.normalizedRepoNames,
            deduplicatedEntries: latestSnapshotResult.metadata.deduplicatedEntries,
          },
          lowHealthRepos: lowHealthRepos.map((repo) => ({
            name: repo.name,
            healthScore: repo.healthScore,
            issues: repo.issues ?? [],
          })),
        },
        overnightActivity: {
          totalEvents: overnightEvents.length,
          failures: recentFailures.length,
          workflowsRun: workflowsToday,
        },
        correlations: correlatedSignals,
        currentState: {
          journalEntriesToday: journal.length,
          activeFocusSession: activeFocus
            ? {
                task: activeFocus.task,
                startedAt: activeFocus.startedAt,
              }
            : null,
        },
        preferences,
        warnings: orderedWarnings,
        priorities: orderedPriorities,
      };

      // Filter out skipped sections
      const skipSet = new Set<string>(preferences.skippedBriefingSections);
      const payload: Record<string, unknown> = {};
      for (const key of Object.keys(rawPayload)) {
        if (key === "preferences" || !skipSet.has(key)) {
          payload[key] = rawPayload[key];
        }
      }

      emitAudit({
        source: SERVER_NAME,
        tool: "morning_briefing",
        status: "success",
        metadata: {
          overnightEvents: overnightEvents.length,
          failures: recentFailures.length,
          warningCount: orderedWarnings.length,
          priorityCount: orderedPriorities.length,
          ecosystemScore: ecosystemScore ?? null,
          snapshotTimestamp: latestSnapshotResult.metadata.snapshotTimestamp,
          snapshotSourceFile: latestSnapshotResult.metadata.sourceFile,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  // ── Journal ──

  server.registerTool(
    "check_alerts",
    {
      description:
        "Check for ecosystem alerts by combining low-health repositories, recent failures, and workflow problems.",
      inputSchema: z.object({
        healthThreshold: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .default(70)
          .describe("Repos below this score trigger alerts"),
      }),
    },
    async (args: { healthThreshold?: number }) => {
      await ensureDataDir();
      const threshold = args.healthThreshold ?? 70;
      const snapshotResult = await getLatestSeedsSnapshot();
      const snapshot = snapshotResult.snapshot;
      const lowHealthRepos = getLowHealthRepos(snapshot, threshold);
      const recentFailures = (
        (await readRecentAuditEntries(100)) as Array<Record<string, any>>
      ).filter((event) => {
        const age = hoursSince(event.timestamp);
        return age !== null && age <= 24 && isFailureStatus(event.status);
      });
      const failedWorkflows = (await listRecentWorkflowExecutions(20)).filter(
        (execution) => execution.status && execution.status !== "completed",
      );

      const alerts = [
        ...lowHealthRepos.map((repo) => `[repo] ${formatRepoIssue(repo)}`),
        ...(recentFailures.length > 3
          ? [
              `[audit] ${recentFailures.length} failure/block events in the last 24 hours`,
            ]
          : []),
        ...failedWorkflows
          .slice(0, 3)
          .map(
            (workflow) =>
              `[workflow] ${workflow.workflowId ?? workflow.executionId ?? "unknown"} status=${workflow.status ?? "unknown"}`,
          ),
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                alertCount: alerts.length,
                healthThreshold: threshold,
                snapshot: {
                  sourceFile: snapshotResult.metadata.sourceFile,
                  timestamp: snapshotResult.metadata.snapshotTimestamp,
                },
                alerts,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "what_should_i_work_on",
    {
      description:
        "Return a prioritized work queue based on repo health, recent failures, workflows, scheduled diagnostics follow-up, and session state. Rules-based: correlated failures first, then low repo health, then workflows and focus.",
      inputSchema: z.object({
        healthThreshold: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .default(70)
          .describe("Repos below this score count as low-health (default 70)"),
      }),
    },
    async (args: { healthThreshold?: number }) => {
      await ensureDataDir();
      const threshold = args.healthThreshold ?? 70;
      const recentAudit = (await readRecentAuditEntries(100)) as Array<
        Record<string, any>
      >;
      const recentFailures = recentAudit.filter((event) => {
        const age = hoursSince(event.timestamp);
        return age !== null && age <= 24 && isFailureStatus(event.status);
      });
      const latestSnapshotResult = await getLatestSeedsSnapshot();
      const latestSnapshot = latestSnapshotResult.snapshot;
      const lowHealthRepos = getLowHealthRepos(latestSnapshot, threshold);
      const failedWorkflows = (await listRecentWorkflowExecutions(20)).filter(
        (execution) => execution.status && execution.status !== "completed",
      );
      const activeFocus = await getActiveFocus();
      const journal = await getTodayJournal();

      const ecosystemScore = latestSnapshot?.overallScore ?? null;
      const rules = { ...DEFAULT_RULES, healthThreshold: threshold };
      const items = scoreAndRankItems(
        recentFailures,
        lowHealthRepos,
        failedWorkflows,
        activeFocus,
        journal,
        rules,
        recentAudit,
        ecosystemScore,
      );

      const summary =
        items.length === 0
          ? "No failures, low-health repos, or stuck workflows in the last 24h. Good time for deep work or starting something new."
          : "Prioritized by: correlated failures first, then low repo health, then workflows and focus, then scheduled-diagnostics follow-up.";

      const finalItems =
        items.length === 0
          ? [
              {
                rank: 1,
                priority: "low" as const,
                title: "All clear — no urgent items",
                reasoning: [summary],
                score: 0,
                occurrenceCount: 0,
              },
            ]
          : items.map((item, index) => ({
              rank: index + 1,
              priority: item.priority,
              title: item.title,
              reasoning: item.reasoning,
              score: Math.round(item.score * 10) / 10,
              occurrenceCount: item.occurrenceCount,
            }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                ecosystemScore,
                healthThreshold: threshold,
                snapshot: {
                  sourceFile: latestSnapshotResult.metadata.sourceFile,
                  timestamp: latestSnapshotResult.metadata.snapshotTimestamp,
                  normalizedRepoNames:
                    latestSnapshotResult.metadata.normalizedRepoNames,
                  deduplicatedEntries:
                    latestSnapshotResult.metadata.deduplicatedEntries,
                },
                journalEntriesToday: journal.length,
                summary,
                items: finalItems,
                rules: {
                  timeDecayHours: rules.timeDecayHours,
                  healthThreshold: rules.healthThreshold,
                  correlationBoost: rules.correlationBoost,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "briefing_preferences_set",
    {
      description:
        "Persist briefing preferences after briefing sections stabilize. " +
        "skippedBriefingSections: section keys to omit from morning briefing " +
        "('ecosystem', 'overnightActivity', 'correlations', 'currentState', 'warnings', 'priorities'). " +
        "promotedSignals: substrings to match; matching priorities/warnings are shown first.",
      inputSchema: z.object({
        skippedBriefingSections: z.array(z.string()).optional().default([]),
        promotedSignals: z.array(z.string()).optional().default([]),
      }),
    },
    async (args: {
      skippedBriefingSections?: string[];
      promotedSignals?: string[];
    }) => {
      await ensureDataDir();
      const validSectionSet = new Set<string>(BRIEFING_SECTION_KEYS);
      const skipped = (args.skippedBriefingSections ?? []).filter((k) =>
        validSectionSet.has(k),
      );
      const preferences: Preferences = {
        skippedBriefingSections: skipped,
        promotedSignals: args.promotedSignals ?? [],
      };
      await savePreferences(preferences);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ saved: true, preferences }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "journal_add",
    {
      description:
        "Add a journal entry — track what you worked on, decisions made, or blockers encountered. " +
        "Entries are grouped by day for digest generation.",
      inputSchema: z.object({
        entry: z
          .string()
          .min(1)
          .max(2000)
          .describe("What happened / what you worked on"),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe('Tags like "bugfix", "feature", "meeting", "review"'),
        mood: z
          .enum(["focused", "scattered", "blocked", "flow"])
          .optional()
          .describe("Your current working state"),
        linkedServer: z
          .string()
          .optional()
          .describe(
            'Which MCP server is relevant (e.g. "grid-server", "lots-server")',
          ),
      }),
    },
    async (args: {
      entry: string;
      tags?: string[];
      mood?: "focused" | "scattered" | "blocked" | "flow";
      linkedServer?: string;
    }) => {
      await ensureDataDir();
      const journal = await getTodayJournal();
      const newEntry: JournalEntry = {
        id: generateId("j"),
        timestamp: new Date().toISOString(),
        entry: args.entry,
        tags: args.tags ?? [],
        mood: args.mood,
        linkedServer: args.linkedServer,
      };
      journal.push(newEntry);
      await saveTodayJournal(journal);

      emitAudit({
        source: SERVER_NAME,
        tool: "journal_add",
        status: "success",
        metadata: { entryId: newEntry.id, tags: newEntry.tags, mood: newEntry.mood },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                recorded: true,
                id: newEntry.id,
                todayTotal: journal.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "journal_list",
    {
      description: "List today's journal entries (or a specific date)",
      inputSchema: z.object({
        date: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD). Defaults to today."),
      }),
    },
    async (args: { date?: string }) => {
      await ensureDataDir();
      const dateKey = args.date ?? todayKey();
      const filepath = path.join(JOURNAL_DIR, `${dateKey}.json`);
      let entries: JournalEntry[] = [];
      try {
        const content = await fs.readFile(filepath, "utf-8");
        entries = JSON.parse(content);
      } catch {
        /* no entries */
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { date: dateKey, count: entries.length, entries },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Focus Timer ──

  server.registerTool(
    "focus_start",
    {
      description:
        "Start a focus session — declare what you're working on and track deep work time. " +
        "Only one focus session can be active at a time.",
      inputSchema: z.object({
        task: z.string().min(1).max(200).describe("What you're focusing on"),
        project: z
          .string()
          .optional()
          .describe('Project name (e.g. "GRID-main", "afloat")'),
      }),
    },
    async (args: { task: string; project?: string }) => {
      await ensureDataDir();
      const existing = await getActiveFocus();
      if (existing) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Already in a focus session: "${existing.task}" (started ${existing.startedAt}). End it first with focus_end.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const session: FocusSession = {
        id: generateId("focus"),
        startedAt: new Date().toISOString(),
        task: args.task,
        project: args.project,
        interruptions: 0,
      };
      await saveActiveFocus(session);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                started: true,
                session,
                tip: "Use focus_interrupt if you get pulled away. Use focus_end when done.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "focus_interrupt",
    {
      description:
        "Record an interruption during your focus session (meetings, context switches, etc.)",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDir();
      const session = await getActiveFocus();
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No active focus session" }),
            },
          ],
          isError: true,
        };
      }
      session.interruptions++;
      await saveActiveFocus(session);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recorded: true,
              interruptions: session.interruptions,
              message:
                session.interruptions >= 3
                  ? "3+ interruptions — consider blocking your calendar"
                  : "Interruption noted. Try to get back into flow.",
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "focus_end",
    {
      description:
        "End the current focus session and record the outcome. Calculates duration and archives the session.",
      inputSchema: z.object({
        outcome: z
          .string()
          .optional()
          .describe("What you accomplished during this session"),
      }),
    },
    async (args: { outcome?: string }) => {
      await ensureDataDir();
      const session = await getActiveFocus();
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No active focus session" }),
            },
          ],
          isError: true,
        };
      }

      session.endedAt = new Date().toISOString();
      session.durationMinutes = Math.round(
        (new Date(session.endedAt).getTime() -
          new Date(session.startedAt).getTime()) /
          60000,
      );
      session.outcome = args.outcome;

      await archiveFocusSession(session);
      await saveActiveFocus(null);

      // Auto-add to journal
      const journal = await getTodayJournal();
      journal.push({
        id: generateId("j"),
        timestamp: session.endedAt,
        entry: `Focus session: ${session.task} (${session.durationMinutes}min, ${session.interruptions} interruptions)${args.outcome ? ` — ${args.outcome}` : ""}`,
        tags: ["focus-session", ...(session.project ? [session.project] : [])],
        mood:
          session.interruptions <= 1 && session.durationMinutes >= 25
            ? "flow"
            : session.interruptions >= 3
              ? "scattered"
              : "focused",
      });
      await saveTodayJournal(journal);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                completed: true,
                session: {
                  task: session.task,
                  duration: `${session.durationMinutes} minutes`,
                  interruptions: session.interruptions,
                  outcome: session.outcome ?? "(none recorded)",
                  quality:
                    session.interruptions <= 1 && session.durationMinutes >= 25
                      ? "Excellent deep work!"
                      : session.interruptions >= 3
                        ? "Fragmented — consider protecting this time slot"
                        : "Good session",
                },
                journalUpdated: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Daily Digest ──

  server.registerTool(
    "daily_digest",
    {
      description:
        "Generate a daily digest summarizing your journal entries, focus sessions, " +
        "audit events, workflow runs, and ecosystem health. " +
        "Run this at the end of your workday for a complete summary.",
      inputSchema: z.object({
        date: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD). Defaults to today."),
        save: z
          .boolean()
          .optional()
          .default(true)
          .describe("Save the digest to disk for future reference"),
      }),
    },
    async (args: { date?: string; save?: boolean }) => {
      await ensureDataDir();
      const dateKey = args.date ?? todayKey();

      // Journal
      const journalPath = path.join(JOURNAL_DIR, `${dateKey}.json`);
      let journal: JournalEntry[] = [];
      try {
        const content = await fs.readFile(journalPath, "utf-8");
        journal = JSON.parse(content);
      } catch {
        /* none */
      }

      // Focus sessions
      const focusPath = path.join(FOCUS_DIR, `${dateKey}.json`);
      let focusSessions: FocusSession[] = [];
      try {
        const content = await fs.readFile(focusPath, "utf-8");
        focusSessions = JSON.parse(content);
      } catch {
        /* none */
      }

      const totalFocusMinutes = focusSessions.reduce(
        (sum, s) => sum + (s.durationMinutes ?? 0),
        0,
      );

      // Cross-server
      const recentAudit = await readRecentAuditEntries(50);
      const todayAudit = recentAudit.filter((e: any) =>
        e.timestamp?.startsWith(dateKey),
      );
      const workflowsRun = (await listRecentWorkflowExecutions(50)).filter(
        (execution) => execution.startedAt?.startsWith(dateKey),
      ).length;
      const ecosystemScore = await getLatestEcosystemScore();

      // Build highlights
      const highlights: string[] = [];
      const blockers: string[] = [];

      if (focusSessions.length > 0) {
        highlights.push(
          `${focusSessions.length} focus sessions totaling ${totalFocusMinutes} minutes`,
        );
        const flowSessions = focusSessions.filter(
          (s) => s.interruptions <= 1 && (s.durationMinutes ?? 0) >= 25,
        );
        if (flowSessions.length > 0) {
          highlights.push(
            `${flowSessions.length} flow-state sessions — great deep work!`,
          );
        }
      }

      if (journal.length > 0) {
        highlights.push(`${journal.length} journal entries logged`);
      }

      const blockedEntries = journal.filter((e) => e.mood === "blocked");
      if (blockedEntries.length > 0) {
        blockers.push(...blockedEntries.map((e) => e.entry.slice(0, 100)));
      }

      const tomorrowSuggestions: string[] = [];
      if (totalFocusMinutes < 60) {
        tomorrowSuggestions.push(
          "Try to get at least 2 focus sessions tomorrow",
        );
      }
      if (blockers.length > 0) {
        tomorrowSuggestions.push("Address yesterday's blockers first thing");
      }
      if (ecosystemScore !== null && ecosystemScore < 70) {
        tomorrowSuggestions.push(
          "Run ecosystem maintenance to improve health scores",
        );
      }

      const digest: DailyDigest = {
        date: dateKey,
        generatedAt: new Date().toISOString(),
        journalEntries: journal.length,
        focusSessions: focusSessions.length,
        totalFocusMinutes,
        auditEvents: todayAudit.length,
        workflowsRun,
        ecosystemScore: ecosystemScore ?? undefined,
        highlights,
        blockers,
        tomorrowSuggestions,
      };

      if (args.save !== false) {
        const digestPath = path.join(DIGESTS_DIR, `${dateKey}.json`);
        await atomicWriteJson(digestPath, digest);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(digest, null, 2),
          },
        ],
      };
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDataDir();
  console.error(`[${SERVER_NAME}] v${VERSION} starting — data: ${DATA_DIR}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}

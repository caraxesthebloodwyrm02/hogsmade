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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
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

async function saveTodayJournal(entries: JournalEntry[]): Promise<void> {
  const filepath = path.join(JOURNAL_DIR, `${todayKey()}.json`);
  await fs.writeFile(filepath, JSON.stringify(entries, null, 2), "utf-8");
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
    await fs.writeFile(filepath, JSON.stringify(session, null, 2), "utf-8");
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
  await fs.writeFile(filepath, JSON.stringify(sessions, null, 2), "utf-8");
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
  await fs.writeFile(config.preferencesPath, JSON.stringify(preferences, null, 2), "utf-8");
}

// ── Cross-Server Aggregation (read-only) ──

async function readRecentAuditEntries(limit: number): Promise<unknown[]> {
  try {
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
          "utf-8"
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

async function getLatestEcosystemScore(): Promise<number | null> {
  try {
    const files = await fs.readdir(SEEDS_SNAPSHOTS);
    const latest = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()[0];
    if (!latest) return null;
    const content = await fs.readFile(
      path.join(SEEDS_SNAPSHOTS, latest),
      "utf-8"
    );
    const snapshot = JSON.parse(content);
    return snapshot.overallScore ?? null;
  } catch {
    return null;
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
      "utf-8"
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

async function getLatestSeedsSnapshot(): Promise<Record<string, any> | null> {
  try {
    const files = await fs.readdir(SEEDS_SNAPSHOTS);
    const latest = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()[0];
    if (!latest) return null;
    const content = await fs.readFile(
      path.join(SEEDS_SNAPSHOTS, latest),
      "utf-8"
    );
    return JSON.parse(content) as Record<string, any>;
  } catch {
    return null;
  }
}

async function listRecentWorkflowExecutions(limit: number): Promise<Record<string, any>[]> {
  try {
    const files = (await fs.readdir(AFLOAT_HISTORY))
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);

    const executions: Record<string, any>[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(AFLOAT_HISTORY, file), "utf-8");
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

function getLowHealthRepos(snapshot: Record<string, any> | null, threshold = 70): Array<Record<string, any>> {
  return Array.isArray(snapshot?.repos)
    ? snapshot.repos.filter((repo: Record<string, any>) => (repo.healthScore ?? 0) < threshold)
    : [];
}

function inferRelatedRepo(event: Record<string, any>, repoNames: string[]): string | null {
  const metadata = event.metadata && typeof event.metadata === "object"
    ? event.metadata as Record<string, unknown>
    : {};

  if (typeof metadata.relatedRepo === "string" && metadata.relatedRepo.length > 0) {
    return metadata.relatedRepo;
  }

  const haystacks = [
    typeof metadata.name === "string" ? metadata.name : "",
    typeof event.tool === "string" ? event.tool : "",
    typeof event.source === "string" ? event.source : "",
  ].filter(Boolean) as string[];

  for (const repoName of repoNames) {
    if (haystacks.some((value) => value.includes(repoName))) {
      return repoName;
    }
  }

  return null;
}

function formatRepoIssue(repo: Record<string, any>): string {
  const issues = Array.isArray(repo.issues) ? repo.issues.slice(0, 2).join(", ") : "health degradation detected";
  return `${repo.name} (${repo.healthScore ?? "?"}/100): ${issues}`;
}

function buildPriorityItems(
  recentFailures: Array<Record<string, any>>,
  lowHealthRepos: Array<Record<string, any>>,
  failedWorkflows: Array<Record<string, any>>,
  activeFocus: FocusSession | null,
): Array<{ priority: "high" | "medium"; title: string; reasoning: string[] }> {
  const priorityItems: Array<{ priority: "high" | "medium"; title: string; reasoning: string[] }> = [];
  const repoByName = new Map(
    lowHealthRepos
      .filter((repo) => typeof repo.name === "string")
      .map((repo) => [repo.name as string, repo]),
  );

  for (const event of recentFailures) {
    const relatedRepo = inferRelatedRepo(event, [...repoByName.keys()]);
    if (!relatedRepo) {
      continue;
    }

    const repo = repoByName.get(relatedRepo);
    if (!repo) {
      continue;
    }

    priorityItems.push({
      priority: "high",
      title: `${event.source ?? "unknown"} ${event.tool ?? "tool"} failure linked to ${relatedRepo}`,
      reasoning: [
        `Recent status: ${event.status ?? "unknown"}`,
        formatRepoIssue(repo),
      ],
    });
  }

  if (priorityItems.length === 0) {
    for (const repo of lowHealthRepos.slice(0, 3)) {
      priorityItems.push({
        priority: "medium",
        title: `Repo health below threshold: ${repo.name}`,
        reasoning: [formatRepoIssue(repo)],
      });
    }
  }

  for (const workflow of failedWorkflows.slice(0, 2)) {
    priorityItems.push({
      priority: "medium",
      title: `Workflow needs review: ${workflow.workflowId ?? workflow.executionId ?? "unknown"}`,
      reasoning: [
        `Status: ${workflow.status ?? "unknown"}`,
        `Started: ${workflow.startedAt ?? "unknown"}`,
      ],
    });
  }

  if (activeFocus) {
    priorityItems.push({
      priority: "medium",
      title: `Resolve unfinished focus session: ${activeFocus.task}`,
      reasoning: [`Started at ${activeFocus.startedAt}`],
    });
  }

  return priorityItems.slice(0, 5);
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
            2
          ),
        },
      ],
    };
  }
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
    const recentAudit = (await readRecentAuditEntries(100)) as Array<Record<string, any>>;
    const latestSnapshot = await getLatestSeedsSnapshot();
    const recentExecutions = await listRecentWorkflowExecutions(20);
    const workflowsToday = recentExecutions.filter((execution) => execution.startedAt?.startsWith(todayKey())).length;
    const ecosystemScore = latestSnapshot?.overallScore ?? await getLatestEcosystemScore();
    const telemetry = await getLatestTelemetry();
    const journal = await getTodayJournal();
    const activeFocus = await getActiveFocus();
    const preferences = await loadPreferences();

    // Analyze audit for overnight events
    const overnightEvents = recentAudit.filter((event) => {
      const age = hoursSince(event.timestamp);
      return age !== null && age <= 24;
    });

    const recentFailures = overnightEvents.filter((event) => isFailureStatus(event.status));
    const lowHealthRepos = getLowHealthRepos(latestSnapshot, 70);
    const failedWorkflows = recentExecutions.filter((execution) => execution.status && execution.status !== "completed");
    const repoNames = lowHealthRepos.map((repo) => repo.name).filter(Boolean);
    const correlatedSignals = recentFailures
      .map((event) => {
        const repo = inferRelatedRepo(event, repoNames);
        if (!repo) {
          return null;
        }

        const repoHealth = lowHealthRepos.find((candidate) => candidate.name === repo);
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
      warnings.push(`${recentFailures.length} recent failure/block events in the last 24 hours`);
      priorities.push("Review blocked pipeline events");
    }

    if (lowHealthRepos.length > 0) {
      warnings.push(
        `${lowHealthRepos.length} repo(s) below health threshold: ${lowHealthRepos.map((repo) => `${repo.name} (${repo.healthScore})`).join(", ")}`
      );
      priorities.push("Run ecosystem_scan to inspect degraded repositories");
    }

    if (failedWorkflows.length > 0) {
      warnings.push(`${failedWorkflows.length} workflow execution(s) are incomplete or failed`);
      priorities.push("Review recent workflow executions before starting new automation");
    }

    if (ecosystemScore !== null && ecosystemScore < 60) {
      warnings.push(`Ecosystem health score is ${ecosystemScore}/100 — below threshold`);
      priorities.push("Run ecosystem_scan to identify degraded repos");
    }

    if (correlatedSignals.length > 0) {
      priorities.unshift("Address correlated failures before starting new work");
    }

    if (activeFocus) {
      warnings.push(`You have an unfinished focus session: "${activeFocus.task}"`);
      priorities.push("Close or resume the unfinished focus session");
    }

    if (priorities.length === 0) {
      priorities.push(
        "All systems healthy — great day for deep work!",
        "Consider running a focus session on your highest-priority project"
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              briefing: "Good morning! Here's your developer dashboard.",
              date: todayKey(),
              generatedAt: new Date().toISOString(),
              ecosystem: {
                healthScore: ecosystemScore ?? "No snapshots yet — run ecosystem_scan",
                latestTelemetry: telemetry
                  ? "Available"
                  : "No telemetry snapshots",
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
                  ? { task: activeFocus.task, startedAt: activeFocus.startedAt }
                  : null,
              },
              preferences,
              warnings,
              priorities,
            },
            null,
            2
          ),
        },
      ],
    };
  }
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
    const snapshot = await getLatestSeedsSnapshot();
    const lowHealthRepos = getLowHealthRepos(snapshot, threshold);
    const recentFailures = ((await readRecentAuditEntries(100)) as Array<Record<string, any>>)
      .filter((event) => {
        const age = hoursSince(event.timestamp);
        return age !== null && age <= 24 && isFailureStatus(event.status);
      });
    const failedWorkflows = (await listRecentWorkflowExecutions(20))
      .filter((execution) => execution.status && execution.status !== "completed");

    const alerts = [
      ...lowHealthRepos.map((repo) => `[repo] ${formatRepoIssue(repo)}`),
      ...(recentFailures.length > 3
        ? [`[audit] ${recentFailures.length} failure/block events in the last 24 hours`]
        : []),
      ...failedWorkflows.slice(0, 3).map(
        (workflow) => `[workflow] ${workflow.workflowId ?? workflow.executionId ?? "unknown"} status=${workflow.status ?? "unknown"}`,
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
      "Return a prioritized work queue based on repo health, recent failures, workflows, and session state.",
    inputSchema: z.object({}),
  },
  async () => {
    await ensureDataDir();
    const recentFailures = ((await readRecentAuditEntries(100)) as Array<Record<string, any>>)
      .filter((event) => {
        const age = hoursSince(event.timestamp);
        return age !== null && age <= 24 && isFailureStatus(event.status);
      });
    const latestSnapshot = await getLatestSeedsSnapshot();
    const lowHealthRepos = getLowHealthRepos(latestSnapshot, 70);
    const failedWorkflows = (await listRecentWorkflowExecutions(20))
      .filter((execution) => execution.status && execution.status !== "completed");
    const activeFocus = await getActiveFocus();
    const journal = await getTodayJournal();

    const items = buildPriorityItems(recentFailures, lowHealthRepos, failedWorkflows, activeFocus).map(
      (item, index) => ({
        rank: index + 1,
        ...item,
      }),
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              journalEntriesToday: journal.length,
              items,
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
    description: "Persist briefing preferences after briefing sections stabilize.",
    inputSchema: z.object({
      skippedBriefingSections: z.array(z.string()).optional().default([]),
      promotedSignals: z.array(z.string()).optional().default([]),
    }),
  },
  async (args: { skippedBriefingSections?: string[]; promotedSignals?: string[] }) => {
    await ensureDataDir();
    const preferences: Preferences = {
      skippedBriefingSections: args.skippedBriefingSections ?? [],
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
      entry: z.string().min(1).max(2000).describe("What happened / what you worked on"),
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
        .describe('Which MCP server is relevant (e.g. "grid-server", "lots-server")'),
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
            2
          ),
        },
      ],
    };
  }
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
            2
          ),
        },
      ],
    };
  }
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
            2
          ),
        },
      ],
    };
  }
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
  }
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
        60000
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
            2
          ),
        },
      ],
    };
  }
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
      0
    );

    // Cross-server
    const recentAudit = await readRecentAuditEntries(50);
    const todayAudit = recentAudit.filter((e: any) =>
      e.timestamp?.startsWith(dateKey)
    );
    const workflowsRun = (await listRecentWorkflowExecutions(50)).filter((execution) =>
      execution.startedAt?.startsWith(dateKey)
    ).length;
    const ecosystemScore = await getLatestEcosystemScore();

    // Build highlights
    const highlights: string[] = [];
    const blockers: string[] = [];

    if (focusSessions.length > 0) {
      highlights.push(
        `${focusSessions.length} focus sessions totaling ${totalFocusMinutes} minutes`
      );
      const flowSessions = focusSessions.filter(
        (s) => s.interruptions <= 1 && (s.durationMinutes ?? 0) >= 25
      );
      if (flowSessions.length > 0) {
        highlights.push(
          `${flowSessions.length} flow-state sessions — great deep work!`
        );
      }
    }

    if (journal.length > 0) {
      highlights.push(`${journal.length} journal entries logged`);
    }

    const blockedEntries = journal.filter((e) => e.mood === "blocked");
    if (blockedEntries.length > 0) {
      blockers.push(
        ...blockedEntries.map((e) => e.entry.slice(0, 100))
      );
    }

    const tomorrowSuggestions: string[] = [];
    if (totalFocusMinutes < 60) {
      tomorrowSuggestions.push(
        "Try to get at least 2 focus sessions tomorrow"
      );
    }
    if (blockers.length > 0) {
      tomorrowSuggestions.push("Address yesterday's blockers first thing");
    }
    if (ecosystemScore !== null && ecosystemScore < 70) {
      tomorrowSuggestions.push("Run ecosystem maintenance to improve health scores");
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
      await fs.writeFile(digestPath, JSON.stringify(digest, null, 2), "utf-8");
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(digest, null, 2),
        },
      ],
    };
  }
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

const isEntrypoint = process.argv[1] != null
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}

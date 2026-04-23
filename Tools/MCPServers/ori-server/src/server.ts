/**
 * Ori Server — Edge-Sanding Console Log Collector & Risk Probe
 *
 * Operates parallel to the test suite, collecting console log messages,
 * filtering them by severity and pattern, and producing time-aware
 * read-reason-actionable recommendations for reproducibility.
 *
 * Core philosophy: subtlety matters. A large test collection is a mix
 * of various signals — sort + filter = good note material.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import { ActionClass, Scope, createHardenedMeritGuard } from "@cascade/shared-types";
import {
  type TraceContext,
  createChildSpan,
  createRootSpan,
  extractTrace,
} from "@cascade/shared-types/trace-context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

import { getConfig } from "./config.js";
import { filterLogs } from "./filter.js";
import { RISK_PATTERNS, classifyLine, extractTestFile } from "./patterns.js";
import { runProbe, saveProbe } from "./probe.js";
import {
  generateRecommendations,
  generateThreatAwareRecommendations,
  saveRecommendations,
} from "./recommend.js";
import {
  parseThreatModel,
  loadThreatModel,
  buildCoverageMap,
  routeThreatToTests,
} from "./threat-model.js";
import { buildThreatProjectHeatmap } from "./heatmap.js";
import { buildConfirmationMap } from "./confirmations.js";
import { generateReport, renderReport } from "./reporter.js";
import type { ReportData } from "./reporter.js";
import { appendNote, queryNotes, getNotebookSummary } from "./notebook.js";
import type { NoteCategory } from "./notebook.js";
import { collectEcosystemContext } from "./interop.js";
import {
  ensureDataDirs,
  readTodayLogs,
  readAllLogs,
  appendLogEntries,
  clearAllLogs,
} from "./storage.js";
import { loadRegistry, getProject, listProjects, discoverTestSuites } from "./registry.js";
import { runTestSuite, runAllTests, getRunResult, getRunStdout, listRuns } from "./executor.js";
import { evaluateSignals, getRouterState, resetRouterState } from "./router.js";
import {
  loadRouterConfig,
  updateRoute,
  addRoute,
  removeRoute,
  resetRoutes,
} from "./router-config.js";
import type { AntiPatternFinding, EvaluationResult, LogEntry, RouteFiring } from "./types.js";

const SERVER_NAME = "ori-server";
const VERSION = "1.0.0";
const readLimiter = new SessionRateLimiter();
const config = getConfig();

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  const meritGuard = createHardenedMeritGuard(SERVER_NAME, process.env.GRID_API_URL);
  const registerGuardedTool = meritGuard.registerGuardedTool.bind(meritGuard) as any;
  const registerTool = server.registerTool.bind(server) as any;

  // ── Health Check ──

  registerGuardedTool(
    server,
    "health_check",
    {
      actionClass: ActionClass.PUBLIC_BASIC,
      description: "Check ori-server health and data store status",
    },
    async () => {
      await ensureDataDirs();
      const todayLogs = await readTodayLogs();
      const allLogs = await readAllLogs();

      return {
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        dataDir: config.dataDir,
        logDir: config.logDir,
        todayLogEntries: todayLogs.length,
        totalLogEntries: allLogs.length,
        riskPatterns: RISK_PATTERNS.map((p) => ({
          id: p.id,
          label: p.label,
          severity: p.severity,
        })),
        timestamp: new Date().toISOString(),
        circuitState: meritGuard.getCircuitState(),
        metrics: meritGuard.getMetrics(),
      };
    },
  );

  // ── Collect Logs ──

  registerTool(
    "collect_logs",
    {
      description:
        "Ingest console log lines from a test run. Each line is classified by severity " +
        "and matched against risk patterns. Operates parallel to the test suite.",
      inputSchema: z.object({
        lines: z.array(z.string()).min(1).describe("Console log lines to ingest"),
        source: z
          .string()
          .optional()
          .default("test-suite")
          .describe("Source identifier (e.g. test suite name)"),
      }),
    },
    async (args: { lines: string[]; source?: string }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const source = args.source ?? "test-suite";
      const now = new Date().toISOString();

      const entries: LogEntry[] = args.lines.map((line) => {
        const classification = classifyLine(line);
        return {
          id: generateId("log"),
          timestamp: now,
          line: line.trim(),
          source,
          severity: classification.severity,
          matchedPatterns: classification.matchedPatterns,
          testFile: extractTestFile(line),
        };
      });

      await appendLogEntries(entries);

      const signalEntries = entries.filter((e) => e.matchedPatterns.length > 0);
      const signalCount = signalEntries.length;

      // Evaluate signal-bearing entries against router + anti-pattern scanner
      let evalResult: EvaluationResult = { routeFirings: [], antiPatterns: [] };
      if (signalCount > 0) {
        try {
          evalResult = await evaluateSignals(signalEntries);
        } catch (err) {
          process.stderr.write(
            `[ori-server] router evaluation failed: ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
        }
      }
      const { routeFirings, antiPatterns } = evalResult;

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "collect_logs",
        status: "success",
        metadata: {
          linesIngested: entries.length,
          signalsDetected: signalCount,
          source,
          routeFirings: routeFirings.length,
          antiPatterns: antiPatterns.length,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                collected: true,
                linesIngested: entries.length,
                signalsDetected: signalCount,
                criticalCount: entries.filter((e) => e.severity === "critical").length,
                warningCount: entries.filter((e) => e.severity === "warning").length,
                infoCount: entries.filter((e) => e.severity === "info").length,
                source,
                routeFirings:
                  routeFirings.length > 0
                    ? routeFirings.map((f) => ({
                        routeId: f.routeId,
                        routeName: f.routeName,
                        matchedCount: f.matchedCount,
                        actionsExecuted: f.actionsExecuted,
                      }))
                    : undefined,
                antiPatterns:
                  antiPatterns.length > 0
                    ? antiPatterns.map((ap: AntiPatternFinding) => ({
                        code: ap.code,
                        label: ap.label,
                        severity: ap.severity,
                        sources: ap.sources,
                        patterns: ap.patterns,
                        topLine: ap.topLine,
                        action: ap.action,
                        windowIds: ap.windowIds,
                      }))
                    : undefined,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Filter Logs ──

  registerTool(
    "filter_logs",
    {
      description:
        "Apply filters to collected logs. Supports severity, pattern, source, time range, " +
        "and sorting. The fundamental operation: sort + filter = good note material.",
      inputSchema: z.object({
        severity: z
          .array(z.enum(["critical", "warning", "info", "unknown"]))
          .optional()
          .describe("Filter by severity levels"),
        patternIds: z.array(z.string()).optional().describe("Filter by specific risk pattern IDs"),
        source: z.string().optional().describe("Filter by source identifier"),
        since: z.string().optional().describe("ISO timestamp — only entries after this time"),
        until: z.string().optional().describe("ISO timestamp — only entries before this time"),
        sortBy: z
          .enum(["timestamp", "severity", "pattern_count"])
          .optional()
          .default("timestamp")
          .describe("Sort field"),
        sortOrder: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort direction"),
        limit: z.number().min(1).max(500).optional().default(50).describe("Max entries to return"),
      }),
    },
    async (args: {
      severity?: string[];
      patternIds?: string[];
      source?: string;
      since?: string;
      until?: string;
      sortBy?: "timestamp" | "severity" | "pattern_count";
      sortOrder?: "asc" | "desc";
      limit?: number;
    }) => {
      const rlMsg = readLimiter.check("filter_logs");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      await ensureDataDirs();
      const allLogs = await readAllLogs();
      const filtered = filterLogs(allLogs, {
        severity: args.severity,
        patternIds: args.patternIds,
        source: args.source,
        since: args.since,
        until: args.until,
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
      });

      const limited = filtered.slice(0, args.limit ?? 50);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalMatched: filtered.length,
                returned: limited.length,
                entries: limited.map((e) => ({
                  id: e.id,
                  timestamp: e.timestamp,
                  severity: e.severity,
                  matchedPatterns: e.matchedPatterns,
                  line: e.line.length > 200 ? e.line.slice(0, 200) + "..." : e.line,
                  testFile: e.testFile,
                  source: e.source,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Probe Test Suite ──

  registerTool(
    "probe_test_suite",
    {
      description:
        "Time-aware scan of collected test logs for risk signals. Produces a structured " +
        "probe result with pattern breakdown, time window, and severity counts.",
      inputSchema: z.object({
        source: z
          .string()
          .optional()
          .default("test-suite")
          .describe("Source to probe (default: all collected logs)"),
        since: z.string().optional().describe("ISO timestamp — only entries after this time"),
        until: z.string().optional().describe("ISO timestamp — only entries before this time"),
      }),
    },
    async (args: { source?: string; since?: string; until?: string }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      const rlMsg = readLimiter.check("probe_test_suite");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      await ensureDataDirs();
      const allLogs = await readAllLogs();
      const scoped = filterLogs(allLogs, {
        source: args.source,
        since: args.since,
        until: args.until,
      });

      const probe = runProbe(scoped, args.source ?? "all");
      await saveProbe(probe);

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "probe_test_suite",
        status: "success",
        metadata: {
          totalLines: probe.totalLines,
          riskSignals: probe.riskSignals,
          criticalCount: probe.criticalCount,
          source: probe.source,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                probeId: probe.id,
                timestamp: probe.timestamp,
                totalLines: probe.totalLines,
                riskSignals: probe.riskSignals,
                criticalCount: probe.criticalCount,
                warningCount: probe.warningCount,
                infoCount: probe.infoCount,
                topPatterns: probe.topPatterns,
                timeWindow: probe.timeWindow,
                source: probe.source,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Get Recommendations ──

  registerTool(
    "get_recommendations",
    {
      description:
        "Generate read-reason-actionable recommendations from collected logs. " +
        "Each recommendation includes what to read, why it matters, what action to take, " +
        "and how to reproduce the finding for reproducibility.",
      inputSchema: z.object({
        source: z
          .string()
          .optional()
          .describe("Source to generate recommendations for (default: all)"),
        since: z.string().optional().describe("ISO timestamp — only entries after this time"),
        until: z.string().optional().describe("ISO timestamp — only entries before this time"),
        save: z.boolean().optional().default(true).describe("Save recommendations to disk"),
      }),
    },
    async (args: { source?: string; since?: string; until?: string; save?: boolean }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      const rlMsg = readLimiter.check("get_recommendations");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      await ensureDataDirs();
      const allLogs = await readAllLogs();
      const scoped = filterLogs(allLogs, {
        source: args.source,
        since: args.since,
        until: args.until,
      });

      const probe = runProbe(scoped, args.source ?? "all");
      const recommendations = generateRecommendations(probe, scoped);

      if (args.save && recommendations.length > 0) {
        await saveRecommendations(recommendations);
      }

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "get_recommendations",
        status: "success",
        metadata: {
          recommendationCount: recommendations.length,
          criticalRecs: recommendations.filter((r) => r.severity === "critical").length,
          source: args.source ?? "all",
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                totalRecommendations: recommendations.length,
                criticalCount: recommendations.filter((r) => r.severity === "critical").length,
                warningCount: recommendations.filter((r) => r.severity === "warning").length,
                recommendations: recommendations.map((r) => ({
                  title: r.title,
                  severity: r.severity,
                  read: r.read,
                  reason: r.reason,
                  action: r.action,
                  reproducibility: r.reproducibility,
                  relatedPatterns: r.relatedPatterns,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── List Collected ──

  registerTool(
    "list_collected",
    {
      description:
        "Browse stored log entries with sorting options. Shows concise summaries " +
        "to maintain subtlety — the full line is available but truncated by default.",
      inputSchema: z.object({
        sortBy: z
          .enum(["timestamp", "severity", "pattern_count"])
          .optional()
          .default("timestamp")
          .describe("Sort field"),
        sortOrder: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort direction"),
        limit: z.number().min(1).max(200).optional().default(30).describe("Max entries to return"),
        offset: z.number().min(0).optional().default(0).describe("Skip first N entries"),
      }),
    },
    async (args: {
      sortBy?: "timestamp" | "severity" | "pattern_count";
      sortOrder?: "asc" | "desc";
      limit?: number;
      offset?: number;
    }) => {
      const rlMsg = readLimiter.check("list_collected");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      await ensureDataDirs();
      const allLogs = await readAllLogs();
      const sorted = filterLogs(allLogs, {
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
      });

      const offset = args.offset ?? 0;
      const limit = args.limit ?? 30;
      const page = sorted.slice(offset, offset + limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: sorted.length,
                showing: page.length,
                offset,
                limit,
                entries: page.map((e) => ({
                  id: e.id,
                  timestamp: e.timestamp,
                  severity: e.severity,
                  patternCount: e.matchedPatterns.length,
                  patterns: e.matchedPatterns,
                  linePreview: e.line.length > 120 ? e.line.slice(0, 120) + "..." : e.line,
                  testFile: e.testFile,
                  source: e.source,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Clear Logs ──

  registerTool(
    "clear_logs",
    {
      description: "Purge all collected log data. Use with caution — this is irreversible.",
      inputSchema: z.object({
        confirm: z
          .literal("CLEAR-ORI-LOGS")
          .describe("Must be exactly 'CLEAR-ORI-LOGS' to execute"),
      }),
    },
    async (args: { confirm: "CLEAR-ORI-LOGS" }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const beforeCount = (await readAllLogs()).length;
      await clearAllLogs();

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "clear_logs",
        status: "success",
        metadata: { entriesCleared: beforeCount },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ cleared: true, entriesRemoved: beforeCount }, null, 2),
          },
        ],
      };
    },
  );

  // ── List Projects ──

  registerTool(
    "list_projects",
    {
      description:
        "Browse the project registry with health summaries. " +
        "Optionally filter by tags or health status.",
      inputSchema: z.object({
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter by tags (e.g. 'python', 'mcp', 'security')"),
        healthStatus: z
          .enum(["healthy", "degraded", "failing", "unknown"])
          .optional()
          .describe("Filter by health status"),
      }),
    },
    async (args: { tags?: string[]; healthStatus?: string }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const projects = await listProjects({
        tags: args.tags,
        healthStatus: args.healthStatus,
      });

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "list_projects",
        status: "success",
        metadata: {
          projectCount: projects.length,
          filter: { tags: args.tags, healthStatus: args.healthStatus },
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalProjects: projects.length,
                projects: projects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  location: p.location,
                  runnerType: p.runner.type,
                  approxTestFiles: p.approxTestFiles,
                  tags: p.tags,
                  healthStatus: p.healthStatus ?? "unknown",
                  lastRunTimestamp: p.lastRunTimestamp ?? null,
                  threatModelIds: p.threatModelIds ?? [],
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Get Project ──

  registerTool(
    "get_project",
    {
      description:
        "Get detailed info about a single project including runner config, " +
        "tags, last run summary, and threat model mapping.",
      inputSchema: z.object({
        projectId: z.string().describe("Project ID (e.g. 'grid-main', 'mcp-grid-server')"),
      }),
    },
    async (args: { projectId: string }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const project = await getProject(args.projectId);

      if (!project) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Project "${args.projectId}" not found in registry` },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "get_project",
        status: "success",
        metadata: { projectId: args.projectId },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    },
  );

  // ── Discover Tests ──

  registerTool(
    "discover_tests",
    {
      description:
        "Scan a project's configured test directories, count test files, " +
        "and validate runner availability. Updates the registry entry.",
      inputSchema: z.object({
        projectId: z.string().describe("Project ID to discover tests for"),
      }),
    },
    async (args: { projectId: string }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const result = await discoverTestSuites(args.projectId);

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "discover_tests",
        status: result.found ? "success" : "failure",
        metadata: { projectId: args.projectId, testFiles: result.testFiles },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // ── Run Tests ──

  registerTool(
    "run_tests",
    {
      description:
        "Execute the test suite for a specific project. Captures stdout/stderr, " +
        "classifies output through the risk pattern engine, updates registry health, " +
        "and returns a structured summary.",
      inputSchema: z.object({
        projectId: z.string().describe("Project ID (e.g. 'grid-main', 'shared-types')"),
        filter: z.string().optional().describe("Optional test path filter to narrow execution"),
        timeoutSeconds: z
          .number()
          .min(5)
          .max(600)
          .optional()
          .describe("Execution timeout in seconds (default: project-configured or 120)"),
      }),
    },
    async (args: { projectId: string; filter?: string; timeoutSeconds?: number }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();

      try {
        const result = await runTestSuite(args.projectId, {
          timeoutMs: args.timeoutSeconds ? args.timeoutSeconds * 1000 : undefined,
          filter: args.filter,
        });

        // Evaluate router + anti-pattern scanner on entries created by this run
        let runEval: EvaluationResult = { routeFirings: [], antiPatterns: [] };
        if (result.logEntriesCreated > 0) {
          try {
            const allLogs = await readAllLogs();
            const recentEntries = allLogs
              .filter(
                (e) =>
                  e.source === args.projectId &&
                  e.timestamp >= result.timestamp &&
                  e.matchedPatterns.length > 0,
              )
              .slice(-200);
            if (recentEntries.length > 0) {
              runEval = await evaluateSignals(recentEntries);
            }
          } catch (err) {
            process.stderr.write(
              `[ori-server] router evaluation failed: ${
                err instanceof Error ? err.message : String(err)
              }\n`,
            );
          }
        }
        const { routeFirings: runFirings, antiPatterns: runAntiPatterns } = runEval;

        emitAudit({
          traceId: span.traceId,
          spanId: span.spanId,
          source: SERVER_NAME,
          tool: "run_tests",
          status: "success",
          durationMs: result.summary.durationMs,
          metadata: {
            projectId: args.projectId,
            runId: result.id,
            passed: result.summary.passed,
            failed: result.summary.failed,
            skipped: result.summary.skipped,
            runStatus: result.status,
            logEntriesCreated: result.logEntriesCreated,
            routeFirings: runFirings.length,
            antiPatterns: runAntiPatterns.length,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  runId: result.id,
                  projectId: result.projectId,
                  status: result.status,
                  summary: result.summary,
                  logEntriesCreated: result.logEntriesCreated,
                  errorMessage: result.errorMessage,
                  routeFirings:
                    runFirings.length > 0
                      ? runFirings.map((f) => ({
                          routeId: f.routeId,
                          routeName: f.routeName,
                          matchedCount: f.matchedCount,
                          actionsExecuted: f.actionsExecuted,
                        }))
                      : undefined,
                  antiPatterns:
                    runAntiPatterns.length > 0
                      ? runAntiPatterns.map((ap: AntiPatternFinding) => ({
                          code: ap.code,
                          label: ap.label,
                          severity: ap.severity,
                          sources: ap.sources,
                          patterns: ap.patterns,
                          topLine: ap.topLine,
                          action: ap.action,
                          windowIds: ap.windowIds,
                        }))
                      : undefined,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        emitAudit({
          traceId: span.traceId,
          spanId: span.spanId,
          source: SERVER_NAME,
          tool: "run_tests",
          status: "error",
          metadata: { projectId: args.projectId, error: msg },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: msg }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Run All Tests ──

  registerTool(
    "run_all_tests",
    {
      description:
        "Execute test suites for multiple projects sequentially. " +
        "Returns per-project summary array. Use projectIds to scope, " +
        "or omit to run all registered projects.",
      inputSchema: z.object({
        projectIds: z
          .array(z.string())
          .optional()
          .describe("Subset of project IDs to run (default: all)"),
        stopOnFailure: z
          .boolean()
          .optional()
          .default(false)
          .describe("Stop after first failing project"),
        timeoutSeconds: z
          .number()
          .min(5)
          .max(600)
          .optional()
          .describe("Per-project timeout in seconds"),
      }),
    },
    async (args: { projectIds?: string[]; stopOnFailure?: boolean; timeoutSeconds?: number }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const runStartedAt = new Date().toISOString();

      const results = await runAllTests(args.projectIds, {
        stopOnFailure: args.stopOnFailure,
        timeoutMs: args.timeoutSeconds ? args.timeoutSeconds * 1000 : undefined,
      });

      const passed = results.filter((r) => r.status === "passed").length;
      const failed = results.filter((r) => r.status !== "passed").length;
      const totalLogEntries = results.reduce((sum, r) => sum + r.logEntriesCreated, 0);

      // Evaluate router + anti-pattern scanner on all entries created during this batch
      let batchEval: EvaluationResult = { routeFirings: [], antiPatterns: [] };
      if (totalLogEntries > 0) {
        try {
          const allLogs = await readAllLogs();
          const recentEntries = allLogs
            .filter((e) => e.timestamp >= runStartedAt && e.matchedPatterns.length > 0)
            .slice(-500);
          if (recentEntries.length > 0) {
            batchEval = await evaluateSignals(recentEntries);
          }
        } catch (err) {
          process.stderr.write(
            `[ori-server] router evaluation failed: ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
        }
      }
      const { routeFirings: batchFirings, antiPatterns: batchAntiPatterns } = batchEval;

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "run_all_tests",
        status: "success",
        metadata: {
          projectCount: results.length,
          passed,
          failed,
          projectIds: args.projectIds ?? "all",
          routeFirings: batchFirings.length,
          antiPatterns: batchAntiPatterns.length,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalProjects: results.length,
                passed,
                failed,
                results: results.map((r) => ({
                  runId: r.id,
                  projectId: r.projectId,
                  status: r.status,
                  passed: r.summary.passed,
                  failed: r.summary.failed,
                  skipped: r.summary.skipped,
                  durationMs: r.summary.durationMs,
                  errorMessage: r.errorMessage,
                })),
                routeFirings:
                  batchFirings.length > 0
                    ? batchFirings.map((f) => ({
                        routeId: f.routeId,
                        routeName: f.routeName,
                        matchedCount: f.matchedCount,
                        actionsExecuted: f.actionsExecuted,
                      }))
                    : undefined,
                antiPatterns:
                  batchAntiPatterns.length > 0
                    ? batchAntiPatterns.map((ap: AntiPatternFinding) => ({
                        code: ap.code,
                        label: ap.label,
                        severity: ap.severity,
                        sources: ap.sources,
                        patterns: ap.patterns,
                        topLine: ap.topLine,
                        action: ap.action,
                        windowIds: ap.windowIds,
                      }))
                    : undefined,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Get Run Result ──

  registerTool(
    "get_run_result",
    {
      description:
        "Retrieve detailed results from a past test run by run ID. " +
        "Includes structured summary and optionally the raw stdout.",
      inputSchema: z.object({
        runId: z.string().describe("Run ID (e.g. 'run_abc123')"),
        includeStdout: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include raw stdout (truncated to 10000 chars)"),
      }),
    },
    async (args: { runId: string; includeStdout?: boolean }) => {
      const rlMsg = readLimiter.check("get_run_result");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      const result = await getRunResult(args.runId);
      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Run "${args.runId}" not found` }, null, 2),
            },
          ],
          isError: true,
        };
      }

      let stdout: string | undefined;
      if (args.includeStdout) {
        const raw = await getRunStdout(args.runId);
        stdout = raw ? raw.slice(0, 10000) : undefined;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ...result,
                rawStdout: stdout,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── List Runs ──

  registerTool(
    "list_runs",
    {
      description:
        "Browse past test run results with filtering and pagination. " +
        "Sorted by timestamp descending.",
      inputSchema: z.object({
        projectId: z.string().optional().describe("Filter by project ID"),
        status: z
          .enum(["passed", "failed", "error", "timeout"])
          .optional()
          .describe("Filter by run status"),
        limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
        offset: z.number().min(0).optional().default(0).describe("Skip first N results"),
      }),
    },
    async (args: { projectId?: string; status?: string; limit?: number; offset?: number }) => {
      const rlMsg = readLimiter.check("list_runs");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      const { total, runs } = await listRuns({
        projectId: args.projectId,
        status: args.status,
        limit: args.limit,
        offset: args.offset,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total,
                showing: runs.length,
                offset: args.offset ?? 0,
                runs: runs.map((r) => ({
                  runId: r.id,
                  projectId: r.projectId,
                  status: r.status,
                  passed: r.summary.passed,
                  failed: r.summary.failed,
                  skipped: r.summary.skipped,
                  durationMs: r.summary.durationMs,
                  timestamp: r.timestamp,
                  errorMessage: r.errorMessage,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Parse Threat Model ──

  registerTool(
    "parse_threat_model",
    {
      description:
        "Parse or refresh the CascadeProjects threat model from disk. " +
        "Returns threat count, coverage summary, and identified gaps.",
      inputSchema: z.object({
        refresh: z.boolean().optional().default(false).describe("Force re-parse from disk"),
      }),
    },
    async (args: { refresh?: boolean }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();

      const threatModel = args.refresh ? await parseThreatModel() : await loadThreatModel();
      const projects = await listProjects();
      const coverageReport = buildCoverageMap(projects, threatModel);

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "parse_threat_model",
        status: "success",
        metadata: {
          threatCount: threatModel.threats.length,
          focusPathCount: threatModel.focusPaths.length,
          coverageGaps: coverageReport.threatsWithoutCoverage,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                parsedAt: threatModel.parsedAt,
                threatCount: threatModel.threats.length,
                threats: threatModel.threats.map((t) => ({
                  id: t.id,
                  source: t.source.slice(0, 100),
                  priority: t.priority,
                  likelihood: t.likelihood,
                  impactSeverity: t.impactSeverity,
                })),
                focusPathCount: threatModel.focusPaths.length,
                coverage: {
                  total: coverageReport.totalThreats,
                  covered: coverageReport.threatsWithCoverage,
                  uncovered: coverageReport.threatsWithoutCoverage,
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

  // ── Map Threats ──

  registerTool(
    "map_threats",
    {
      description:
        "Map threats to test coverage for a specific project or threat ID. " +
        "Shows which projects cover a threat and highlights coverage gaps.",
      inputSchema: z.object({
        threatId: z.string().optional().describe("Specific threat ID (e.g. 'TM-001')"),
        projectId: z.string().optional().describe("Specific project ID to see its threat mapping"),
      }),
    },
    async (args: { threatId?: string; projectId?: string }) => {
      await ensureDataDirs();
      const threatModel = await loadThreatModel();
      const projects = await listProjects();

      if (args.threatId) {
        const mapping = routeThreatToTests(args.threatId, projects, threatModel);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  threatId: args.threatId,
                  threat: mapping.threat
                    ? {
                        source: mapping.threat.source,
                        action: mapping.threat.action,
                        impact: mapping.threat.impact,
                        priority: mapping.threat.priority,
                        mitigations: mapping.threat.mitigations,
                        gaps: mapping.threat.gaps,
                      }
                    : null,
                  coveredByProjects: mapping.projects,
                  focusPaths: mapping.focusPaths,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (args.projectId) {
        const project = projects.find((p) => p.id === args.projectId);
        if (!project) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Project "${args.projectId}" not found` }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const mappedThreats = (project.threatModelIds ?? []).map((tid) => {
          const threat = threatModel.threats.find((t) => t.id === tid);
          return {
            threatId: tid,
            priority: threat?.priority ?? "unknown",
            action: threat?.action?.slice(0, 150) ?? "",
            mitigations: threat?.mitigations?.slice(0, 150) ?? "",
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  projectId: args.projectId,
                  projectName: project.name,
                  threatCount: mappedThreats.length,
                  threats: mappedThreats,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // No filter — return full coverage map
      const coverageReport = buildCoverageMap(projects, threatModel);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(coverageReport, null, 2),
          },
        ],
      };
    },
  );

  registerTool(
    "get_threat_coverage_heatmap",
    {
      description:
        "Return a JSON heatmap grid: threats (rows) × projects (columns) with scores " +
        "for registry health and threat mapping (1 healthy, 0.5 stale/degraded/unknown, 0 failing, null unmapped). " +
        "Rows with coverage gaps sort first. Caps limit payload size.",
      inputSchema: z.object({
        threatIdPrefix: z
          .string()
          .optional()
          .describe("Only include threat IDs starting with this prefix (e.g. 'TM-')"),
        projectIds: z
          .array(z.string())
          .optional()
          .describe("Restrict columns to these registry project IDs (preserves request order)"),
        maxThreats: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max threat rows (default 80)"),
        maxProjects: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max project columns (default 40)"),
      }),
    },
    async (args: {
      threatIdPrefix?: string;
      projectIds?: string[];
      maxThreats?: number;
      maxProjects?: number;
    }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const threatModel = await loadThreatModel();
      const projects = await listProjects();
      const coverageReport = buildCoverageMap(projects, threatModel);
      const confirmationMap = await buildConfirmationMap();
      const heatmap = buildThreatProjectHeatmap(threatModel, projects, coverageReport, {
        threatIdPrefix: args.threatIdPrefix,
        projectIds: args.projectIds,
        maxThreats: args.maxThreats,
        maxProjects: args.maxProjects,
        confirmationMap,
      });

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "get_threat_coverage_heatmap",
        status: "success",
        metadata: {
          rows: heatmap.axes.rowIds.length,
          cols: heatmap.axes.colIds.length,
          cells: heatmap.cells.length,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(heatmap, null, 2),
          },
        ],
      };
    },
  );

  // ── Generate Report ──

  registerTool(
    "generate_report",
    {
      description:
        "Generate a research report document covering test suite health, " +
        "risk signals, threat coverage, and actionable recommendations.",
      inputSchema: z.object({
        projectIds: z
          .array(z.string())
          .optional()
          .describe("Scope to specific projects (default: all)"),
        publish: z.boolean().optional().default(false).describe("Also save to Documentation/docs/"),
        includeEcosystemContext: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include cross-server ecosystem context (Echoes, Seeds)"),
        includeGruffSvg: z
          .boolean()
          .optional()
          .describe(
            "Append GRUFF SVG threat×project grid (default: ORI_REPORT_GRUFF_SVG env, else off)",
          ),
      }),
    },
    async (args: {
      projectIds?: string[];
      publish?: boolean;
      includeEcosystemContext?: boolean;
      includeGruffSvg?: boolean;
    }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();

      const allProjects = await listProjects();
      const projects = args.projectIds
        ? allProjects.filter((p) => args.projectIds!.includes(p.id))
        : allProjects;

      // Gather recent runs
      const { runs: allRuns } = await listRuns({ limit: 100 });
      const runs = args.projectIds
        ? allRuns.filter((r) => args.projectIds!.includes(r.projectId))
        : allRuns;

      // Load threat model and coverage
      let threatModel;
      let coverageReport;
      try {
        threatModel = await loadThreatModel();
        coverageReport = buildCoverageMap(projects, threatModel);
      } catch {
        // Threat model not available — report without it
      }

      // Generate recommendations from recent logs
      const allLogs = await readAllLogs();
      const scopedLogs = args.projectIds
        ? allLogs.filter((e) => args.projectIds!.includes(e.source))
        : allLogs;
      const probe = runProbe(scopedLogs, "report");
      let recs;
      if (threatModel) {
        recs = generateThreatAwareRecommendations(
          probe,
          scopedLogs,
          threatModel.threats,
          args.projectIds,
        );
      } else {
        recs = generateRecommendations(probe, scopedLogs);
      }

      const ecosystemContext = args.includeEcosystemContext
        ? await collectEcosystemContext()
        : undefined;

      const data: ReportData = {
        projects,
        runs,
        threatModel,
        coverageReport,
        recommendations: recs.map((r) => ({
          title: r.title,
          severity: r.severity,
          read: r.read,
          reason: r.reason,
          action: r.action,
        })),
        ecosystemContext,
      };

      const result = await generateReport(data, {
        publish: args.publish,
        includeGruffSvg: args.includeGruffSvg,
      });

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "generate_report",
        status: "success",
        metadata: {
          projectCount: projects.length,
          runCount: runs.length,
          sections: result.sections,
          published: args.publish ?? false,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                reportPath: result.reportPath,
                gruffSvgPath: result.gruffSvgPath ?? null,
                sections: result.sections,
                totalLines: result.totalLines,
                projectCount: projects.length,
                runCount: runs.length,
                recommendationCount: recs.length,
                threatsCovered: coverageReport?.threatsWithCoverage ?? 0,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Get Coverage Gaps ──

  registerTool(
    "get_coverage_gaps",
    {
      description:
        "Identify threat coverage gaps: threats without test coverage, " +
        "or projects under threat with no recent healthy run.",
      inputSchema: z.object({}),
    },
    async () => {
      const span = createRootSpan();
      await ensureDataDirs();
      const threatModel = await loadThreatModel();
      const projects = await listProjects();
      const coverageReport = buildCoverageMap(projects, threatModel);

      const gaps = coverageReport.mappings.filter((m) => m.uncoveredGaps.length > 0);

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "get_coverage_gaps",
        status: "success",
        metadata: {
          totalThreats: coverageReport.totalThreats,
          gapCount: gaps.length,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalThreats: coverageReport.totalThreats,
                threatsWithGaps: gaps.length,
                gaps: gaps.map((g) => ({
                  threatId: g.threatId,
                  priority: g.priority,
                  coveredByProjects: g.coveredByProjects,
                  issues: g.uncoveredGaps,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Notebook Add ──

  registerTool(
    "notebook_add",
    {
      description:
        "Add an observation, decision, anomaly, trend, or cross-run-context note " +
        "to the persistent notebook. Each note is timestamped and tagged for retrieval.",
      inputSchema: z.object({
        category: z
          .enum(["observation", "decision", "anomaly", "trend", "cross-run-context"])
          .describe("Note category"),
        title: z.string().min(1).describe("Short title for the note"),
        body: z.string().min(1).describe("Note content"),
        tags: z.array(z.string()).optional().default([]).describe("Tags for filtering"),
        projectId: z.string().optional().describe("Associated project ID"),
      }),
    },
    async (args: {
      category: NoteCategory;
      title: string;
      body: string;
      tags?: string[];
      projectId?: string;
    }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      await ensureDataDirs();
      const note = await appendNote({
        category: args.category,
        title: args.title,
        body: args.body,
        tags: args.tags ?? [],
        projectId: args.projectId,
        source: "user",
      });

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "notebook_add",
        status: "success",
        metadata: { noteId: note.id, category: note.category },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: note.id,
                timestamp: note.timestamp,
                category: note.category,
                title: note.title,
                tags: note.tags,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Notebook Query ──

  registerTool(
    "notebook_query",
    {
      description:
        "Query the persistent notebook by category, tags, project, or time range. " +
        "Returns matching notes, most recent first.",
      inputSchema: z.object({
        category: z
          .enum(["observation", "decision", "anomaly", "trend", "cross-run-context"])
          .optional()
          .describe("Filter by category"),
        tags: z.array(z.string()).optional().describe("Filter by tags (match any)"),
        projectId: z.string().optional().describe("Filter by project ID"),
        since: z.string().optional().describe("ISO timestamp lower bound"),
        until: z.string().optional().describe("ISO timestamp upper bound"),
        limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
      }),
    },
    async (args: {
      category?: NoteCategory;
      tags?: string[];
      projectId?: string;
      since?: string;
      until?: string;
      limit?: number;
    }) => {
      await ensureDataDirs();
      const notes = await queryNotes({
        category: args.category,
        tags: args.tags,
        projectId: args.projectId,
        since: args.since,
        until: args.until,
        limit: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: notes.length,
                notes: notes.map((n) => ({
                  id: n.id,
                  timestamp: n.timestamp,
                  category: n.category,
                  title: n.title,
                  body: n.body.slice(0, 500),
                  tags: n.tags,
                  projectId: n.projectId,
                  source: n.source,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Notebook Summary ──

  registerTool(
    "notebook_summary",
    {
      description:
        "Get an overview of the notebook state: total notes, breakdown by category " +
        "and source, unique projects and tags.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();
      const summary = await getNotebookSummary();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );

  // ── Ecosystem Context ──

  registerTool(
    "ecosystem_context",
    {
      description:
        "Aggregated cross-server context: Echoes audit trail summary and " +
        "Seeds ecosystem health snapshot. Read-only, graceful when data is unavailable.",
      inputSchema: z.object({
        includeRecentEvents: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include individual recent audit events"),
      }),
    },
    async (args: { includeRecentEvents?: boolean }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      const context = await collectEcosystemContext();

      const payload: Record<string, unknown> = {
        collectedAt: context.collectedAt,
        echoes: {
          totalEvents: context.echoes.totalEvents,
          sourceBreakdown: context.echoes.sourceBreakdown,
          ...(args.includeRecentEvents ? { recentEvents: context.echoes.recentEvents } : {}),
        },
        seeds: {
          snapshotCount: context.seeds.snapshotCount,
          latestSnapshot: context.seeds.latestSnapshot
            ? {
                overallScore: context.seeds.latestSnapshot.overallScore,
                repoCount: context.seeds.latestSnapshot.repos.length,
                timestamp: context.seeds.latestSnapshot.timestamp,
              }
            : null,
        },
      };

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "ecosystem_context",
        status: "success",
        metadata: {
          echoesEvents: context.echoes.totalEvents,
          seedsAvailable: context.seeds.latestSnapshot !== null,
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

  // ── Configure Routes ──

  registerTool(
    "configure_routes",
    {
      description:
        "View, update, add, remove, or reset signal router routes. " +
        "The router automatically evaluates incoming log signals against configured routes " +
        "and fires actions (probe, note, recommend, audit) when thresholds cross.",
      inputSchema: z.object({
        action: z
          .enum(["list", "get", "enable", "disable", "update", "add", "remove", "reset"])
          .describe("Operation to perform"),
        routeId: z
          .string()
          .optional()
          .describe("Route ID (required for get/enable/disable/update/remove)"),
        route: z
          .object({
            id: z.string(),
            name: z.string(),
            enabled: z.boolean(),
            trigger: z.object({
              patternIds: z.array(z.string()),
              severities: z.array(z.enum(["critical", "warning", "info", "unknown"])).optional(),
              sources: z.array(z.string()).optional(),
              threshold: z.number().min(1),
              windowMinutes: z.number().min(1),
              cooldownMinutes: z.number().min(1),
            }),
            actions: z.array(z.any()),
          })
          .optional()
          .describe("Full route definition (required for add)"),
        trigger: z
          .object({
            patternIds: z.array(z.string()).optional(),
            severities: z.array(z.enum(["critical", "warning", "info", "unknown"])).optional(),
            sources: z.array(z.string()).optional(),
            threshold: z.number().min(1).optional(),
            windowMinutes: z.number().min(1).optional(),
            cooldownMinutes: z.number().min(1).optional(),
          })
          .optional()
          .describe("Partial trigger update (for update action)"),
      }),
    },
    async (args: { action: string; routeId?: string; route?: any; trigger?: any }) => {
      await ensureDataDirs();

      try {
        switch (args.action) {
          case "list": {
            const config = await loadRouterConfig();
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      schemaVersion: config.schemaVersion,
                      updatedAt: config.updatedAt,
                      routeCount: config.routes.length,
                      routes: config.routes.map((r) => ({
                        id: r.id,
                        name: r.name,
                        enabled: r.enabled,
                        threshold: r.trigger.threshold,
                        windowMinutes: r.trigger.windowMinutes,
                        cooldownMinutes: r.trigger.cooldownMinutes,
                        actionCount: r.actions.length,
                      })),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "get": {
            if (!args.routeId)
              return {
                content: [{ type: "text" as const, text: '{"error": "routeId required"}' }],
                isError: true,
              };
            const config = await loadRouterConfig();
            const route = config.routes.find((r) => r.id === args.routeId);
            if (!route)
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: `Route '${args.routeId}' not found` }),
                  },
                ],
                isError: true,
              };
            return {
              content: [{ type: "text" as const, text: JSON.stringify(route, null, 2) }],
            };
          }

          case "enable":
          case "disable": {
            if (!args.routeId)
              return {
                content: [{ type: "text" as const, text: '{"error": "routeId required"}' }],
                isError: true,
              };
            const result = await updateRoute(args.routeId, {
              enabled: args.action === "enable",
            });
            if (!result)
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: `Route '${args.routeId}' not found` }),
                  },
                ],
                isError: true,
              };
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { updated: true, routeId: args.routeId, enabled: args.action === "enable" },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "update": {
            if (!args.routeId)
              return {
                content: [{ type: "text" as const, text: '{"error": "routeId required"}' }],
                isError: true,
              };
            const patch: any = {};
            if (args.trigger) patch.trigger = args.trigger;
            const result = await updateRoute(args.routeId, patch);
            if (!result)
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: `Route '${args.routeId}' not found` }),
                  },
                ],
                isError: true,
              };
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ updated: true, routeId: args.routeId }, null, 2),
                },
              ],
            };
          }

          case "add": {
            if (!args.route)
              return {
                content: [
                  { type: "text" as const, text: '{"error": "route definition required"}' },
                ],
                isError: true,
              };
            const config = await addRoute(args.route);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { added: true, routeId: args.route.id, totalRoutes: config.routes.length },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "remove": {
            if (!args.routeId)
              return {
                content: [{ type: "text" as const, text: '{"error": "routeId required"}' }],
                isError: true,
              };
            const config = await removeRoute(args.routeId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { removed: true, routeId: args.routeId, totalRoutes: config.routes.length },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "reset": {
            const config = await resetRoutes();
            resetRouterState();
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ reset: true, routeCount: config.routes.length }, null, 2),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: `Unknown action: ${args.action}` }),
                },
              ],
              isError: true,
            };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  // ── Router Status ──

  registerTool(
    "router_status",
    {
      description:
        "Get the current signal router state — configured routes, runtime hit counts, " +
        "cooldown status, and last-fired timestamps. Diagnostic tool for monitoring " +
        "the automatic signal routing system.",
      inputSchema: z.object({}),
    },
    async () => {
      await ensureDataDirs();

      const config = await loadRouterConfig();
      const runtimeState = getRouterState();

      const routes = config.routes.map((route) => {
        const state = runtimeState[route.id];
        return {
          id: route.id,
          name: route.name,
          enabled: route.enabled,
          trigger: {
            threshold: route.trigger.threshold,
            windowMinutes: route.trigger.windowMinutes,
            cooldownMinutes: route.trigger.cooldownMinutes,
            severities: route.trigger.severities,
            patternIds: route.trigger.patternIds.length > 0 ? route.trigger.patternIds : "any",
          },
          actionTypes: route.actions.map((a) => a.type),
          runtime: state
            ? {
                hitsInWindow: state.hits.length,
                lastFiredAt: state.lastFiredAt ?? null,
                inCooldown: state.lastFiredAt
                  ? Date.now() - new Date(state.lastFiredAt).getTime() <
                    route.trigger.cooldownMinutes * 60_000
                  : false,
              }
            : { hitsInWindow: 0, lastFiredAt: null, inCooldown: false },
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                schemaVersion: config.schemaVersion,
                configUpdatedAt: config.updatedAt,
                totalRoutes: config.routes.length,
                enabledRoutes: config.routes.filter((r) => r.enabled).length,
                routes,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Chain Update Proposal ──

  registerTool(
    "chain_update_proposal",
    {
      description:
        "Read recent notebook 'decision' entries and propose a unified diff against " +
        "~/.claude/registry/chain.yaml. The output is a patch that adds or updates " +
        "workstream routing rules based on observed decisions. The diff is NOT applied " +
        "automatically — Prince reviews and merges it.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .default(10)
          .describe("Number of recent decision entries to analyse (default 10)"),
      }),
    },
    async (args: { limit?: number }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();

      await ensureDataDirs();
      const decisions = await queryNotes({
        category: "decision",
        limit: args.limit ?? 10,
      });

      if (decisions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No decision entries found in the notebook. Write some Stage 6 reports and try again.",
            },
          ],
        };
      }

      // Extract workstream signals from decision titles and tags
      const workstreamMentions: Record<string, string[]> = {};
      for (const note of decisions) {
        for (const tag of note.tags) {
          if (tag.startsWith("cmd-")) {
            const cmd = tag.slice(4);
            if (!workstreamMentions[cmd]) workstreamMentions[cmd] = [];
            workstreamMentions[cmd].push(note.title);
          }
          // Also catch row-N tags which associate with the current implementation
          if (tag.startsWith("row-")) {
            const rowNum = tag.slice(4);
            const ws = "implementation";
            if (!workstreamMentions[ws]) workstreamMentions[ws] = [];
            workstreamMentions[ws].push(`row-${rowNum}: ${note.title}`);
          }
        }
      }

      const chainYamlPath = `${process.env.HOME ?? config.cascadeRoot}/.claude/registry/chain.yaml`;

      const mentionLines = Object.entries(workstreamMentions)
        .map(([cmd, titles]) => `  # ${cmd}: ${titles.slice(0, 2).join(" | ")}`)
        .join("\n");

      const proposal = [
        `--- a/${chainYamlPath}`,
        `+++ b/${chainYamlPath}`,
        `@@ -# chain_update_proposal output (review before applying) @@`,
        ``,
        `# Signals extracted from ${decisions.length} notebook decision entries:`,
        mentionLines || "  # (no workstream tags found — add cmd-* tags to notebook entries)",
        ``,
        `# Proposed additions (copy into chain.yaml after review):`,
        `#`,
        `# If a new workstream pattern emerged, add a new entry to the`,
        `# workstreams array in ~/.claude/registry/chain.yaml following`,
        `# the schema, then run: node scripts/registry-build.mjs`,
        `#`,
        `# Most recent decision entries referenced:`,
        ...decisions
          .slice(0, 5)
          .map((n) => `#   [${n.timestamp.slice(0, 10)}] ${n.title} (${n.tags.join(", ")})`),
      ].join("\n");

      emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "chain_update_proposal",
        status: "success",
        metadata: {
          decisionsAnalysed: decisions.length,
          workstreamSignals: Object.keys(workstreamMentions).length,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: proposal,
          },
        ],
      };
    },
  );

  return server;
}

// ── Main ──

async function main() {
  const server = buildServer();
  await ensureDataDirs();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err);
  process.exit(1);
});

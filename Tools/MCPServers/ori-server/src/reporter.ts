/**
 * Report generator — produces markdown research reports
 * following the CASCADEPROJECTS_RESEARCH_REPORT format.
 *
 * Design principle: conditional data transfer.
 * Each section is a self-contained glimpse context — independently readable,
 * fact-anchored, and only rendered when its data crosses a significance threshold.
 * No padding prose. No cross-section prose dependencies.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import { buildThreatProjectHeatmap } from "./heatmap.js";
import { renderGruffGeometrySvg } from "./geometry-box.js";
import type { ProjectEntry, TestRunResult } from "./types.js";
import type { CoverageReport, ThreatModel } from "./threat-model.js";
import type { EcosystemContext } from "./interop.js";

const config = getConfig();

export interface ReportOptions {
  projectIds?: string[];
  includeRawLogs?: boolean;
  includeEcosystemContext?: boolean;
  publish?: boolean;
  outputPath?: string;
  /**
   * When true, writes a companion `-gruff.svg` next to the report and appends a GRUFF section.
   * Default: `ORI_REPORT_GRUFF_SVG` env (`1` / `true` / `yes`) or false.
   */
  includeGruffSvg?: boolean;
}

export interface ReportData {
  projects: ProjectEntry[];
  runs: TestRunResult[];
  threatModel?: ThreatModel;
  coverageReport?: CoverageReport;
  recommendations?: Array<{
    title: string;
    severity: string;
    read: string;
    reason: string;
    action: string;
  }>;
  ecosystemContext?: EcosystemContext;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function wantGruffSvg(options?: ReportOptions): boolean {
  if (options?.includeGruffSvg !== undefined) return options.includeGruffSvg;
  const v = process.env.ORI_REPORT_GRUFF_SVG?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Markdown fragment + SVG filename (basename) written beside the report. */
function buildGruffAppend(
  data: ReportData,
  reportBasename: string,
): { fragment: string; svg: string; svgBasename: string } | null {
  if (!data.threatModel || !data.coverageReport || data.projects.length === 0) {
    return null;
  }
  const heatmap = buildThreatProjectHeatmap(data.threatModel, data.projects, data.coverageReport);
  const svg = renderGruffGeometrySvg(heatmap, {
    title: `GRUFF — ${data.threatModel.threats.length} threats × ${data.projects.length} projects`,
  });
  const stem = reportBasename.replace(/\.md$/i, "");
  const svgBasename = `${stem}-gruff.svg`;
  const fragment = `

## Threat × project (GRUFF)

![GRUFF threat×project grid](${svgBasename})

*Companion vector file: \`${svgBasename}\` (same directory as this report).*
`;
  return { fragment, svg, svgBasename };
}

// ── Section generators ──

function renderHeader(data: ReportData): string {
  const threatCount = data.threatModel?.threats.length ?? 0;
  const projectNames = data.projects.map((p) => p.name);
  const projectsStr =
    projectNames.length === 0
      ? "no projects"
      : projectNames.length <= 3
        ? projectNames.join(", ")
        : `${projectNames.slice(0, 3).join(", ")} +${projectNames.length - 3} more`;

  return `# CascadeProjects Research Report — ${todayDate()}

**Scope**: ${projectsStr}
**Runs included**: ${data.runs.length}${
    threatCount > 0 ? `  \n**Threats mapped**: ${threatCount}` : ""
  }

---`;
}

/**
 * Bullet executive summary — factual claims, each self-contained.
 * No prose. No filler. Only renders if there is signal to report.
 */
function renderExecutiveSummary(data: ReportData): string {
  const bullets: string[] = [];

  for (const run of data.runs) {
    const proj = data.projects.find((p) => p.id === run.projectId);
    const name = proj?.name ?? run.projectId;
    const dur =
      run.summary.durationMs >= 1000
        ? `${(run.summary.durationMs / 1000).toFixed(1)}s`
        : `${run.summary.durationMs}ms`;

    if (run.status === "passed") {
      bullets.push(`✓ **${name}**: ${run.summary.passed} passed (${dur})`);
    } else if (run.status === "timeout") {
      bullets.push(`⏱ **${name}**: timed out after ${dur}`);
    } else {
      const detail = run.errorMessage ? ` — ${run.errorMessage.slice(0, 120)}` : "";
      bullets.push(
        `✗ **${name}**: ${run.summary.failed} failed / ${run.summary.passed} passed (${dur})${detail}`,
      );
    }
  }

  for (const proj of data.projects) {
    const hasRun = data.runs.some((r) => r.projectId === proj.id);
    if (!hasRun && proj.healthStatus && proj.healthStatus !== "unknown") {
      const icon =
        proj.healthStatus === "healthy" ? "✓" : proj.healthStatus === "degraded" ? "⚠" : "✗";
      bullets.push(`${icon} **${proj.name}**: ${proj.healthStatus} (no run in this cycle)`);
    }
  }

  if (data.coverageReport) {
    const gaps = data.coverageReport.mappings.filter((m) => m.uncoveredGaps.length > 0);
    if (gaps.length > 0) {
      const highGaps = gaps.filter((g) => g.priority?.toLowerCase() === "high");
      const gapIds = (highGaps.length > 0 ? highGaps : gaps)
        .slice(0, 3)
        .map((g) => g.threatId)
        .join(", ");
      bullets.push(`⚠ **Threat gap**: ${gapIds} — no healthy coverage`);
    }
  }

  if (data.ecosystemContext?.seeds.latestSnapshot) {
    const score = data.ecosystemContext.seeds.latestSnapshot.overallScore;
    if (score < 70) {
      bullets.push(`↓ **Ecosystem score**: ${score} (below 70 threshold)`);
    }
  }

  if (bullets.length === 0) return "";

  return `## Executive Summary\n\n${bullets.map((b) => `- ${b}`).join("\n")}`;
}

/**
 * Test suite health table.
 * Reader profile: "What's passing / failing right now?"
 * Threshold: only if ≥1 project has a run result or non-healthy state.
 */
function renderTestSuiteHealth(data: ReportData): string {
  const hasRunResults = data.runs.length > 0;
  const hasNonHealthy = data.projects.some(
    (p) => p.healthStatus && p.healthStatus !== "unknown" && p.healthStatus !== "healthy",
  );

  if (!hasRunResults && !hasNonHealthy) return "";

  let section = `## Test Suite Health\n\n`;
  section += `| Project | Status | Passed | Failed | Skipped | Duration | Timestamp |\n`;
  section += `|---------|--------|-------:|-------:|--------:|----------|-----------|\n`;

  for (const project of data.projects) {
    const run = data.runs.find((r) => r.projectId === project.id);
    if (run) {
      const dur =
        run.summary.durationMs >= 1000
          ? `${(run.summary.durationMs / 1000).toFixed(1)}s`
          : `${run.summary.durationMs}ms`;
      const statusIcon =
        run.status === "passed" ? "✓ passed" : run.status === "timeout" ? "⏱ timeout" : "✗ failed";
      section += `| ${project.name} | ${statusIcon} | ${run.summary.passed} | ${
        run.summary.failed
      } | ${run.summary.skipped} | ${dur} | ${run.timestamp.slice(0, 16)} |\n`;
    } else if (project.healthStatus && project.healthStatus !== "unknown") {
      const icon =
        project.healthStatus === "healthy" ? "✓" : project.healthStatus === "degraded" ? "⚠" : "✗";
      const lastRun = project.lastRunTimestamp ? project.lastRunTimestamp.slice(0, 16) : "never";
      section += `| ${project.name} | ${icon} ${project.healthStatus} | — | — | — | — | ${lastRun} |\n`;
    }
  }

  return section;
}

/**
 * Risk signal analysis — named failures with specific excerpts.
 * Reader profile: "What signals should I investigate?"
 * Threshold: only if ≥1 failed run with errorMessage, or risk signals > 0.
 */
function renderRiskSignalAnalysis(data: ReportData): string {
  const failedRuns = data.runs.filter((r) => r.status === "failed" || r.status === "error");
  const totalSignals = data.runs.reduce((s, r) => s + r.logEntriesCreated, 0);

  if (failedRuns.length === 0 && totalSignals === 0) return "";

  let section = `## Risk Signal Analysis\n\n`;

  if (failedRuns.length > 0) {
    section += `### Failing Suites\n\n`;
    for (const run of failedRuns) {
      const proj = data.projects.find((p) => p.id === run.projectId);
      const name = proj?.name ?? run.projectId;
      section += `**\`${name}\`** — ${run.summary.failed} failed, ${run.summary.errors} errors`;
      if (run.errorMessage) {
        section += `\n> ${run.errorMessage.slice(0, 300)}`;
      }
      section += `\n\n`;
    }
  }

  if (totalSignals > 0) {
    const timeoutRuns = data.runs.filter((r) => r.status === "timeout");
    section += `**Signals captured**: ${totalSignals} log entries across ${data.runs.length} run(s)`;
    if (timeoutRuns.length > 0) {
      const names = timeoutRuns
        .map((r) => data.projects.find((p) => p.id === r.projectId)?.name ?? r.projectId)
        .join(", ");
      section += `  \n**Timed out**: ${names}`;
    }
    section += `\n`;
  }

  return section;
}

/**
 * Threat coverage — gap table showing only threats with actual gaps.
 * Reader profile: "Is the system covered before release?"
 * Threshold: only if ≥1 threat has an uncovered gap.
 */
function renderThreatCoverage(data: ReportData): string {
  if (!data.coverageReport || !data.threatModel) return "";

  const gaps = data.coverageReport.mappings.filter((m) => m.uncoveredGaps.length > 0);
  const covered = data.coverageReport.mappings.filter((m) => m.uncoveredGaps.length === 0);

  if (gaps.length === 0) return "";

  let section = `## Threat Coverage\n\n`;
  section += `**${covered.length}/${data.coverageReport.totalThreats} threats covered** — ${gaps.length} gap(s) require attention.\n\n`;

  section += `| Threat | Priority | Covered By | Gap |\n`;
  section += `|--------|----------|------------|-----|\n`;

  for (const gap of gaps) {
    const coverStr =
      gap.coveredByProjects.length > 0 ? gap.coveredByProjects.join(", ") : "unmapped";
    section += `| ${gap.threatId} | ${gap.priority} | ${coverStr} | ${gap.uncoveredGaps[0].slice(
      0,
      80,
    )} |\n`;
  }

  if (covered.length > 0) {
    const coveredIds = covered.map((m) => m.threatId).join(", ");
    section += `\n*Covered: ${coveredIds}*\n`;
  }

  return section;
}

/**
 * Recommendations — numbered action list with severity prefix.
 * Reader profile: "What should I do?"
 * Threshold: only if ≥1 recommendation with severity "critical" or "warning".
 */
function renderRecommendations(data: ReportData): string {
  if (!data.recommendations || data.recommendations.length === 0) return "";

  const actionable = data.recommendations.filter(
    (r) => r.severity === "critical" || r.severity === "warning",
  );

  if (actionable.length === 0) return "";

  let section = `## Recommendations\n\n`;

  actionable.slice(0, 5).forEach((rec, i) => {
    const prefix = rec.severity === "critical" ? "🔴" : "🟡";
    section += `**${i + 1}. ${prefix} ${rec.title}**\n\n`;
    section += `> ${rec.read}\n\n`;
    section += `**Why**: ${rec.reason}  \n`;
    section += `**Do**: ${rec.action}\n\n`;
  });

  return section;
}

/**
 * Ecosystem context — Seeds score + notable Echoes activity.
 * Reader profile: "How is the broader system doing?"
 * Threshold: only if seeds score < 70, OR echoes events from analyzed projects exist.
 */
function renderEcosystemContext(data: ReportData): string {
  if (!data.ecosystemContext) return "";

  const ctx = data.ecosystemContext;
  const snap = ctx.seeds.latestSnapshot;
  const seedsBelowThreshold = snap && snap.overallScore < 70;
  const analyzedIds = new Set(data.projects.map((p) => p.id));
  const relevantEvents = ctx.echoes.recentEvents.filter((e) => analyzedIds.has(e.source));

  if (!seedsBelowThreshold && relevantEvents.length === 0) return "";

  let section = `## Ecosystem Context\n\n`;

  if (snap) {
    const unhealthy = snap.repos.filter((r) => r.healthScore < 50);
    section += `**Seeds score**: ${snap.overallScore}${
      snap.overallScore < 70 ? " ⚠ below threshold" : ""
    }`;
    if (unhealthy.length > 0) {
      section += `  \n**Repos below 50**: ${unhealthy
        .map((r) => `${r.name} (${r.healthScore})`)
        .join(", ")}`;
    }
    section += `\n`;
  }

  if (relevantEvents.length > 0) {
    const byTool = new Map<string, number>();
    for (const e of relevantEvents) {
      byTool.set(e.tool, (byTool.get(e.tool) ?? 0) + 1);
    }
    const top = [...byTool.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, n]) => `${t} (${n})`)
      .join(", ");
    section += `**Audit activity**: ${top}\n`;
  }

  section += `\n*Collected at ${ctx.collectedAt.slice(0, 16)}*\n`;

  return section;
}

/**
 * Key insights — only if ≥2 cross-signal patterns synthesize.
 * Reader profile: "What non-obvious pattern matters?"
 * Threshold: only renders with ≥2 distinct insights.
 */
function renderKeyInsights(data: ReportData): string {
  const insights: string[] = [];

  const totalTests = data.runs.reduce(
    (s, r) => s + r.summary.passed + r.summary.failed + r.summary.skipped,
    0,
  );
  const failedRuns = data.runs.filter((r) => r.status !== "passed" && r.status !== "timeout");
  const timeoutRuns = data.runs.filter((r) => r.status === "timeout");

  if (totalTests > 0 && data.runs.length > 1) {
    const totalPassed = data.runs.reduce((s, r) => s + r.summary.passed, 0);
    const totalAll = data.runs.reduce((s, r) => s + r.summary.passed + r.summary.failed, 0);
    const passRate = totalAll > 0 ? totalPassed / totalAll : 1;
    if (passRate < 0.9) {
      insights.push(
        `Suite-wide pass rate ${(passRate * 100).toFixed(
          0,
        )}% — below the 90% stability threshold across ${data.runs.length} projects.`,
      );
    }
  }

  if (timeoutRuns.length > 0) {
    insights.push(
      `${timeoutRuns.length} suite(s) timed out — consider raising timeout limits or profiling test setup cost.`,
    );
  }

  if (data.coverageReport) {
    const criticalGaps = data.coverageReport.mappings.filter(
      (m) =>
        m.uncoveredGaps.length > 0 &&
        (m.priority?.toLowerCase() === "high" || m.priority?.toLowerCase() === "critical"),
    );
    if (criticalGaps.length > 0) {
      insights.push(
        `${criticalGaps.length} high-priority threat(s) (${criticalGaps
          .map((g) => g.threatId)
          .join(", ")}) have no healthy test coverage.`,
      );
    }
  }

  if (
    data.ecosystemContext?.seeds.latestSnapshot &&
    data.ecosystemContext.seeds.latestSnapshot.overallScore < 70 &&
    failedRuns.length > 0
  ) {
    insights.push(
      `Ecosystem score (${data.ecosystemContext.seeds.latestSnapshot.overallScore}) and test failures are co-occurring — indicates systemic stress rather than isolated regressions.`,
    );
  }

  if (insights.length < 2) return "";

  return `## Key Insights\n\n${insights.map((i) => `- ${i}`).join("\n")}`;
}

// ── Main generator ──

export function renderReport(data: ReportData): string {
  const sections = [
    renderHeader(data),
    renderExecutiveSummary(data),
    renderTestSuiteHealth(data),
    renderRiskSignalAnalysis(data),
    renderThreatCoverage(data),
    renderRecommendations(data),
    renderEcosystemContext(data),
    renderKeyInsights(data),
  ];

  return sections.filter((s) => s.length > 0).join("\n\n") + "\n";
}

function countH2Sections(markdown: string): number {
  return (markdown.match(/^## /gm) ?? []).length;
}

/**
 * Generate and save a report.
 */
export async function generateReport(
  data: ReportData,
  options?: ReportOptions,
): Promise<{ reportPath: string; sections: number; totalLines: number; gruffSvgPath?: string }> {
  await fs.mkdir(config.reportsDir, { recursive: true });
  const filename = options?.outputPath ?? `${todayDate()}-report.md`;
  const reportPath = path.join(config.reportsDir, filename);

  let markdown = renderReport(data);
  let gruffSvgPath: string | undefined;

  if (wantGruffSvg(options)) {
    const gruff = buildGruffAppend(data, filename);
    if (gruff) {
      const svgFullPath = path.join(config.reportsDir, gruff.svgBasename);
      await fs.writeFile(svgFullPath, gruff.svg, "utf-8");
      gruffSvgPath = svgFullPath;
      markdown += gruff.fragment;
    }
  }

  const lines = markdown.split("\n").length;
  const sections = countH2Sections(markdown);

  await fs.writeFile(reportPath, markdown, "utf-8");

  if (options?.publish) {
    const docsDir = path.join(config.cascadeRoot, "Documentation/docs");
    try {
      await fs.access(docsDir);
      const pubPath = path.join(docsDir, `ORI_RESEARCH_REPORT_${todayDate()}.md`);
      await fs.writeFile(pubPath, markdown, "utf-8");
      if (gruffSvgPath) {
        const pubSvg = path.join(docsDir, path.basename(gruffSvgPath));
        await fs.copyFile(gruffSvgPath, pubSvg);
      }
    } catch {
      // Docs dir doesn't exist — skip publish
    }
  }

  return { reportPath, sections, totalLines: lines, gruffSvgPath };
}

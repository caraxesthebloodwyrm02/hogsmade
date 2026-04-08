/**
 * Report generator — produces markdown research reports
 * following the CASCADEPROJECTS_RESEARCH_REPORT format.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
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

// ── Section generators ──

function renderHeader(data: ReportData): string {
  const projectCount = data.projects.length;
  const runCount = data.runs.length;
  const threatCount = data.threatModel?.threats.length ?? 0;
  const confidence = runCount > 0 ? "High (based on live test execution)" : "Medium (no recent test runs)";

  return `# Research Report: CascadeProjects Test Suite Analysis

**Date**: ${todayDate()}
**Projects Analyzed**: ${projectCount}
**Test Runs**: ${runCount}
**Threats Mapped**: ${threatCount}
**Confidence Level**: ${confidence}

---`;
}

function renderExecutiveSummary(data: ReportData): string {
  const totalPassed = data.runs.reduce((s, r) => s + r.summary.passed, 0);
  const totalFailed = data.runs.reduce((s, r) => s + r.summary.failed, 0);
  const totalSkipped = data.runs.reduce((s, r) => s + r.summary.skipped, 0);
  const passRate = totalPassed + totalFailed > 0
    ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)
    : "N/A";
  const failingProjects = data.runs.filter((r) => r.status !== "passed");
  const healthyProjects = data.runs.filter((r) => r.status === "passed");

  let summary = `## Executive Summary\n\n`;
  summary += `Across ${data.projects.length} registered projects, `;

  if (data.runs.length > 0) {
    summary += `${data.runs.length} test suite(s) were executed. `;
    summary += `**${healthyProjects.length}** passed, **${failingProjects.length}** failed or errored. `;
    summary += `Overall pass rate: **${passRate}%** (${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped).`;
  } else {
    summary += `no test runs were included in this report cycle.`;
  }

  if (data.coverageReport) {
    const gaps = data.coverageReport.threatsWithoutCoverage;
    if (gaps > 0) {
      summary += `\n\n**Threat coverage gap**: ${gaps} of ${data.coverageReport.totalThreats} threats have no project mapping.`;
    }
  }

  if (failingProjects.length > 0) {
    summary += `\n\n**Failing projects**: ${failingProjects.map((r) => `\`${r.projectId}\``).join(", ")}`;
  }

  return summary;
}

function renderTestSuiteHealth(data: ReportData): string {
  if (data.runs.length === 0 && data.projects.length === 0) return "";

  let section = `## Test Suite Health\n\n`;
  section += `| Project | Status | Passed | Failed | Skipped | Duration | Last Run |\n`;
  section += `|---------|--------|--------|--------|---------|----------|----------|\n`;

  for (const project of data.projects) {
    const run = data.runs.find((r) => r.projectId === project.id);
    if (run) {
      const durStr = run.summary.durationMs > 1000
        ? `${(run.summary.durationMs / 1000).toFixed(1)}s`
        : `${run.summary.durationMs}ms`;
      section += `| ${project.name} | ${run.status} | ${run.summary.passed} | ${run.summary.failed} | ${run.summary.skipped} | ${durStr} | ${run.timestamp.slice(0, 16)} |\n`;
    } else {
      const status = project.healthStatus ?? "unknown";
      const lastRun = project.lastRunTimestamp ? project.lastRunTimestamp.slice(0, 16) : "never";
      section += `| ${project.name} | ${status} | - | - | - | - | ${lastRun} |\n`;
    }
  }

  return section;
}

function renderRiskSignalAnalysis(data: ReportData): string {
  if (data.runs.length === 0) return "";

  const totalSignals = data.runs.reduce((s, r) => s + r.logEntriesCreated, 0);
  const failedRuns = data.runs.filter((r) => r.status === "failed" || r.status === "error");

  let section = `## Risk Signal Analysis\n\n`;
  section += `- **Total risk signals captured**: ${totalSignals} across ${data.runs.length} run(s)\n`;
  section += `- **Runs with failures**: ${failedRuns.length}\n`;

  if (failedRuns.length > 0) {
    section += `\n### Failing Runs\n\n`;
    for (const run of failedRuns) {
      section += `- **${run.projectId}**: ${run.summary.failed} failed, ${run.summary.errors} errors`;
      if (run.errorMessage) section += ` — ${run.errorMessage.slice(0, 200)}`;
      section += `\n`;
    }
  }

  return section;
}

function renderThreatCoverage(data: ReportData): string {
  if (!data.coverageReport || !data.threatModel) return "";

  let section = `## Threat Coverage\n\n`;
  section += `| Threat | Priority | Covered By | Gaps |\n`;
  section += `|--------|----------|-----------|------|\n`;

  for (const mapping of data.coverageReport.mappings) {
    const threat = data.threatModel.threats.find((t) => t.id === mapping.threatId);
    const coveredStr = mapping.coveredByProjects.length > 0
      ? mapping.coveredByProjects.join(", ")
      : "none";
    const gapStr = mapping.uncoveredGaps.length > 0
      ? mapping.uncoveredGaps.join("; ")
      : "covered";
    section += `| ${mapping.threatId} | ${mapping.priority} | ${coveredStr} | ${gapStr} |\n`;
  }

  section += `\n**Coverage**: ${data.coverageReport.threatsWithCoverage}/${data.coverageReport.totalThreats} threats have project mappings.\n`;

  return section;
}

function renderRecommendations(data: ReportData): string {
  if (!data.recommendations || data.recommendations.length === 0) return "";

  let section = `## Recommendations\n\n`;

  for (const rec of data.recommendations.slice(0, 10)) {
    section += `### ${rec.title}\n\n`;
    section += `**Severity**: ${rec.severity}\n\n`;
    section += `**Read**: ${rec.read}\n\n`;
    section += `**Reason**: ${rec.reason}\n\n`;
    section += `**Action**: ${rec.action}\n\n`;
    section += `---\n\n`;
  }

  return section;
}

function renderKeyInsights(data: ReportData): string {
  const insights: string[] = [];

  const totalTests = data.runs.reduce(
    (s, r) => s + r.summary.passed + r.summary.failed + r.summary.skipped,
    0,
  );
  if (totalTests > 0) {
    insights.push(`${totalTests} total test cases executed across ${data.runs.length} project(s).`);
  }

  const healthy = data.projects.filter((p) => p.healthStatus === "healthy").length;
  const total = data.projects.length;
  if (total > 0) {
    insights.push(`${healthy}/${total} projects in healthy state.`);
  }

  if (data.coverageReport) {
    const highPriority = data.coverageReport.mappings.filter(
      (m) => m.priority === "high" && m.uncoveredGaps.length > 0,
    );
    if (highPriority.length > 0) {
      insights.push(
        `${highPriority.length} high-priority threat(s) have coverage gaps requiring attention.`,
      );
    }
  }

  const timeoutRuns = data.runs.filter((r) => r.status === "timeout");
  if (timeoutRuns.length > 0) {
    insights.push(
      `${timeoutRuns.length} test suite(s) timed out — may need timeout adjustment or investigation.`,
    );
  }

  if (insights.length === 0) return "";

  let section = `## Key Insights\n\n`;
  for (const insight of insights) {
    section += `- ${insight}\n`;
  }
  return section;
}

function renderEcosystemContext(data: ReportData): string {
  if (!data.ecosystemContext) return "";

  const ctx = data.ecosystemContext;
  let section = `## Ecosystem Context\n\n`;

  // Echoes audit summary
  section += `### Audit Trail (Echoes)\n\n`;
  if (ctx.echoes.totalEvents > 0) {
    section += `- **Recent events scanned**: ${ctx.echoes.totalEvents}\n`;
    const sources = Object.entries(ctx.echoes.sourceBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (sources.length > 0) {
      section += `- **Top sources**: ${sources.map(([s, c]) => `${s} (${c})`).join(", ")}\n`;
    }
  } else {
    section += `- No recent audit events found.\n`;
  }

  // Seeds health snapshot
  section += `\n### Ecosystem Health (Seeds)\n\n`;
  if (ctx.seeds.latestSnapshot) {
    const snap = ctx.seeds.latestSnapshot;
    section += `- **Overall score**: ${snap.overallScore}\n`;
    section += `- **Snapshots available**: ${ctx.seeds.snapshotCount}\n`;
    if (snap.repos.length > 0) {
      section += `- **Repos tracked**: ${snap.repos.length}\n`;
      const unhealthy = snap.repos.filter((r) => r.healthScore < 50);
      if (unhealthy.length > 0) {
        section += `- **Repos below 50 health**: ${unhealthy.map((r) => `${r.name} (${r.healthScore})`).join(", ")}\n`;
      }
    }
  } else {
    section += `- No Seeds snapshots available.\n`;
  }

  section += `\n*Collected at ${ctx.collectedAt}*\n`;

  return section;
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

/**
 * Generate and save a report.
 */
export async function generateReport(
  data: ReportData,
  options?: ReportOptions,
): Promise<{ reportPath: string; sections: number; totalLines: number }> {
  const markdown = renderReport(data);
  const lines = markdown.split("\n").length;
  const sections = (markdown.match(/^## /gm) ?? []).length;

  // Save to ~/.ori/reports/
  await fs.mkdir(config.reportsDir, { recursive: true });
  const filename = options?.outputPath ?? `${todayDate()}-report.md`;
  const reportPath = path.join(config.reportsDir, filename);
  await fs.writeFile(reportPath, markdown, "utf-8");

  // Optionally publish to Documentation/docs/
  if (options?.publish) {
    const docsDir = path.join(config.cascadeRoot, "Documentation/docs");
    try {
      await fs.access(docsDir);
      const pubPath = path.join(docsDir, `ORI_RESEARCH_REPORT_${todayDate()}.md`);
      await fs.writeFile(pubPath, markdown, "utf-8");
    } catch {
      // Docs dir doesn't exist — skip publish
    }
  }

  return { reportPath, sections, totalLines: lines };
}

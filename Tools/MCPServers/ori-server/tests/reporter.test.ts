import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportData } from "../src/reporter.js";
import type { ProjectEntry, TestRunResult } from "../src/types.js";

describe("report generator", () => {
  let renderReport: typeof import("../src/reporter.js").renderReport;
  let generateReport: typeof import("../src/reporter.js").generateReport;

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ori-reporter-"));

  beforeAll(async () => {
    process.env.ORI_DATA_DIR = path.join(tempRoot, ".ori");
    mkdirSync(process.env.ORI_DATA_DIR, { recursive: true });

    ({ renderReport, generateReport } = await import("../src/reporter.ts"));
  });

  afterAll(() => {
    delete process.env.ORI_DATA_DIR;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  // ── Fixture data ──

  const baseProjects: ProjectEntry[] = [
    {
      id: "proj-alpha",
      name: "Alpha",
      location: "/tmp/alpha",
      runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp/alpha" },
      approxTestFiles: 5,
      tags: ["typescript"],
      healthStatus: "healthy",
      lastRunTimestamp: "2026-04-08T10:00:00.000Z",
    },
    {
      id: "proj-beta",
      name: "Beta",
      location: "/tmp/beta",
      runner: { type: "pytest", command: "uv", args: ["run", "pytest"], cwd: "/tmp/beta" },
      approxTestFiles: 10,
      tags: ["python"],
      healthStatus: "failing",
      lastRunTimestamp: "2026-04-07T15:30:00.000Z",
    },
  ];

  const baseRuns: TestRunResult[] = [
    {
      id: "run_001",
      projectId: "proj-alpha",
      timestamp: "2026-04-08T10:05:00.000Z",
      summary: {
        passed: 20,
        failed: 0,
        skipped: 2,
        errors: 0,
        durationMs: 1500,
        timestamp: "2026-04-08T10:05:00.000Z",
      },
      rawStdoutPath: "/tmp/run_001.stdout",
      rawStderrPath: "/tmp/run_001.stderr",
      logEntriesCreated: 5,
      status: "passed",
    },
    {
      id: "run_002",
      projectId: "proj-beta",
      timestamp: "2026-04-07T15:35:00.000Z",
      summary: {
        passed: 8,
        failed: 3,
        skipped: 1,
        errors: 1,
        durationMs: 4500,
        timestamp: "2026-04-07T15:35:00.000Z",
      },
      rawStdoutPath: "/tmp/run_002.stdout",
      rawStderrPath: "/tmp/run_002.stderr",
      logEntriesCreated: 12,
      status: "failed",
      errorMessage: "3 tests failed in test_api module",
    },
  ];

  // ── Structure tests ──

  it("renders report with expected sections", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    expect(md).toContain("# CascadeProjects Research Report");
    expect(md).toContain("## Executive Summary");
    expect(md).toContain("## Test Suite Health");
    expect(md).toContain("## Risk Signal Analysis");
  });

  it("header names projects by name, not count", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    expect(md).toContain("**Scope**: Alpha, Beta");
    expect(md).toContain("**Runs included**: 2");
  });

  it("header truncates when >3 projects", () => {
    const manyProjects = [
      ...baseProjects,
      { ...baseProjects[0], id: "p3", name: "Gamma" },
      { ...baseProjects[0], id: "p4", name: "Delta" },
    ];
    const data: ReportData = { projects: manyProjects, runs: [] };
    const md = renderReport(data);

    expect(md).toContain("Alpha, Beta, Gamma +1 more");
  });

  // ── Bullet executive summary ──

  it("executive summary uses bullet format with named projects", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    // Bullet format: ✓/✗ **Name**: count passed/failed (duration)
    expect(md).toContain("✓ **Alpha**: 20 passed (1.5s)");
    expect(md).toContain("✗ **Beta**: 3 failed / 8 passed (4.5s)");
    expect(md).toContain("3 tests failed in test_api module");
  });

  it("executive summary shows threat gaps when present", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      coverageReport: {
        mappings: [
          {
            threatId: "TM-001",
            priority: "High",
            coveredByProjects: [],
            uncoveredGaps: ["no project mapping"],
          },
          {
            threatId: "TM-002",
            priority: "Low",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: [],
          },
        ],
        totalThreats: 2,
        threatsWithCoverage: 1,
        threatsWithoutCoverage: 1,
        generatedAt: "2026-04-08T10:00:00.000Z",
      },
    };
    const md = renderReport(data);

    expect(md).toContain("⚠ **Threat gap**: TM-001");
  });

  // ── Test suite health table ──

  it("test suite health table includes project names and status icons", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    expect(md).toContain("| Alpha | ✓ passed |");
    expect(md).toContain("| Beta | ✗ failed |");
    expect(md).toContain("| Project | Status |");
  });

  // ── Risk signal analysis ──

  it("risk signal analysis names failing projects with error excerpts", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    expect(md).toContain("**`Beta`** — 3 failed, 1 errors");
    expect(md).toContain("> 3 tests failed in test_api module");
    expect(md).toContain("**Signals captured**: 17 log entries");
  });

  // ── Recommendations (threshold: only critical/warning) ──

  it("renders critical/warning recommendations as numbered actions", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      recommendations: [
        {
          title: "Fix flaky test in Beta",
          severity: "critical",
          read: "Detected 3 failures in test_api module",
          reason: "Indicates unstable API integration",
          action: "Isolate and fix test_api tests",
        },
      ],
    };
    const md = renderReport(data);

    expect(md).toContain("## Recommendations");
    expect(md).toContain("**1. 🔴 Fix flaky test in Beta**");
    expect(md).toContain("> Detected 3 failures");
    expect(md).toContain("**Why**: Indicates unstable");
    expect(md).toContain("**Do**: Isolate and fix");
  });

  it("omits recommendations section when only info-severity present", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      recommendations: [
        {
          title: "Review skipped tests",
          severity: "info",
          read: "2 tests skipped",
          reason: "May indicate dead code",
          action: "Review test skip reasons",
        },
      ],
    };
    const md = renderReport(data);

    expect(md).not.toContain("## Recommendations");
  });

  // ── Threat coverage (threshold: only if gaps exist) ──

  it("renders threat coverage only when gaps exist", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      threatModel: {
        threats: [
          {
            id: "TM-001",
            source: "Ext",
            prerequisites: "",
            action: "Exploit",
            impact: "Loss",
            impactedAssets: "API",
            existingControls: "Auth",
            gaps: "lag",
            mitigations: "Rate limit",
            detectionIdeas: "Logs",
            likelihood: "High",
            impactSeverity: "Critical",
            priority: "High",
          },
          {
            id: "TM-002",
            source: "Int",
            prerequisites: "",
            action: "Config",
            impact: "Outage",
            impactedAssets: "Config",
            existingControls: "RBAC",
            gaps: "",
            mitigations: "Review",
            detectionIdeas: "Alert",
            likelihood: "Medium",
            impactSeverity: "High",
            priority: "Medium",
          },
        ],
        focusPaths: [],
        parsedAt: "2026-04-08T10:00:00.000Z",
      },
      coverageReport: {
        mappings: [
          {
            threatId: "TM-001",
            priority: "High",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: ["proj-alpha failing"],
          },
          {
            threatId: "TM-002",
            priority: "Medium",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: [],
          },
        ],
        totalThreats: 2,
        threatsWithCoverage: 2,
        threatsWithoutCoverage: 0,
        generatedAt: "2026-04-08T10:00:00.000Z",
      },
    };
    const md = renderReport(data);

    expect(md).toContain("## Threat Coverage");
    expect(md).toContain("| TM-001 |");
    // TM-002 has no gaps — should NOT appear in the gap table
    expect(md).not.toContain("| TM-002 | Medium | proj-alpha | covered |");
    // But should appear in covered footnote
    expect(md).toContain("*Covered: TM-002*");
    expect(md).toContain("1/2 threats covered");
  });

  it("omits threat coverage when all threats are covered", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      threatModel: {
        threats: [
          {
            id: "TM-001",
            source: "Ext",
            prerequisites: "",
            action: "Exploit",
            impact: "Loss",
            impactedAssets: "API",
            existingControls: "Auth",
            gaps: "",
            mitigations: "Rate limit",
            detectionIdeas: "Logs",
            likelihood: "High",
            impactSeverity: "Critical",
            priority: "High",
          },
        ],
        focusPaths: [],
        parsedAt: "2026-04-08T10:00:00.000Z",
      },
      coverageReport: {
        mappings: [
          {
            threatId: "TM-001",
            priority: "High",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: [],
          },
        ],
        totalThreats: 1,
        threatsWithCoverage: 1,
        threatsWithoutCoverage: 0,
        generatedAt: "2026-04-08T10:00:00.000Z",
      },
    };
    const md = renderReport(data);

    expect(md).not.toContain("## Threat Coverage");
  });

  // ── Key insights (threshold: ≥2 insights) ──

  it("renders key insights only when ≥2 cross-signal patterns", () => {
    // Low pass rate + timeout → 2 insights
    const data: ReportData = {
      projects: baseProjects,
      runs: [
        {
          ...baseRuns[1],
          summary: { ...baseRuns[1].summary, passed: 2, failed: 8 },
          status: "failed" as const,
        },
        { ...baseRuns[0], status: "timeout" as const },
      ],
    };
    const md = renderReport(data);

    expect(md).toContain("## Key Insights");
    expect(md).toContain("below the 90% stability threshold");
    expect(md).toContain("timed out");
  });

  it("omits key insights when only 1 signal present", () => {
    // Only passing runs with good pass rate — no insights
    const data: ReportData = { projects: baseProjects, runs: [baseRuns[0]] };
    const md = renderReport(data);

    expect(md).not.toContain("## Key Insights");
  });

  // ── Empty / no-data handling ──

  it("omits all optional sections when no data", () => {
    const data: ReportData = { projects: [], runs: [] };
    const md = renderReport(data);

    expect(md).toContain("# CascadeProjects Research Report");
    expect(md).not.toContain("## Executive Summary");
    expect(md).not.toContain("## Test Suite Health");
    expect(md).not.toContain("## Risk Signal Analysis");
    expect(md).not.toContain("## Recommendations");
    expect(md).not.toContain("## Key Insights");
    expect(md).not.toContain("## Threat Coverage");
    expect(md).not.toContain("## Ecosystem Context");
  });

  it("no padding prose in empty reports", () => {
    const data: ReportData = { projects: [], runs: [] };
    const md = renderReport(data);

    expect(md).not.toContain("no test runs");
    expect(md).not.toContain("nothing to report");
    expect(md).not.toContain("N/A");
  });

  // ── Fact-anchored language ──

  it("uses project names, not just counts", () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const md = renderReport(data);

    // Should name Alpha and Beta, not just "2 projects"
    expect(md).toContain("Alpha");
    expect(md).toContain("Beta");
    // Pass rate should not appear as a standalone prose sentence
    expect(md).not.toContain("Overall pass rate:");
  });

  // ── Section independence ──

  it("sections do not reference other sections by name", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      recommendations: [
        {
          title: "Fix Beta",
          severity: "critical",
          read: "Beta failing",
          reason: "API broken",
          action: "Fix it",
        },
      ],
    };
    const md = renderReport(data);

    // No cross-section references like "as shown in Test Suite Health above"
    expect(md).not.toMatch(/as shown in|based on the .* section|see above|mentioned above/i);
  });

  // ── Timeout in executive summary ──

  it("shows timeout in executive summary bullets", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: [{ ...baseRuns[0], status: "timeout" as const }],
    };
    const md = renderReport(data);

    expect(md).toContain("⏱ **Alpha**: timed out after 1.5s");
  });

  // ── generateReport (file output) ──

  it("saves report to disk and returns metadata", async () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const result = await generateReport(data);

    expect(result.reportPath).toContain(".ori/reports/");
    expect(result.reportPath).toContain("-report.md");
    expect(result.sections).toBeGreaterThan(0);
    expect(result.totalLines).toBeGreaterThan(0);

    const content = readFileSync(result.reportPath, "utf-8");
    expect(content).toContain("# CascadeProjects Research Report");
    expect(content.length).toBeGreaterThan(100);
  });

  it("uses custom output path", async () => {
    const data: ReportData = { projects: baseProjects, runs: baseRuns };
    const result = await generateReport(data, { outputPath: "custom-report.md" });
    expect(result.reportPath).toContain("custom-report.md");

    const content = readFileSync(result.reportPath, "utf-8");
    expect(content).toContain("# CascadeProjects Research Report");
  });

  it("writes GRUFF svg and appends section when includeGruffSvg and threat data exist", async () => {
    const projects: ProjectEntry[] = [
      { ...baseProjects[0], threatModelIds: ["TM-001", "TM-002"] },
      { ...baseProjects[1], threatModelIds: ["TM-001"] },
    ];
    const data: ReportData = {
      projects,
      runs: baseRuns,
      threatModel: {
        threats: [
          {
            id: "TM-001",
            source: "Ext",
            prerequisites: "",
            action: "Exploit",
            impact: "Loss",
            impactedAssets: "API",
            existingControls: "Auth",
            gaps: "lag",
            mitigations: "Rate limit",
            detectionIdeas: "Logs",
            likelihood: "High",
            impactSeverity: "Critical",
            priority: "High",
          },
          {
            id: "TM-002",
            source: "Int",
            prerequisites: "",
            action: "Config",
            impact: "Outage",
            impactedAssets: "Config",
            existingControls: "RBAC",
            gaps: "",
            mitigations: "Review",
            detectionIdeas: "Alert",
            likelihood: "Medium",
            impactSeverity: "High",
            priority: "Medium",
          },
        ],
        focusPaths: [],
        parsedAt: "2026-04-08T10:00:00.000Z",
      },
      coverageReport: {
        mappings: [
          {
            threatId: "TM-001",
            priority: "High",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: ["proj-alpha failing"],
          },
          {
            threatId: "TM-002",
            priority: "Medium",
            coveredByProjects: ["proj-alpha"],
            uncoveredGaps: [],
          },
        ],
        totalThreats: 2,
        threatsWithCoverage: 2,
        threatsWithoutCoverage: 0,
        generatedAt: "2026-04-08T10:00:00.000Z",
      },
    };

    const result = await generateReport(data, { includeGruffSvg: true });
    expect(result.gruffSvgPath).toBeDefined();
    const svg = readFileSync(result.gruffSvgPath!, "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("xmlns=");

    const md = readFileSync(result.reportPath, "utf-8");
    expect(md).toContain("## Threat × project (GRUFF)");
    expect(md).toMatch(/!\[GRUFF threat×project grid]\([^)]+-gruff\.svg\)/);
  });
});

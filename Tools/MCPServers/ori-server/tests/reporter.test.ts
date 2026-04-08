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

  // ── renderReport tests ──

  it("renders report with all sections present", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    expect(md).toContain("# Research Report");
    expect(md).toContain("## Executive Summary");
    expect(md).toContain("## Test Suite Health");
    expect(md).toContain("## Risk Signal Analysis");
  });

  it("renders header with correct metadata", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    expect(md).toContain("**Projects Analyzed**: 2");
    expect(md).toContain("**Test Runs**: 2");
    expect(md).toContain("**Confidence Level**: High");
  });

  it("executive summary includes pass rate", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    // 28 passed / (28 passed + 3 failed) = 90.3%
    expect(md).toContain("90.3%");
    expect(md).toContain("28 passed");
    expect(md).toContain("3 failed");
  });

  it("executive summary flags failing projects", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);
    expect(md).toContain("**Failing projects**");
    expect(md).toContain("`proj-beta`");
  });

  it("test suite health table includes all projects", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    expect(md).toContain("| Alpha |");
    expect(md).toContain("| Beta |");
    expect(md).toContain("| Project | Status |");
  });

  it("renders risk signal analysis with failure details", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    expect(md).toContain("**Total risk signals captured**: 17");
    expect(md).toContain("**Runs with failures**: 1");
    expect(md).toContain("proj-beta");
    expect(md).toContain("3 tests failed");
  });

  it("renders recommendations when provided", () => {
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
    expect(md).toContain("### Fix flaky test in Beta");
    expect(md).toContain("**Severity**: critical");
    expect(md).toContain("**Read**: Detected 3 failures");
    expect(md).toContain("**Reason**: Indicates unstable");
    expect(md).toContain("**Action**: Isolate and fix");
  });

  it("renders threat coverage when provided", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
      threatModel: {
        threats: [
          {
            id: "TM-001",
            source: "External",
            prerequisites: "None",
            action: "Exploit",
            impact: "Data loss",
            impactedAssets: "API",
            existingControls: "Auth",
            gaps: "None",
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

    expect(md).toContain("## Threat Coverage");
    expect(md).toContain("| TM-001 |");
    expect(md).toContain("**Coverage**: 1/1");
  });

  it("renders key insights section", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const md = renderReport(data);

    expect(md).toContain("## Key Insights");
    expect(md).toContain("total test cases executed");
  });

  it("omits empty sections gracefully", () => {
    const data: ReportData = {
      projects: [],
      runs: [],
    };

    const md = renderReport(data);

    expect(md).toContain("# Research Report");
    expect(md).toContain("## Executive Summary");
    // No health table, risk analysis, recommendations, or key insights
    expect(md).not.toContain("## Test Suite Health");
    expect(md).not.toContain("## Risk Signal Analysis");
    expect(md).not.toContain("## Recommendations");
    expect(md).not.toContain("## Key Insights");
  });

  it("includes medium confidence when no runs", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: [],
    };

    const md = renderReport(data);
    expect(md).toContain("**Confidence Level**: Medium");
  });

  // ── generateReport (file output) ──

  it("saves report to disk and returns metadata", async () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const result = await generateReport(data);

    expect(result.reportPath).toContain(".ori/reports/");
    expect(result.reportPath).toContain("-report.md");
    expect(result.sections).toBeGreaterThan(0);
    expect(result.totalLines).toBeGreaterThan(0);

    // Verify file actually exists and has content
    const content = readFileSync(result.reportPath, "utf-8");
    expect(content).toContain("# Research Report");
    expect(content.length).toBeGreaterThan(100);
  });

  it("uses custom output path", async () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: baseRuns,
    };

    const result = await generateReport(data, { outputPath: "custom-report.md" });
    expect(result.reportPath).toContain("custom-report.md");

    const content = readFileSync(result.reportPath, "utf-8");
    expect(content).toContain("# Research Report");
  });

  it("handles timeout runs in key insights", () => {
    const data: ReportData = {
      projects: baseProjects,
      runs: [
        {
          ...baseRuns[0],
          status: "timeout" as const,
        },
      ],
    };

    const md = renderReport(data);
    expect(md).toContain("timed out");
  });
});

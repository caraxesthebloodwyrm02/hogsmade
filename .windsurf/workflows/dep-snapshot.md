---
description: Dependency full-cycle snapshot — scheduled routine for dep_audit and dep_audit_history with overlap checks and tight stringification
---

# DEP-SNAPSHOT

Scheduled maintenance routine for dependency vulnerability tracking. Runs dep_audit and dep_audit_history as a full-cycle snapshot, ensuring no overlap between operations and proper JSON serialization for downstream consumption.

**Design principle**: Read-mode only, persistent storage, trend-aware, overlap-safe.

---

## When to Use

- Scheduled daily/weekly dependency health check
- Before deploying to production
- After significant dependency updates
- As part of CI/CD pipeline gate

---

## SNAPSHOT Pipeline

```
TRIGGER ──→ OVERLAP CHECK ──→ DEP_AUDIT ──→ DEP_AUDIT_HISTORY ──→ SNAPSHOT SUMMARY
```

All phases are read-only. No mutations to lockfiles or dependency configurations.

---

## Phase 0 — OVERLAP CHECK (pre-flight, ~1s)

Ensure no conflicting operations are running before proceeding.

```bash
# Check if dep_audit is already running
pgrep -f "dep_audit" > /dev/null
if [ $? -eq 0 ]; then
  echo "ERROR: dep_audit already running. Backing off."
  exit 1
fi

# Check if dep_audit_history is already running
pgrep -f "dep_audit_history" > /dev/null
if [ $? -eq 0 ]; then
  echo "ERROR: dep_audit_history already running. Backing off."
  exit 1
fi

echo "OVERLAP_CHECK: CLEAR"
```

---

## Phase 1 — DEP_AUDIT (execute audit, ~30-60s)

Run dependency vulnerability scan across configured scan roots.

// turbo

1. Call dep_audit tool:

```
mcp11_dep_audit()
```

2. Validate response structure (tight stringification check):

```javascript
// Expected schema:
{
  "timestamp": "ISO-8601",
  "projects": [
    {
      "project": "string",
      "root": "absolute/path",
      "lockfile": {
        "type": "npm|pip|none",
        "path": "absolute/path",
        "exists": true
      },
      "vulnerabilities": [
        {
          "name": "package-name",
          "version": "version-string",
          "severity": "info|low|moderate|high|critical",
          "advisory": "url",
          "direct": boolean
        }
      ],
      "totalDeps": number,
      "error": "string|null"
    }
  ],
  "summary": {
    "totalProjects": number,
    "totalVulnerabilities": number,
    "bySeverity": {
      "info": number,
      "low": number,
      "moderate": number,
      "high": number,
      "critical": number
    }
  }
}
```

3. Record snapshot:

```
SNAPSHOT_STATE:
  dep_audit_timestamp  ← result.timestamp
  dep_audit_projects   ← result.projects.length
  dep_audit_vulns      ← result.summary.totalVulnerabilities
  dep_audit_severity   ← result.summary.bySeverity
  dep_audit_status     ← SUCCESS | PARTIAL | ERROR
```

---

## Phase 2 — DEP_AUDIT_HISTORY (retrieve trend, ~1s)

Pull historical audit results for trend analysis.

// turbo

4. Call dep_audit_history tool:

```
mcp11_dep_audit_history(limit: 30)
```

5. Validate response structure:

```javascript
// Expected schema:
{
  "available": number,
  "trend": "improving|degrading|stable",
  "history": [
    // DepAuditResult objects from Phase 1
  ]
}
```

6. Record trend state:

```
TREND_STATE:
  history_count   ← result.available
  trend_direction ← result.trend
  latest_vulns    ← result.history[0]?.summary.totalVulnerabilities || 0
  previous_vulns  ← result.history[1]?.summary.totalVulnerabilities || 0
  vuln_delta      ← latest_vulns - previous_vulns
```

---

## Phase 3 — SNAPSHOT SUMMARY (aggregate, ~1s)

Combine current snapshot with trend data into a full-cycle summary.

7. Build summary:

```javascript
FULL_CYCLE_SNAPSHOT = {
  captured_at: ISO-8601,
  current_state: SNAPSHOT_STATE,
  trend_state: TREND_STATE,
  health_status: "HEALTHY | WARNING | CRITICAL",
  recommendations: string[]
}
```

8. Determine health status:

```
HEALTH_STATUS_RULES:
  if (dep_audit_status === ERROR) → CRITICAL
  if (dep_audit_severity.critical > 0) → CRITICAL
  if (dep_audit_severity.high > 0) → WARNING
  if (trend_direction === "degrading" && vuln_delta > 5) → WARNING
  else → HEALTHY
```

9. Generate recommendations:

```
RECOMMENDATIONS:
  if (dep_audit_severity.critical > 0)
    → "Immediate remediation required for critical vulnerabilities"
  if (dep_audit_severity.high > 0)
    → "Review and remediate high-severity vulnerabilities"
  if (trend_direction === "degrading")
    → "Vulnerability count increasing. Review recent dependency changes."
  if (dep_audit_status === PARTIAL)
    → "Some projects failed audit. Review error messages."
```

10. Emit summary to ori-server for persistence:

```
mcp13_collect_logs(
  source: "dep-snapshot",
  lines: [
    `dep-snapshot: ${health_status}. projects=${dep_audit_projects}, vulns=${dep_audit_vulns}, trend=${trend_direction}`
  ]
)

mcp13_notebook_add(
  category: "observation",
  title: `dep-snapshot ${ISO_date}: ${health_status}`,
  body: JSON.stringify(FULL_CYCLE_SNAPSHOT, null, 2),
  tags: ["dep-snapshot", "dependency", "health"]
)
```

---

## Tight Stringification Rules

All JSON output must follow these serialization rules:

1. **Consistent spacing**: Use `JSON.stringify(data, null, 2)` (2-space indent)
2. **ISO-8601 timestamps**: Always use `new Date().toISOString()`
3. **Absolute paths**: Use `path.resolve()` for all file paths
4. **No circular references**: Ensure data structures are tree-shaped
5. **Error format**: Errors must be `{ error: "message" }` not `{ message: "..." }`
6. **Boolean flags**: Use `true/false` not `"true"/"false"`

---

## Overlap Prevention

The following mechanisms prevent operation overlap:

1. **Rate limiting**: dep_audit has 30s cooldown, dep_audit_history has separate key
2. **PGREP check**: Pre-flight check for running processes
3. **Atomic writes**: saveDepAuditResult uses atomicWriteJson (tmpfile + rename)
4. **File locking**: Atomic writes prevent corruption from concurrent writes

---

## Quick Reference

### Tool Calls

| Tool                    | Purpose                     | Rate Limit        | Cooldown |
| ----------------------- | --------------------------- | ----------------- | -------- |
| mcp11_dep_audit         | Scan for vulnerabilities    | dep_audit         | 30s      |
| mcp11_dep_audit_history | Retrieve history with trend | dep_audit_history | 60s      |

### Status Codes

| Code     | Meaning                              | Action           |
| -------- | ------------------------------------ | ---------------- |
| HEALTHY  | No critical/high vulns, trend stable | Continue         |
| WARNING  | High vulns or degrading trend        | Review           |
| CRITICAL | Critical vulns or audit error        | Immediate action |

### Schedule Recommendations

| Frequency  | Trigger       | Context                       |
| ---------- | ------------- | ----------------------------- |
| Daily      | Cron/Timer    | Development environments      |
| Pre-deploy | CI/CD gate    | Production deployments        |
| Weekly     | Scheduled job | Staging/Production monitoring |

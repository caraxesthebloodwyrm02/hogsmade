---
name: python-test-runner
description: Workflows for executing Python tests, scripts, and code analysis across CascadeProjects repositories
---

1. Run Python Tests for a Specific Project

If you want to execute Python tests (e.g., pytest, unittest) for a specific repository, use:
mcp**run_tests(
projectId="<repository_name>", # e.g., "grid-main", "shared-types"
timeoutSeconds=120 # Optional: Adjust timeout if tests are slow
)
Example:
mcp**run_tests(projectId="grid-main")
This will:

- Execute the test suite for the given project.
- Capture stdout/stderr.
- Classify output through the risk pattern engine.
- Update the project's health status.

---

2. Execute a Custom Python Script in a Project

If you want to run a specific Python script (e.g., scripts/analyze.py) or filter tests by path:
mcp**run_tests(
projectId="<repository_name>",
filter="<test_path_or_script>", # e.g., "tests/unit/", "scripts/analyze.py"
timeoutSeconds=60 # Optional: Adjust timeout
)
Example:
mcp**run_tests(projectId="grid-main", filter="tests/unit/")

---

3. Trigger a Full Test Suite Execution

To run the entire test suite for a project (including dependencies):
mcp**run_tests(projectId="<repository_name>")
Example:
mcp**run_tests(projectId="afloat")

---

4. Inspect Python Code for Risks or Patterns

If you want to analyze Python code for risks (e.g., vulnerabilities, anti-patterns):
mcp**overview-server**checkpoint(
depth="deep", # Detailed analysis
focus="<repository_name>" # e.g., "grid-family", "canopy-apps"
)
Example:
mcp**overview-server**checkpoint(depth="deep", focus="grid-main")
This will:

- Detect Python-specific risks (e.g., outdated dependencies, security flaws).
- Provide a detailed report on code health.

---

5. Check Python Dependency Health

To review Python dependencies (e.g., pip, poetry) for a project:
mcp**seeds-server**repo_detail(repoName="<repository_name>")
Example:
mcp**seeds-server**repo_detail(repoName="grid-main")
This will:

- List installed Python packages.
- Flag outdated or vulnerable dependencies.

---

6. Scan for Python-Specific Issues

To scan the entire ecosystem for Python-related issues (e.g., failing tests, drift):
mcp**pulse-server**what_should_i_work_on(healthThreshold=70)
Example:
mcp**pulse-server**what_should_i_work_on()
This will prioritize Python projects with:

- Recent failures.
- Low health scores.
- Pending fixes.

---

Key Notes:

- Replace <repository_name> with actual project IDs (e.g., grid-main, shared-types).
- Use mcp**run_tests for execution and mcp**overview-server\_\_checkpoint for analysis.
- If you need to debug a specific issue, combine these with mcp\_\_journal_add to track findings.

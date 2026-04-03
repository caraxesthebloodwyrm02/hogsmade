# Dead/Stale Code Detection Checklist

Identify unused code paths, orphaned files, and stale configuration in GRID-main.

## Priority System

- **P0**: Security-relevant dead code (exposed secrets, unused auth paths)
- **P1**: Orphaned files, unused imports, unreachable code paths
- **P2**: Stale comments, TODO cleanup, unused configuration keys

---

## P0: Security-Critical Dead Code

**1. Unused Authentication/Authorization Paths**

- [ ] Identify auth endpoints that are defined but never called
  ```bash
  cd GRID-main
  # Find all auth-related route definitions
  grep -rn "@.*route.*auth\|@.*post.*login\|@.*get.*token" src/ --include="*.py"
  # Cross-reference with actual usage in tests and client code
  ```

**2. Exposed Secrets in Dead Code**

- [ ] Scan commented-out code for hardcoded credentials
  ```bash
  cd GRID-main
  grep -rn "# .*password\|# .*secret\|# .*api_key" src/ --include="*.py"
  ```

**3. Deprecated Security Modules Still Present**

- [ ] Find security-related files not imported anywhere
  ```bash
  cd GRID-main
  for f in $(find src/grid/auth src/application/mothership/security -name "*.py"); do
    basename_no_ext=$(basename "$f" .py)
    if ! grep -rq "import.*$basename_no_ext\|from.*$basename_no_ext" src/; then
      echo "Potentially orphaned: $f"
    fi
  done
  ```

---

## P1: High-Impact Dead Code

**4. Unused Python Modules**

- [ ] Run vulture to detect unused code
  ```bash
  cd GRID-main
  pipx run vulture src/ --min-confidence 80
  ```

**5. Orphaned Test Files**

- [ ] Find test files with no corresponding source module
  ```bash
  cd GRID-main
  for test_file in $(find tests/ -name "test_*.py"); do
    module_name=$(basename "$test_file" | sed 's/test_//' | sed 's/.py//')
    if ! find src/ -name "${module_name}.py" | grep -q .; then
      echo "Orphaned test: $test_file"
    fi
  done
  ```

**6. Unreachable Code Paths**

- [ ] Use coverage to identify never-executed branches
  ```bash
  cd GRID-main
  uv run pytest tests/ --cov=src --cov-report=html
  # Review htmlcov/index.html for 0% coverage files
  ```

**7. Unused Import Statements**

- [ ] Detect imports that are never referenced
  ```bash
  cd GRID-main
  uv run ruff check src/ --select F401  # Unused imports
  ```

**8. Dead Router Endpoints**

- [ ] Find API endpoints with no test coverage or client usage
  ```bash
  cd GRID-main
  # List all defined routes
  grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" src/application/mothership/routers/ --include="*.py" > all_routes.txt
  # Compare with test coverage
  grep -rn "client\.\(get\|post\|put\|delete\|patch\)" tests/ --include="*.py" > tested_routes.txt
  ```

---

## P2: Code Hygiene

**9. Stale TODO/FIXME Comments**

- [ ] Identify TODOs older than 6 months
  ```bash
  cd GRID-main
  grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.py" | head -20
  # Cross-reference with git blame for age
  ```

**10. Unused Configuration Keys**

- [ ] Find .env variables not referenced in code
  ```bash
  cd GRID-main
  for var in $(grep -oE "^[A-Z_]+" .env.example); do
    if ! grep -rq "$var" src/ --include="*.py"; then
      echo "Unused env var: $var"
    fi
  done
  ```

**11. Commented-Out Code Blocks**

- [ ] Detect large blocks of commented code (>5 lines)
  ```bash
  cd GRID-main
  # Manual review - look for patterns like:
  grep -rn "^#.*def \|^#.*class \|^#.*if " src/ --include="*.py"
  ```

**12. Unused Database Migrations**

- [ ] Identify migrations that were superseded or rolled back
  ```bash
  cd GRID-main
  ls -la src/application/mothership/migrations/versions/ | wc -l
  # Review for sequential gaps or "revert" migrations
  ```

---

## Automated Detection Tools

| Tool      | Purpose                    | Command                                               |
| --------- | -------------------------- | ----------------------------------------------------- |
| vulture   | Dead code detection        | `pipx run vulture src/`                               |
| ruff      | Unused imports (F401)      | `uv run ruff check src/ --select F401`                |
| coverage  | Unreachable branches       | `uv run pytest --cov=src --cov-branch`                |
| autoflake | Auto-remove unused imports | `pipx run autoflake --remove-all-unused-imports src/` |

## Cross-References

- VERIFICATION_CHECKLIST.md: Coverage reports and test gaps
- REMEDIATION_CHECKLIST.md: Safe removal procedures
- POST_DEBUG_ROUTINE.md: Cleanup after debugging sessions

This checklist uses the priority system from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md` with detection techniques adapted for Python/FastAPI codebases.

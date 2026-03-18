# Organization & Cleanup Checklist

Improve codebase structure, naming conventions, and overall hygiene in GRID-main.

## Priority System
- **P0**: Misplaced security modules, broken package structure
- **P1**: Naming convention violations, module consolidation opportunities
- **P2**: Import ordering, docstring consistency, file header standardization

---

## P0: Critical Organization Issues

**1. Security Module Placement**
- [ ] Ensure all auth/security code lives in designated directories
  ```bash
  cd GRID-main
  # Security code should be in:
  # - src/grid/auth/
  # - src/application/mothership/security/
  # Find misplaced security code:
  grep -rln "jwt\|password\|secret\|encrypt\|decrypt" src/ --include="*.py" | grep -v "auth\|security"
  ```

**2. Package __init__.py Completeness**
- [ ] Verify all Python packages have proper __init__.py files
  ```bash
  cd GRID-main
  find src/ -type d -exec sh -c 'ls -la "$1"/__init__.py 2>/dev/null || echo "Missing __init__.py: $1"' _ {} \;
  ```

**3. Circular Import Prevention**
- [ ] Detect and resolve circular import chains
  ```bash
  cd GRID-main
  # Attempt to import main module - circular imports will fail
  python -c "from application.mothership import main" 2>&1 | grep -i "circular\|import"
  ```

---

## P1: High-Impact Organization

**4. Naming Convention Enforcement**
- [ ] Validate module names follow snake_case
  ```bash
  cd GRID-main
  find src/ -name "*.py" | grep -E "[A-Z]" | grep -v "__pycache__"
  ```

**5. Router Organization**
- [ ] Group related endpoints into cohesive router modules
  ```bash
  cd GRID-main
  # List routers and their endpoint counts
  for router in $(find src/application/mothership/routers -name "*.py"); do
    count=$(grep -c "@router\." "$router" 2>/dev/null || echo 0)
    echo "$router: $count endpoints"
  done
  ```

**6. Service Layer Separation**
- [ ] Ensure business logic is in services/, not routers/
  ```bash
  cd GRID-main
  # Routers should only have thin handlers
  grep -rn "\.query(\|\.execute(\|\.commit(" src/application/mothership/routers/ --include="*.py"
  # Database calls in routers indicate service layer violations
  ```

**7. Configuration Consolidation**
- [ ] Centralize all config in settings.py or config/
  ```bash
  cd GRID-main
  # Find scattered configuration
  grep -rn "os\.environ\|getenv" src/ --include="*.py" | grep -v "settings\|config"
  ```

**8. Test Directory Mirroring**
- [ ] Ensure tests/ structure mirrors src/ structure
  ```bash
  cd GRID-main
  # Compare directory structures
  diff <(find src/ -type d | sed 's|src/||' | sort) <(find tests/ -type d | sed 's|tests/||' | sort)
  ```

---

## P2: Code Hygiene

**9. Import Ordering (isort)**
- [ ] Standardize import order across all modules
  ```bash
  cd GRID-main
  uv run ruff check src/ --select I  # isort rules
  uv run ruff check src/ --select I --fix  # Auto-fix
  ```

**10. Docstring Consistency**
- [ ] Ensure all public functions have docstrings
  ```bash
  cd GRID-main
  uv run ruff check src/ --select D  # pydocstyle rules
  ```

**11. File Header Standardization**
- [ ] Add consistent module-level docstrings
  ```bash
  cd GRID-main
  # Find files without module docstrings
  for f in $(find src/ -name "*.py" ! -name "__init__.py"); do
    if ! head -5 "$f" | grep -q '"""'; then
      echo "Missing module docstring: $f"
    fi
  done
  ```

**12. Type Hint Coverage**
- [ ] Increase type annotation coverage
  ```bash
  cd GRID-main
  # Use mypy to check current coverage
  uv run mypy src/ --ignore-missing-imports --html-report type_coverage/
  ```

**13. Consistent Error Handling**
- [ ] Standardize exception classes and error responses
  ```bash
  cd GRID-main
  # Find custom exception definitions
  grep -rn "class.*Exception\|class.*Error" src/ --include="*.py"
  # Should be centralized in src/core/exceptions.py or similar
  ```

---

## Directory Structure Reference

Recommended GRID-main structure:
```
src/
├── application/
│   └── mothership/
│       ├── routers/        # FastAPI route handlers (thin)
│       ├── services/       # Business logic
│       ├── models/         # SQLAlchemy/Pydantic models
│       ├── security/       # Auth, JWT, permissions
│       └── config/         # Settings, environment
├── grid/
│   ├── auth/               # Core auth primitives
│   ├── core/               # Shared utilities
│   └── integrations/       # External service adapters
└── scripts/                # CLI entry points
```

## Automated Formatting Tools

| Tool | Purpose | Command |
|------|---------|---------|
| ruff | Linting + formatting | `uv run ruff check src/ --fix` |
| black | Code formatting | `uv run black src/` |
| isort | Import sorting | `uv run ruff check src/ --select I --fix` |
| mypy | Type checking | `uv run mypy src/` |

## Cross-References
- VERIFICATION_CHECKLIST.md: CI linting and formatting checks
- REMEDIATION_CHECKLIST.md: Refactoring safety procedures
- SAFETY_DEBUG_CHECKLIST.md: Avoiding regressions during reorganization

This checklist follows the phased structure from `docs/afloat-templates/implementation-checklist.md` with priority levels from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md`.
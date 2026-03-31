# Dependency & Load Optimization Checklist

Audit and streamline external dependencies to reduce attack surface and improve load times.

## Priority System
- **P0**: Vulnerable packages, incompatible licenses, version conflicts
- **P1**: Bloated dependency tree, slow install times
- **P2**: Non-essential packages, outdated minor versions

---

## P0: Critical Dependency Issues

**1. Security Vulnerability Scan**
- [ ] Run comprehensive vulnerability assessment
  ```bash
  cd GRID-main
  uv pip audit
  # Also check:
  pipx install safety
  safety check
  ```

**2. License Compliance Verification**
- [ ] Validate all dependencies meet licensing requirements
  ```bash
  cd GRID-main
  uv pip list --format json | jq -r '.[].name' | xargs pipx run liccheck
  ```

**3. Version Conflict Resolution**
- [ ] Resolve incompatible transitive dependency versions
  ```bash
  cd GRID-main
  uv pip install -e . --dry-run 2>&1 | grep -i "conflict\|incompatible"
  ```

---

## P1: High-Impact Dependency Optimization

**4. Dependency Tree Pruning**
- [ ] Remove unused top-level dependencies
  ```bash
  cd GRID-main
  uv pip install pipdeptree
  pipdeptree --warn silence | grep -E "^\w"  # Top-level packages
  # Manually verify each is still required
  ```

**5. Optional Group Management**
- [ ] Move infrequently-used packages to optional extras
  ```bash
  cd GRID-main
  # Review pyproject.toml [project.optional-dependencies]
  grep -A 20 "\[project.optional-dependencies\]" pyproject.toml
  ```

**6. Load Time Reduction**
- [ ] Profile import times to identify slow-loading modules
  ```bash
  cd GRID-main
  python -X importtime -c "import application.mothership.main" 2> import_profile.txt
  ```

**7. Native Library Optimization**
- [ ] Prefer pure-Python alternatives where performance is acceptable
  ```bash
  cd GRID-main
  uv pip list | grep -E "(cffi|cython)"  # Identify native extensions
  ```

---

## P2: Maintenance & Hygiene

**8. Dependency Update Policy**
- [ ] Automate minor version updates with CI checks
  ```bash
  # Check for existing dependabot config
  cat .github/dependabot.yml
  ```

**9. Lock File Freshness**
- [ ] Regular regeneration of uv.lock to capture latest compatible versions
  ```bash
  cd GRID-main
  uv lock --upgrade
  git diff uv.lock  # Review version bumps
  ```

**10. Development vs Production Separation**
- [ ] Ensure `--no-dev` installs exclude all test/tooling packages
  ```bash
  cd GRID-main
  uv sync --group dev --group test --no-dev
  uv pip list  # Should show minimal package set
  ```

---

## Verification Commands

From `VERIFICATION_CHECKLIST.md`:
- **CI Validation**:
  ```bash
  cd GRID-main
  # Simulate CI environment (no cache)
  rm -rf .venv __pycache__ uv.lock
  uv sync --group dev --group test
  ```

From `REMEDIATION_CHECKLIST.md`:
- **Security Patching**:
  ```bash
  cd GRID-main
  # For each vulnerable package:
  uv pip install --upgrade package-name
  # Then run regression suite
  ```

## Cross-References
- VERIFICATION_CHECKLIST.md: Dependency validation in CI
- REMEDIATION_CHECKLIST.md: Vulnerability patching procedure
- AFTERHOURS_CHECKLIST.md: Dependency-focused refactor sprints

This checklist follows the triaged approach from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md` with structure inspired by `docs/afloat-templates/implementation-checklist.md`.
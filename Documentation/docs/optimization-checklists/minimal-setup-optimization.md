# Minimal Setup Optimization Checklist

Streamline development environment setup for faster onboarding and reduced resource consumption.

## Priority System

- **P0**: Blocking setup/install, core dependency conflicts
- **P1**: Slow install/boot times, excessive disk usage
- **P2**: Developer experience friction, optional simplifications

---

## P0: Critical Setup Issues

**1. Core Dependency Resolution Failures**

- [ ] Verify clean install with minimal dependencies
  ```bash
  cd GRID-main
  rm -rf .venv
  uv venv
  source .venv/bin/activate
  uv pip install -e .
  ```

**2. Environment Variable Requirements**

- [ ] Identify strictly required vs. optional environment variables
  ```bash
  cd GRID-main
  cat .env.example | wc -l  # Baseline
  # Attempt boot with progressively fewer vars
  ```

**3. Platform Compatibility**

- [ ] Validate setup works on Windows/macOS/Linux without extra steps
  ```bash
  # In clean environments on each platform:
  uv sync --group dev --group test --no-dev
  ```

---

## P1: Performance & Resource Optimization

**4. Development Server Boot Time**

- [ ] Measure cold-start time for FastAPI dev server
  ```bash
  cd GRID-main
  time uv run python -m application.mothership.main
  ```

**5. Dependency Group Size Reduction**

- [ ] Minimize `dev` group dependencies to essentials only
  ```bash
  cd GRID-main
  uv pip install -e ".[dev]" --dry-run | grep -E "(already|would install)"
  ```

**6. CLI Tool Installation**

- [ ] Create single-command installation for GRID CLI tools
  ```bash
  cd GRID-main
  uv pip install -e .
  # Should expose all CLI scripts from pyproject.toml
  ```

**7. Docker Image Optimization**

- [ ] Reduce image size and build time with multi-stage builds
  ```bash
  cd GRID-main
  time docker build -t grid-minimal-test .
  docker images | grep grid-minimal-test
  ```

---

## P2: Developer Experience Enhancements

**8. Setup Documentation**

- [ ] Single-page quickstart guide with minimal steps
  ```bash
  cd GRID-main
  cat docs/quickstart.md | wc -l  # Should be < 50 lines
  ```

**9. Automated Environment Setup**

- [ ] Script to configure .env with sensible defaults
  ```bash
  cd GRID-main
  ./scripts/generate_env.sh  # Should generate working defaults
  ```

**10. Development Mode Toggle**

- [ ] Easy switch between full vs. minimal feature sets
  ```bash
  cd GRID-main
  GRID_DEV_MINIMAL=true uv run python -m application.mothership.main
  ```

---

## Cross-References

- VERIFICATION_CHECKLIST.md: Testing strategy for minimal setups
- POST_DEBUG_ROUTINE.md: Post-setup verification steps
- REMEDIATION_CHECKLIST.md: Resolving dependency conflicts

This checklist follows the phased structure from `docs/afloat-templates/implementation-checklist.md` with priority levels adapted from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md`.

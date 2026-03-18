# Bug Identification & Entry Point Investigation Checklist

Systematic approach to isolating and reproducing bugs in GRID-main.

## Priority System
- **P0**: Data corruption, security bypasses, complete service failures
- **P1**: Incorrect behavior, partial functionality loss
- **P2**: Minor UI inconsistencies, edge case behaviors

---

## P0: Critical Bug Investigation

**1. Security Incident Triage**
- [ ] Trace unauthorized access attempts to specific entry points
  ```bash
  cd GRID-main
  grep -rn "401\|403" logs/ --include="*.log"
  # Follow stack traces to routers
  ```

**2. Data Corruption Source Location**
- [ ] Use database transaction logs to trace corrupt writes
  ```bash
  # Placeholder for database-specific command
  psql -c "SELECT * FROM pg_xact ORDER BY xact_id DESC LIMIT 10;" 
  ```

**3. Service Availability Failure**
- [ ] Identify root cause of 5xx errors in production logs
  ```bash
  cd GRID-main
  grep -rn "500\|502\|503" logs/production.log | tail -20
  ```

---

## P1: High-Priority Debugging

**4. API Endpoint Behavior Mismatch**
- [ ] Compare actual vs. documented endpoint responses
  ```bash
  cd GRID-main
  # Generate OpenAPI spec and compare with actual responses
  uv run python -m application.mothership.main --openapi-json > expected_spec.json
  curl http://localhost:8080/api/v1/endpoint1 | jq . > actual_response.json
  diff expected_spec.json actual_response.json
  ```

**5. CLI Script Incorrect Output**
- [ ] Trace unexpected CLI results to specific function calls
  ```bash
  cd GRID-main
  GRID_DEBUG=1 uv run python scripts/reproduce_bug.py --verbose
  ```

**6. Authentication Flow Failure**
- [ ] Step through login/token refresh flows comparing with successful paths
  ```bash
  cd GRID-main
  python -m pdb -c continue scripts/debug_auth_flow.py
  # Use breakpoints in src/grid/auth/ or src/application/mothership/security/
  ```

**7. Database State Inconsistency**
- [ ] Check constraint violations and referential integrity breaks
  ```bash
  cd GRID-main
  # Database-specific integrity check
  psql -c "\di+"  # Check constraints
  ```

---

## P2: Secondary Investigation Areas

**8. Logging Completeness**
- [ ] Ensure all code paths emit appropriate debug/info logs
  ```bash
  cd GRID-main
  find src/ -name "*.py" -exec grep -L "logger\." {} \;
  # Files in output lack logging instrumentation
  ```

**9. Environmental Behavior Differences**
- [ ] Compare behavior under different configuration profiles
  ```bash
  cd GRID-main
  GRID_ENV=development uv run python -m application.mothership.main &
  # vs.
  GRID_ENV=staging uv run python -m application.mothership.main &
  ```

**10. Client SDK Integration Issues**
- [ ] Reproduce reported issues with exact client library versions
  ```bash
  cd GRID-main
  # Placeholder for client-specific reproduction
  python reproduce_client_issue.py --client-version=v1.2.3
  ```

---

## Investigation Tools

**Stack Trace Analysis**:
- Use `VERIFICATION_CHECKLIST.md` debug mode to get verbose stack traces
- Enable `GRID_DEBUG_STACK_TRACES=1` for full tracebacks

**Reproduction Scripts**:
- Create minimal `reproduce_*.py` scripts in `scripts/debug/`
- Reference `AFTERHOURS_CHECKLIST.md` for sprint-style debug approach

## Cross-References
- AFTERHOURS_CHECKLIST.md: Sprint-style debugging methodology
- SAFETY_DEBUG_CHECKLIST.md: Safe reproduction in isolated environments
- VERIFICATION_CHECKLIST.md: Debug mode activation and verbose logging

This checklist adapts the phased structure from `docs/afloat-templates/implementation-checklist.md` and the prioritization from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md`.
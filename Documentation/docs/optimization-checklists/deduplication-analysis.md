# Deduplication Analysis Checklist

Identify and eliminate duplicated code, configurations, and dependencies in GRID-main.

## Priority System

- **P0**: Security-relevant duplicates, runtime-breaking conflicts
- **P1**: Performance impact, maintenance burden
- **P2**: Code hygiene, developer experience

---

## P0: Critical Duplicates (Security/Runtime)

**1. Authentication Logic Duplication**

- [ ] Compare `src/grid/auth/` and `src/application/mothership/security/` for conflicting JWT implementations
  ```bash
  cd GRID-main
  diff <(find src/grid/auth -name "*.py" -exec sha256sum {} \;) <(find src/application/mothership/security -name "*.py" -exec sha256sum {} \;)
  ```
- [ ] Identify multiple auth endpoint definitions (e.g., `/login`, `/refresh`)
  ```bash
  cd GRID-main
  grep -r "POST.*\/login" src/
  ```

**2. Configuration Value Conflicts**

- [ ] Find duplicated configuration keys in `.env`, `.env.local`, and `settings.py`
  ```bash
  cd GRID-main
  grep -h "^[A-Z]" .env .env.local | sort | uniq -d
  ```

**3. Critical Dependency Version Conflicts**

- [ ] Check for multiple versions of security-relevant packages
  ```bash
  cd GRID-main
  uv pip list | grep -E "(cryptography|jose|jwt)" | sort
  ```

---

## P1: High-Impact Duplicates (Performance/Maintainability)

**4. Router Endpoint Overlaps**

- [ ] Find duplicate route definitions across routers
  ```bash
  cd GRID-main
  find src/application/mothership/routers -name "*.py" -exec grep -H "APIRouter()" {} \;
  ```

**5. Model/Schema Redundancy**

- [ ] Identify structurally identical Pydantic models or SQLAlchemy tables
  ```bash
  cd GRID-main
  grep -r "class.*\(BaseModel\|Table\)" src/ --include="*.py" | sort
  ```

**6. Utility Function Clones**

- [ ] Detect nearly identical helper functions in utils/
  ```bash
  cd GRID-main
  find src/ -name "*.py" -exec grep -l "def [a-z_]*(.*):" {} \; | xargs grep -o "def [a-z_]*(.*)"
  ```

**7. Database Query Repetition**

- [ ] Look for similar SQL queries or ORM statements
  ```bash
  cd GRID-main
  grep -r "\.query(\|\.execute(" src/ --include="*.py"
  ```

---

## P2: Low-Priority Duplicates (Hygiene)

**8. Comment/Docstring Redundancy**

- [ ] Identify copy-pasted documentation or comments
  ```bash
  cd GRID-main
  grep -r "^ *\*" src/ --include="*.py" | sort | uniq -c | sort -nr | head -10
  ```

**9. Import Statement Duplication**

- [ ] Consolidate redundant imports across files
  ```bash
  cd GRID-main
  find src/ -name "*.py" -exec grep -H "^import " {} \; | cut -d: -f2- | sort | uniq -c | sort -nr
  ```

**10. Template Literal Reuse**

- [ ] Find hardcoded strings duplicated in Jinja2 templates or f-strings
  ```bash
  cd GRID-main
  grep -r '"[^"]*"' src/ --include="*.py" | cut -d: -f2- | sort | uniq -d
  ```

---

## Cross-References

- VERIFICATION_CHECKLIST.md: Test coverage for identifying behavioral clones
- REMEDIATION_CHECKLIST.md: Steps for safely removing duplicates
- SAFETY_DEBUG_CHECKLIST.md: Ensuring no functional loss when consolidating code

This checklist borrows structure from `docs/afloat-templates/implementation-checklist.md` and priority system from `GRID-main/docs/security/REMEDIATION_CHECKLIST.md`.

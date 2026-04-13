# GRID Test Environment Setup — Structured Workthrough

**Objective**: Trace the complete test environment bootstrap from pytest startup through test execution, showing exactly how each layer is configured and why.

**Source**: [GRID Test Environment Setup and Configuration Codemap](codemap://GRID_Test_Environment_Setup_and_Configuration)

---

## Phase 1: Pytest Startup Bootstrap (Module Load)

**When**: Before any tests are collected or run
**Where**: `conftest.py` module-level code
**Files**: `conftest.py:1-46`

### Step 1a: Calculate Project Root

```python
_root = os.path.abspath(os.path.join(os.path.dirname(__file__)))
_src = os.path.join(_root, "src")
```

**Purpose**: Determine absolute paths so imports work regardless of where pytest is invoked.

### Step 1b: Clean Existing sys.path

```python
for _p in (_src, _root):
    while _p in sys.path:
        sys.path.remove(_p)
```

**Purpose**: Remove stale entries to prevent "repo root shadows src/grid" errors.

### Step 1c: Prioritize src Directory

```python
sys.path.insert(0, _src)
if _root not in sys.path:
    sys.path.append(_root)
```

**Purpose**: Ensure `import grid.resilience` resolves to `src/grid/resilience`, not a top-level `grid/` directory.

### Step 1d: Set Critical Environment Variables

```python
os.environ["GRID_ENV"] = "test"
os.environ["SAFETY_BYPASS_REDIS"] = "true"
os.environ["PARASITE_GUARD"] = "0"
```

**Purpose**:

- `GRID_ENV=test`: Code paths check this to enable test-friendly behavior
- `SAFETY_BYPASS_REDIS`: Don't try to connect to Redis during tests
- `PARASITE_GUARD=0`: Disable parasite guard for faster tests

### Step 1e: Configure Test Collection Ignore List

```python
collect_ignore = [
    "scripts/test_drt_functional.py",
    "scripts/test_timeout.py",
    "security/test_security.py",
    "src/test_semantic_chunking.py",
    # ... subdirectories
]
```

**Purpose**: Prevent pytest from collecting helper scripts or unrelated test files.

---

## Phase 2: Pytest Configuration Loading

**When**: pytest reads configuration before test collection
**Where**: `pyproject.toml`
**File**: `pyproject.toml:217-271`

### Step 2a: Configure Python Path

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
```

**Purpose**: Mirrors the sys.path manipulation from Phase 1 for pytest's import system.

### Step 2b: Define Test Paths

```toml
testpaths = ["tests", "safety/tests", "boundaries/tests"]
```

**Purpose**: Tell pytest where to search for test files.

### Step 2c: Enable Strict Asyncio Mode

```toml
asyncio_mode = "strict"
asyncio_default_fixture_loop_scope = "function"
```

**Purpose**: Require explicit `@pytest.mark.asyncio` on async tests; prevent "forgot to mark" bugs.

### Step 2d: Set Default Options

```toml
addopts = [
    "--import-mode=importlib",
    "--strict-markers",
    # ...
]
```

**Purpose**: Consistent import behavior and fail on unknown markers.

---

## Phase 3: Test Collection and Auto-Marking

**When**: pytest discovers test files
**Where**: `tests/conftest.py::pytest_collection_modifyitems()`
**File**: `tests/conftest.py:186-199`

### Step 3a: Hook Registration

```python
def pytest_collection_modifyitems(config, items):
    for item in items:
        rel = str(item.fspath)
```

**Purpose**: Intercept every test item before execution.

### Step 3b: Apply Directory-Based Markers

```python
if "/unit/" in rel or rel.endswith("test_unit_"):
    item.add_marker(pytest.mark.unit)
elif "/integration/" in rel or rel.endswith("test_integration_"):
    item.add_marker(pytest.mark.integration)
elif "/safety/" in rel or rel.endswith("test_safety_"):
    item.add_marker(pytest.mark.safety)
```

**Purpose**: Enable `pytest -m unit` to run only unit tests without manual marker decoration.

---

## Phase 4: Test Environment Priming (Per-Test)

**When**: Before every test via `autouse=True` fixture
**Where**: `reset_services()` fixture
**File**: `tests/conftest.py:263-320`

### Step 4a: Prime Environment

```python
@pytest.fixture(autouse=True)
def reset_services():
    _prime_test_environment()  # Re-sets env vars
```

**Purpose**: Reset `MOTHERSHIP_DATABASE_URL` and other critical vars before each test.

### Step 4b: Reload Settings

```python
try:
    from application.mothership.config import reload_settings
    reload_settings()
except ImportError:
    pass
```

**Purpose**: Clear any cached configuration from previous tests.

### Step 4c: Reset JWT Manager

```python
from application.mothership.security.jwt import reset_jwt_manager
reset_jwt_manager()
```

**Purpose**: Prevent stale JWT state between auth tests.

### Step 4d: Reset All Singletons

```python
from tests.utils.reset_helpers import reset_all_singletons
reset_all_singletons()
```

**Purpose**: Critical isolation layer. Calls:

- `reset_circuit_manager()`
- `reset_metrics_collector()`
- `reset_accountability_calculator()`
- `reset_rate_limiter_state()`
- `reset_mastermind_session()`
- `reset_parasite_profiler()`
- **`reset_db_engine()`** ← New: Clears async engine singleton

### Step 4e: Reset DB Engine (Cross-Loop Lock Fix)

```python
def reset_db_engine():
    _module = importlib.import_module("application.mothership.db.engine")
    _module._engine = None
    _module._sessionmaker = None
    _module._disposed = True
    _module._engine_lock = asyncio.Lock()  # Recreate lock for current loop
```

**Purpose**: The `asyncio.Lock()` created at module import time is bound to the event loop that existed then. When pytest creates a new loop for integration tests using `TestClient`, the old lock causes deadlocks. This recreates the lock bound to the current loop.

---

## Phase 5: Module-Scope Isolation

**When**: After each test module finishes
**Where**: `module_isolation()` fixture
**File**: `tests/conftest.py:323-347`

### Step 5a: GC Collection

```python
@pytest.fixture(scope="module", autouse=True)
def module_isolation():
    yield
    gc.collect()
```

**Purpose**: Force garbage collection of `TestClient` objects and their lifespan tasks.

### Step 5b: Event Loop Cleanup

```python
try:
    import asyncio
    loop = asyncio.get_event_loop()
    if loop.is_running():
        loop.stop()
except RuntimeError:
    pass
```

**Purpose**: Clean up any stuck event loops before the next module runs.

---

## Phase 6: Service Availability Detection

**When**: Session-scoped fixtures detect external services
**Where**: `conftest.py:436-447`

### Step 6a: Check Ollama Available

```python
def _check_ollama_available() -> bool:
    try:
        import httpx
        response = httpx.get("http://localhost:11434/api/tags", timeout=2.0)
        return response.status_code == 200
    except Exception:
        return False
```

**Purpose**: Conditionally skip tests requiring Ollama if not running.

---

## Phase 7: Mock Fixture Creation

**When**: Tests request mock fixtures
**Where**: Session-scoped fixtures
**Files**: `conftest.py:489-516`, `conftest.py:541`

### Step 7a: Mock Ollama Client

```python
@pytest.fixture(scope="session")
def mock_ollama_client():
    def mock_embeddings(model, prompt):
        return {"embedding": [0.1] * 768}
    # ... configure Mock object
    return mock_client
```

**Purpose**: Provide deterministic 768-dimension embeddings without network calls.

### Step 7b: Mock ChromaDB Client

```python
@pytest.fixture
def mock_chromadb_client():
    mock_client = Mock()
    mock_client.get_or_create_collection.return_value = mock_collection
    return mock_client
```

**Purpose**: Isolate tests from ChromaDB state and network.

---

## Execution Summary

| Phase | Trigger                     | Key Outcome                                        |
| ----- | --------------------------- | -------------------------------------------------- |
| 1     | Python imports conftest.py  | `grid.*` resolves to `src/grid`                    |
| 2     | pytest reads pyproject.toml | Async mode strict, testpaths set                   |
| 3     | Test collection             | `unit`/`integration`/`safety` markers auto-applied |
| 4     | Each test starts            | All singletons reset, env vars clean               |
| 5     | Each module ends            | GC forced, stale loops cleaned                     |
| 6     | Session start               | Service availability detected                      |
| 7     | Test requests fixture       | Mocks injected for external services               |

---

## Common Issues and Fixes

### Issue: Combined suite hangs (unit + integration)

**Root Cause**: `asyncio.Lock()` created at module import time bound to first event loop; second module's `TestClient` triggers `lifespan` → `dispose_async_engine()` tries to acquire old lock on new loop = deadlock.

**Fix**: `reset_db_engine()` in `reset_all_singletons()` recreates `asyncio.Lock()` bound to current loop before each test.

### Issue: `grid.resilience` ModuleNotFoundError

**Root Cause**: Repo root has a `grid/` directory shadowing `src/grid/`.

**Fix**: Phase 1 sys.path manipulation removes root and inserts `src` at position 0.

### Issue: Redis connection attempts in tests

**Root Cause**: Code doesn't check `SAFETY_BYPASS_REDIS`.

**Fix**: Phase 1 sets `SAFETY_BYPASS_REDIS=true` at import time, before any module imports Redis code.

---

## Verification Commands

```bash
# Verify Phase 1 (sys.path)
cd Projects/GRID-main && uv run python -c "import sys, grid; print([p for p in sys.path if 'grid' in p.lower()])"

# Verify Phase 4 (singleton reset)
cd Projects/GRID-main && uv run pytest tests/chaos -v --tb=short

# Verify combined suite (Phases 4-5 working)
cd Projects/GRID-main && timeout 120 uv run pytest tests/unit tests/integration -q
```

---

**Last Updated**: 2026-04-13
**Fix Applied**: `reset_db_engine()` in `tests/utils/reset_helpers.py`

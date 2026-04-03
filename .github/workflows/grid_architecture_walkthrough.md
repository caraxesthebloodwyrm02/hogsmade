# GRID Multi-System Architecture — A Complete Walkthrough

This document traces the GRID architecture across three major systems: the Mothership FastAPI backend (Python), the event-driven agentic case processing system, and the TypeScript MCP server infrastructure with audit logging.

---

## **1. Mothership FastAPI Application Startup & Initialization** (Trace 1)

The Mothership is GRID's production FastAPI backend. It orchestrates database connections, service initialization, middleware registration, and router setup.

### How Startup Works

```text
create_app() factory
    ↓
FastAPI() instantiation with lifespan
    ↓
Lifespan startup phase
    ├─ Database engine initialization
    ├─ Cockpit service initialization
    ├─ Payment reconciliation loop
    ├─ Critical settings validation
    └─ Safety database initialization
    ↓
Middleware chain setup (8 layers)
    ↓
Router registration (auth, payment, agentic, health, etc.)
    ↓
Application ready
```

### Application Factory Entry Point

The `create_app()` factory is the single entry point for creating the FastAPI application:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:594
def create_app(settings: MothershipSettings | None = None) -> FastAPI:
    """
    Create and configure the FastAPI application.
```

### FastAPI Instance with Lifespan Management

The app uses a **lifespan context manager** to handle startup and shutdown:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:608
app = FastAPI(
    title=settings.app_name,
    description="""
```

### Critical Startup Sequence

During the lifespan startup phase, the system initializes in strict order:

**1. Database Engine Initialization**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:348
get_async_engine()
logger.info("Database engine initialized")
```

**2. Cockpit Service Initialization**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:358
cockpit = get_cockpit_service()
logger.info("Cockpit service initialized")
```

**3. Middleware Chain Setup**

Eight middleware layers are registered in specific order:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:717
setup_middleware(app, settings)
```

The middleware stack includes:

- **CORSMiddleware** — cross-origin resource sharing
- **GZipMiddleware** — response compression
- **SecurityHeadersMiddleware** — security headers
- **RequestLoggingMiddleware** — request/response logging
- **TimingMiddleware** — performance monitoring
- **RequestIDMiddleware** — request tracing
- **UsageTrackingMiddleware** — usage metrics
- **RateLimitMiddleware** — rate limiting

**4. Router Registration**

All API routers are dynamically imported and registered:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/__init__.py:165
router.include_router(imported_router, **router_kwargs)
```

Routers include:

- **auth** — authentication endpoints
- **payment** — payment processing
- **agentic** — agentic case management
- **health** — health checks
- Additional domain-specific routers

---

## **2. HTTP Request Flow: Health Check Endpoint Execution** (Trace 2)

Every HTTP request flows through the middleware chain before reaching the endpoint handler.

### Request Flow Diagram

```text
Incoming HTTP Request
    ↓
RequestIDMiddleware → Assign/retrieve X-Request-ID
    ↓
TimingMiddleware → Record start_time
    ↓
LoggingMiddleware → Log request details
    ↓
Router Dispatch → /health endpoint
    ↓
Database Connectivity Check
    ├─ Parse database URL
    ├─ Create async engine
    ├─ Test connection with timeout
    └─ Return (is_healthy, message)
    ↓
Response Path
    ↓
TimingMiddleware → Add X-Process-Time header
    ↓
HTTP Response
```

### Middleware Execution Order

**1. Request ID Assignment**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:231
async def request_id_middleware(request: Request, call_next: Callable) -> Response:
    """Add request ID to all requests."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
```

**2. Timing Start**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:245
async def timing_middleware(request: Request, call_next: Callable) -> Response:
    """Add request timing information."""
    start_time = time.time()
```

**3. Request Logging**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:261
logger.info(
    "Request: %s %s client=%s request_id=%s",
    request.method,
```

### Health Check Handler

The health endpoint verifies database connectivity:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/health.py:60
async def _check_database_connectivity(db_url: str, timeout: float = 5.0) -> tuple[bool, str]:
    """
    Check database connectivity with actual connection test.
```

**Database Connection Test**

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/health.py:87
engine = create_async_engine(async_url, pool_pre_ping=True)
```

### Response Timing

On the way back, timing middleware calculates total duration:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:250
process_time = time.time() - start_time
response.headers["X-Process-Time"] = f"{process_time:.4f}"
```

---

## **3. Agentic Case Creation: Event-Driven Processing Flow** (Trace 3)

The agentic system processes user input through a receptionist workflow and emits events for downstream handlers.

### Event-Driven Architecture

```text
POST /api/v1/agentic/cases
    ↓
Input Sanitization Layer
    └─ sanitize_text_for_llm()
    ↓
Processing Unit
    └─ Receptionist Workflow
        └─ Returns ProcessingResult
    ↓
Event System Integration
    ├─ Create CaseCreatedEvent
    └─ Event Bus
        ├─ emit(event)
        └─ Registered Handlers
            └─ handle_case_created()
    ↓
Response: CaseResponse
```

### Case Creation Endpoint

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/agentic.py:75
@router.post("/cases", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    request: CaseCreateRequest,
```

### Security: Input Sanitization

**Critical security layer** — sanitizes input before processing:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/agentic.py:88
safe_raw_input = sanitize_text_for_llm(request.raw_input, "raw_input")
```

This prevents:

- SQL injection
- Prompt injection
- XSS attacks
- Other malicious input

### Processing Unit Invocation

The sanitized input is processed through the receptionist workflow:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/agentic.py:90
result = processing_unit.process_input(
    raw_input=safe_raw_input,
    user_context=request.user_context,
```

### Event Bus Integration

After processing, a `CaseCreatedEvent` is emitted:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/routers/agentic.py:98
created_event = CaseCreatedEvent(
    case_id=result.case_id,
    raw_input=safe_raw_input,
```

The event bus distributes the event to all registered handlers:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/grid/agentic/event_bus.py:45
# Event bus receives and distributes the event to all registered handlers
```

### Event Handler Execution

Registered handlers process the event asynchronously:

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/grid/agentic/event_handlers.py:30
# Registered handler processes the case created event for downstream actions
```

**Key Insight**: The event-driven architecture decouples case creation from downstream processing, enabling:

- Asynchronous workflows
- Multiple handlers per event
- Failure isolation
- Audit trail generation

---

## **4. Eligibility Evolution Cycle: Map-Balance-Tighten-Verify Flow** (Trace 4)

The eligibility-server implements a **4-beat evolution cycle** for candidate evaluation with promotion gate enforcement.

### Evolution Cycle Beats

```text
Evolution Case Lifecycle
    ↓
Map Beat (initial evaluation)
    ↓
Balance Beat (refinement)
    ↓
Tighten Beat (final adjustments)
    ↓
Verify Beat (promotion pending)
    ↓
Promotion Gate Evaluation
    ├─ Pass → Case promoted
    └─ Fail → Return to Tighten beat
```

### Case Initialization

```json
// @/home/caraxes/.echoes/audit.ndjson:18
{ "source": "eligibility-server", "tool": "evolution_case_opened", "status": "success" }
```

A new evolution case starts at the **map** beat with active status.

### Beat Progression Sequence

**1. Map → Balance Transition**

```json
// @/home/caraxes/.echoes/audit.ndjson:24
{ "source": "eligibility-server", "tool": "evolution_beat_advanced", "status": "success" }
```

**2. Balance → Tighten Transition**

```json
// @/home/caraxes/.echoes/audit.ndjson:25
{ "source": "eligibility-server", "tool": "evolution_beat_advanced", "status": "success" }
```

**3. Tighten → Verify Transition**

```json
// @/home/caraxes/.echoes/audit.ndjson:26
{ "source": "eligibility-server", "tool": "evolution_beat_advanced", "status": "success" }
```

At this point, the case enters **promotion_pending** status.

### Promotion Gate Evaluation

The promotion gate evaluates whether the case is ready for promotion:

```json
// @/home/caraxes/.echoes/audit.ndjson:27
{ "source": "eligibility-server", "tool": "evolution_promotion_blocked", "status": "success" }
```

**Decision: hold_for_tighten** — the cycle returns to the tighten beat for additional refinement.

### Signal Recording (Parallel)

While the cycle progresses, runtime signals influence the eligibility score:

```json
// @/home/caraxes/.echoes/audit.ndjson:21
{ "source": "eligibility-server", "tool": "evolution_signal_recorded", "status": "success" }
```

Signal types include:

- `integration_call_succeeded`
- `integration_call_failed`
- `test_passed`
- `test_failed`
- `endpoint_spec_changed`
- `handoff_submitted/accepted/rejected`

**Key Insight**: The evolution cycle is **iterative** — cases can loop through tighten→verify→tighten until the promotion gate passes.

---

## **5. MCP Server Audit Trail: Tool Execution and Precedent Tracking** (Trace 5)

The MCP infrastructure maintains a **comprehensive audit trail** of all tool executions across servers.

### Audit Log Structure

```text
MCP Server Audit Infrastructure
    ↓
Audit Log Storage (.echoes/audit.ndjson)
    ├─ Tool execution entries
    │   ├─ pulse-server: morning_briefing
    │   ├─ grid-server: validate_envelope
    │   ├─ seeds-server: ecosystem_scan
    │   └─ overview-server: checkpoint
    └─ Metadata tracking
        ├─ Status (success/failure/blocked)
        ├─ Duration metrics
        └─ Tool-specific context
```

### Tool Execution Examples

**1. Pulse Server: Morning Briefing**

```json
// @/home/caraxes/.echoes/audit.ndjson:9
{ "source": "pulse-server", "tool": "morning_briefing", "status": "success" }
```

**2. Grid Server: Envelope Validation (Success)**

```json
// @/home/caraxes/.echoes/audit.ndjson:10
{ "source": "grid-server", "tool": "validate_envelope", "status": "success" }
```

All 10 validation checks passed without enhanced consultation.

**3. Grid Server: Envelope Validation (Fail-Closed)**

```json
// @/home/caraxes/.echoes/audit.ndjson:11
{ "source": "grid-server", "tool": "validate_envelope", "status": "failure" }
```

Validation failed with enhanced consultation, demonstrating **fail-closed** security posture.

**4. Seeds Server: Ecosystem Health Scan**

```json
// @/home/caraxes/.echoes/audit.ndjson:15
{ "source": "seeds-server", "tool": "ecosystem_scan", "status": "success" }
```

Scanned 8 repositories with 86 overall health score, no issues detected.

**5. Overview Server: Checkpoint Assessment**

```json
// @/home/caraxes/.echoes/audit.ndjson:110
{ "source": "overview-server", "tool": "checkpoint", "status": "success" }
```

Evaluates trust score (57), drift severity, and trajectory.

### Precedent & Enforcement System

The audit system tracks:

- **Recurrence pattern detection** — identifies repeated failures
- **Escalation level tracking** — observed → flagged → restricted → blocked
- **Audit trail integrity** — hash chain verification

**Key Insight**: The MCP audit trail is **independent** from the Python Mothership system — it operates at the tool invocation layer across all MCP servers.

---

## **6. Security Middleware Stack: Multi-Layer Defense Chain** (Trace 6)

The Mothership implements a **layered security architecture** with multiple defense mechanisms.

### Security Middleware Execution Order

```text
Incoming Request
    ↓
Standard Middleware (CORS, GZip)
    ↓
Stream Monitoring Middleware
    ↓
Data Corruption Detection Middleware
    ↓
DRT Behavioral Monitoring Middleware
    ↓
Parasite Guard (Total Rickall Defense)
    ↓
Safety Middleware (MANDATORY)
    ├─ Auth enforcement
    ├─ Suspension checks
    ├─ Rate limiting
    ├─ Pre-check validation
    └─ Request enqueue
    ↓
Endpoint Handler
```

### Layer 1: Stream Monitoring

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:730
app.add_middleware(StreamMonitorMiddleware)
logger.info("Stream monitoring middleware enabled")
```

Monitors streaming responses for anomalies and exports Prometheus metrics.

### Layer 2: Data Corruption Detection

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:744
corruption_tracker = DataCorruptionPenaltyTracker()
app.add_middleware(
    DataCorruptionDetectionMiddleware,
    tracker=corruption_tracker,
```

Tracks and penalizes endpoints that cause data or environment corruption.

### Layer 3: DRT Behavioral Monitoring

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:762
app.add_middleware(
    UnifiedDRTMiddleware,
    enabled=settings.security.drt_enabled,
```

**Don't Repeat Themselves** — monitors endpoint behaviors for attack vector similarities.

### Layer 4: Parasite Guard (Total Rickall Defense)

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:822
mode = "full" if settings.security.parasite_guard_pruning_enabled else "detect"
middleware = add_parasite_guard(app, mode=mode)
```

Detects and sanitizes **parasitic code injection** attempts.

### Layer 5: Safety Middleware (MANDATORY)

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:810
app.add_middleware(SafetyMiddleware)
logger.info("Safety enforcement middleware enabled (MANDATORY)")
```

The **final and mandatory** security layer that enforces:

- Authentication
- User suspension checks
- Rate limiting
- Pre-check validation
- Request enqueue

### Security Factory Defaults

```python
# @/home/caraxes/CascadeProjects/GRID-main/src/application/mothership/main.py:722
apply_defaults(app)
logger.info("Security factory defaults applied")
```

Applies baseline security configuration to all endpoints via API sentinels.

**Key Insight**: Security is **layered and mandatory** — requests must pass through all layers before reaching handlers.

---

## **7. Rate Limiting and Vection Audit: Security Event Chain** (Trace 7)

The Vection audit system provides **tamper-evident security logging** with hash chain integrity.

### Security Audit System Architecture

```text
Security Audit System
    ↓
AuditLogger Initialization
    └─ Hash chain enabled (genesis)
    ↓
Rate Limiting Flow
    ├─ Session: test_session (1/100, 1%)
    └─ Session: test_rate_limit_session
        ├─ Check 1: 1/3 (33%)
        ├─ Check 2: 2/3 (67%)
        ├─ Check 3: 3/3 (100%)
        └─ Rate limit exceeded warning
    ↓
Input Validation Layer
    └─ SQL injection detected & blocked
```

### Audit Logger Initialization

```json
// @/home/caraxes/CascadeProjects/GRID-main/logs/security/vection_audit.log:1
{ "event_id": "evt_1774062997011089_00000001", "timestamp": "2026-03-21T03:16:..." }
```

The audit system starts with **hash chain enabled** for tamper detection.

### Rate Limit Enforcement

**Check 1: Low Utilization**

```json
// @/home/caraxes/CascadeProjects/GRID-main/logs/security/vection_audit.log:3
{"event_id": "evt_1774062997026415_00000003", ...}
```

1/100 requests used in 60-second window, 1% utilization.

**Check 2: Approaching Limit**

```json
// @/home/caraxes/CascadeProjects/GRID-main/logs/security/vection_audit.log:7
{"event_id": "evt_1774062997034846_00000007", ...}
```

3/3 requests used, 100% utilization before enforcement.

**Check 3: Limit Exceeded**

```json
// @/home/caraxes/CascadeProjects/GRID-main/logs/security/vection_audit.log:8
{"event_id": "evt_1774062997035045_00000008", ...}
```

Warning severity: rate limit exceeded, request blocked with audit trail.

### Input Validation: SQL Injection Detection

```json
// @/home/caraxes/CascadeProjects/GRID-main/logs/security/vection_audit.log:13
{"event_id": "evt_1774062997066146_00000013", ...}
```

Input validation catches SQL injection attempt with **hash chain integrity preserved**.

**Key Insight**: The Vection audit log is **tamper-evident** — any modification breaks the hash chain, making security events immutable.

---

## **8. End-to-End System Integration**

Now let's see how all three systems work together in a complete workflow.

### Complete Request Flow

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. APPLICATION STARTUP (Mothership)                         │
│    ├─ Database engine initialization                        │
│    ├─ Cockpit service initialization                        │
│    ├─ Security middleware stack registration                │
│    └─ Router registration (auth, payment, agentic, health)  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. INCOMING HTTP REQUEST                                    │
│    POST /api/v1/agentic/cases                               │
│    Body: { raw_input: "user request", user_context: {...} } │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. SECURITY MIDDLEWARE CHAIN                                │
│    ├─ RequestIDMiddleware → Assign X-Request-ID             │
│    ├─ TimingMiddleware → Record start_time                  │
│    ├─ LoggingMiddleware → Log request                       │
│    ├─ StreamMonitorMiddleware → Monitor streaming           │
│    ├─ DataCorruptionDetectionMiddleware → Track corruption  │
│    ├─ UnifiedDRTMiddleware → Behavioral monitoring          │
│    ├─ ParasiteGuard → Injection defense                     │
│    └─ SafetyMiddleware (MANDATORY)                          │
│        ├─ Auth enforcement                                   │
│        ├─ Rate limiting (Vection audit)                     │
│        └─ Pre-check validation                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. AGENTIC CASE PROCESSING                                  │
│    ├─ Input sanitization (sanitize_text_for_llm)           │
│    ├─ Processing unit invocation                            │
│    │   └─ Receptionist workflow execution                   │
│    ├─ Event creation (CaseCreatedEvent)                     │
│    └─ Event bus emission                                    │
│        └─ Registered handlers process event                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. MCP SERVER INTEGRATION (Parallel)                        │
│    ├─ eligibility-server: Open evolution case               │
│    │   ├─ Beat: map → balance → tighten → verify           │
│    │   ├─ Signal recording (integration success/failure)    │
│    │   └─ Promotion gate evaluation                         │
│    ├─ seeds-server: Ecosystem health scan                   │
│    ├─ overview-server: Checkpoint assessment                │
│    └─ All executions logged to .echoes/audit.ndjson         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. AUDIT TRAIL GENERATION                                   │
│    ├─ MCP audit log (.echoes/audit.ndjson)                  │
│    │   ├─ Tool execution records                            │
│    │   ├─ Status tracking (success/failure/blocked)         │
│    │   └─ Precedent pattern detection                       │
│    └─ Vection security audit (logs/security/vection_audit.log)│
│        ├─ Rate limit events                                  │
│        ├─ Input validation events                            │
│        └─ Hash chain integrity verification                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. RESPONSE PATH                                            │
│    ├─ TimingMiddleware → Add X-Process-Time header          │
│    ├─ Response serialization                                │
│    └─ HTTP 201 Created                                      │
│        Body: { case_id, status, processing_result }         │
└─────────────────────────────────────────────────────────────┘
```

### Three Independent Systems

The GRID architecture consists of **three loosely-coupled systems**:

**1. Mothership FastAPI Backend (Python)**

- Production HTTP API
- Database persistence
- Security middleware stack
- Event-driven agentic processing

**2. Eligibility Evolution System (TypeScript MCP)**

- 4-beat evolution cycle (map→balance→tighten→verify)
- Promotion gate enforcement
- Signal-driven scoring
- Independent from Mothership

**3. MCP Audit Infrastructure (TypeScript)**

- Cross-server tool execution logging
- Precedent pattern detection
- Escalation level tracking
- Tamper-evident audit trail

### Key Integration Points

1. **Event Bus** — decouples case creation from downstream processing
2. **MCP Audit Trail** — provides observability across all tool executions
3. **Vection Security Audit** — tamper-evident security event logging
4. **Middleware Chain** — layered security enforcement
5. **Promotion Gate** — quality control for evolution cycles

### Critical Dependencies

```text
Mothership FastAPI Application
    ├─ Database (PostgreSQL via asyncpg)
    ├─ Cockpit Service (application state)
    ├─ Event Bus (case processing)
    └─ Security Middleware Stack
        ├─ Safety Middleware (MANDATORY)
        ├─ Parasite Guard
        ├─ DRT Monitoring
        ├─ Data Corruption Detection
        └─ Stream Monitoring

MCP Server Infrastructure (Independent)
    ├─ eligibility-server (evolution cycles)
    ├─ seeds-server (ecosystem health)
    ├─ overview-server (checkpoint assessment)
    ├─ pulse-server (morning briefing)
    └─ echoes-server (audit aggregation)

Audit Systems (Independent)
    ├─ MCP Audit Log (.echoes/audit.ndjson)
    │   └─ Precedent tracking & escalation
    └─ Vection Security Audit (logs/security/)
        └─ Hash chain integrity verification
```

### What Makes This Architecture Robust

- **Layered Security** — multiple defense mechanisms with fail-closed defaults
- **Event-Driven** — asynchronous processing with failure isolation
- **Tamper-Evident Logging** — hash chain prevents audit trail modification
- **Independent Systems** — MCP servers operate independently from Mothership
- **Promotion Gates** — quality control prevents premature advancement
- **Comprehensive Audit Trail** — every tool execution is logged with metadata

### Quick Reference Commands

```bash
# Start Mothership (from GRID-main/)
cd CascadeProjects/GRID-main
uv run python -m application.mothership.main

# Run tests
uv run pytest tests/unit/ -q --tb=short
uv run pytest tests/ --cov=src

# Check MCP audit trail
cat ~/.echoes/audit.ndjson | jq 'select(.source=="eligibility-server")'

# Check Vection security audit
cat CascadeProjects/GRID-main/logs/security/vection_audit.log | jq

# Health check
curl http://localhost:8080/health

# Create agentic case
curl -X POST http://localhost:8080/api/v1/agentic/cases \
  -H "Content-Type: application/json" \
  -d '{"raw_input": "test input", "user_context": {}}'
```

---

## Summary: GRID Multi-System Architecture

The GRID architecture demonstrates **defense in depth** through:

1. **Mothership FastAPI Backend** — production-grade HTTP API with comprehensive middleware
2. **Event-Driven Agentic System** — decoupled case processing with event bus
3. **Eligibility Evolution Cycles** — iterative quality improvement with promotion gates
4. **MCP Audit Infrastructure** — cross-server observability and precedent tracking
5. **Vection Security Audit** — tamper-evident security event logging
6. **Multi-Layer Security** — 8+ middleware layers with mandatory safety enforcement

The system is designed for **reliability, security, and observability** — every request is traced, every tool execution is logged, and every security event is recorded with tamper-evident integrity.

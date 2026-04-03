# GRID-main HTTP Call Site Audit

**Date:** 2026-03-14  
**Purpose:** Identify all HTTP call sites in GRID-main that need resilience wrapping (circuit breaker, retry, rate limiting).

---

## Summary

| Category            | Files  | Call Sites | Priority |
| ------------------- | ------ | ---------- | -------- |
| httpx.AsyncClient   | 12     | 18         | High     |
| httpx.Client (sync) | 6      | 8          | High     |
| requests.get/post   | 6      | 9          | Medium   |
| **Total**           | **24** | **35**     | —        |

---

## High Priority — External API Calls (need circuit breaker + retry + rate limit)

### 1. Gemini Cloud Client

- **File:** `infrastructure/cloud/gemini_client.py`
- **Pattern:** `httpx.AsyncClient` with hardcoded timeout
- **Risk:** External API, rate limits, auth failures
- **Action:** Wrap with circuit breaker + retry (skip 401/403) + rate limiter

### 2. OpenAI Moderation Provider

- **File:** `src/grid/skills/ai_safety/providers/openai.py`
- **Pattern:** `requests.post` to `api.openai.com/v1/moderations`
- **Risk:** External API, rate limits (429), billing
- **Action:** Wrap with circuit breaker + retry (honor 429 Retry-After) + rate limiter
- **Note:** Already has manual retry loop (`max_retries`) — replace with `observed_retry`

### 3. API Gateway Proxy

- **File:** `src/infrastructure/api_gateway/gateway.py`
- **Pattern:** `httpx.AsyncClient` for health checks + request proxying
- **Risk:** Fan-out to multiple services, cascading failures
- **Action:** Per-service circuit breaker + retry + timeout enforcement

### 4. Safety Model Client

- **File:** `safety/model/client.py`
- **Pattern:** `httpx.AsyncClient` with connection pooling
- **Risk:** Safety-critical path, must not silently fail
- **Action:** Circuit breaker (fast-fail) + retry with aggressive timeout + fallback to local model

### 5. Safety Escalation Notifier

- **File:** `safety/escalation/notifier.py`
- **Pattern:** `httpx.AsyncClient` for Slack/PagerDuty webhooks
- **Risk:** Fire-and-forget but must not block main path
- **Action:** Circuit breaker + async retry (non-blocking) + rate limiter (webhook throttling)

---

## High Priority — Internal Service Calls (need circuit breaker + retry)

### 6. MCP Tool Registry

- **File:** `src/grid/mcp/tool_registry.py`
- **Pattern:** `httpx.AsyncClient` with connection pooling, health check task
- **Risk:** Cross-service calls, connection exhaustion
- **Action:** Circuit breaker per server + retry + connection limit enforcement

### 7. Inference Harness (Ollama)

- **File:** `src/grid/services/inference_harness.py`
- **Pattern:** `httpx.get` (sync health check) + `httpx.AsyncClient` (inference)
- **Risk:** Local service, may be down/restarting
- **Action:** Circuit breaker + retry with backoff + health check integration

### 8. RAG Chat Engine

- **File:** `src/tools/rag/chat.py`
- **Pattern:** `httpx.AsyncClient` for model listing + streaming chat
- **Risk:** Long-running streams, timeout issues
- **Action:** Circuit breaker + retry (non-streaming only) + timeout enforcement

### 9. RAG OpenAI-Compatible Client

- **File:** `src/tools/rag/llm/openai_compatible.py`
- **Pattern:** `httpx.Client` + `httpx.AsyncClient` (persistent, pooled)
- **Risk:** External or local LLM API
- **Action:** Circuit breaker + retry + rate limiter for external endpoints

### 10. RAG Ollama Local Client

- **File:** `src/tools/rag/llm/ollama_local.py`
- **Pattern:** `httpx.Client` (sync, per-request)
- **Risk:** Local service availability
- **Action:** Circuit breaker + retry

### 11. RAG Reranker

- **File:** `src/tools/rag/retrieval/reranker.py`
- **Pattern:** `httpx.AsyncClient` with connection pooling
- **Risk:** Concurrent scoring requests
- **Action:** Circuit breaker + retry + concurrency limiter

---

## Medium Priority — Utility/Support Calls (need retry)

### 12. RAG Utilities (Ollama health)

- **File:** `src/tools/rag/utils.py`
- **Pattern:** `httpx.Client` for health/model listing
- **Risk:** Low — informational only
- **Action:** Retry with short timeout, no circuit breaker needed

### 13. RAG Structured LLM

- **File:** `src/tools/rag/llm/structured.py`
- **Pattern:** `httpx.AsyncClient` for JSON-mode generation
- **Action:** Retry + timeout

### 14. RAG Function Calling LLM

- **File:** `src/tools/rag/llm/functions.py`
- **Pattern:** `httpx.AsyncClient` for function-calling generation
- **Action:** Retry + timeout

### 15. RAG Copilot (web scraping)

- **File:** `src/tools/rag/llm/copilot.py`
- **Pattern:** `httpx.Client` for URL fetching
- **Action:** Retry + timeout + rate limiter (polite crawling)

### 16. Nomic Embeddings

- **File:** `src/tools/rag/embeddings/nomic_v2.py`
- **Pattern:** `httpx.Client` for embedding API
- **Action:** Retry + rate limiter

### 17. Mothership Health Router

- **File:** `src/application/mothership/routers/health.py`
- **Pattern:** `httpx.AsyncClient` for Gemini API health + endpoint probes
- **Action:** Retry with short timeout (health checks should fail fast)

### 18. Auth Provider

- **File:** `src/application/mothership/security/auth_provider.py`
- **Pattern:** `httpx.AsyncClient` for token validation
- **Risk:** Auth-critical path
- **Action:** Circuit breaker + retry + cache valid tokens

---

## Medium Priority — Knowledge Base & Monitoring

### 19. KB Ingestion Pipeline

- **File:** `knowledge_base/ingestion/pipeline.py`
- **Pattern:** `requests.get` for URL fetching + API health + endpoint data
- **Risk:** External data sources
- **Action:** Retry + timeout + rate limiter (per-source)

### 20. KB Monitoring System

- **File:** `knowledge_base/monitoring/system.py`
- **Pattern:** `.get()` calls (dict, not HTTP — false positive)
- **Action:** None needed

### 21. Health Monitor Script

- **File:** `scripts/monitoring/monitor_health.py`
- **Pattern:** `requests.get` for Prometheus metrics + health endpoint
- **Action:** Retry + timeout

### 22. Security Monitoring (webhook)

- **File:** `safety/observability/security_monitoring.py`
- **Pattern:** `httpx.Client` for webhook notifications
- **Action:** Retry (fire-and-forget)

---

## Low Priority — Test/Dev Only

### 23. Fetch Market Data Template

- **File:** `src/tools/scripts/fetch_market_data_template.py`
- **Pattern:** `httpx.AsyncClient` — template/example code
- **Action:** Add resilience pattern examples to template

### 24. Network Interceptor (security)

- **File:** `security/network_interceptor.py`
- **Pattern:** Monkey-patches `requests.*` for access control
- **Action:** Ensure resilience decorators compose correctly with interceptor

### 25. Cloud Provider Init

- **File:** `infrastructure/cloud/__init__.py`
- **Pattern:** `httpx.AsyncClient` or `aiohttp` session
- **Action:** Abstract behind resilience wrapper

---

## Existing Resilience in GRID-main

GRID-main already has resilience primitives at `src/grid/resilience/`:

| Module                   | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `retry_decorator.py`     | `@retry` and `@async_retry` with exponential backoff |
| `observed_decorators.py` | Retry/fallback + metrics collection                  |
| `metrics.py`             | MetricsCollector for resilience events               |
| `policies.py`            | Policy definitions                                   |
| `api.py`                 | Resilience API endpoints                             |

**Gap analysis:** GRID-main has retry but **no circuit breaker** and **no rate limiter**. The `shared-resilience` TypeScript package mirrors and extends these patterns for the MCP server ecosystem.

---

## Recommended Implementation Order

1. **Safety-critical paths first:** `safety/model/client.py`, `safety/escalation/notifier.py`
2. **External APIs:** `gemini_client.py`, `openai.py` (rate limit + circuit breaker)
3. **Core infrastructure:** `api_gateway/gateway.py`, `tool_registry.py`, `auth_provider.py`
4. **RAG pipeline:** All `src/tools/rag/` clients (circuit breaker + retry)
5. **Monitoring/scripts:** Low-risk, add retry only

---

## Integration Pattern (Python side)

```python
from grid.resilience.observed_decorators import observed_async_retry
from grid.resilience.retry_decorator import async_retry

# For external APIs with existing retry:
@observed_async_retry(
    "safety.model.inference",
    max_attempts=3,
    exceptions=(httpx.TimeoutException, httpx.ConnectError)
)
async def call_model(prompt: str) -> str:
    ...

# For new circuit breaker (needs implementation in GRID-main):
# TODO: Port CircuitBreaker from shared-resilience to Python
```

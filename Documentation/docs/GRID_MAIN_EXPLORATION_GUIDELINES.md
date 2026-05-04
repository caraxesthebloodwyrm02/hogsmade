# GRID-Main Exploration Guidelines

## Overview

GRID-main is the central intelligence hub of the CascadeProjects ecosystem - a FastAPI-based application serving as the core reasoning and processing engine.

## 🗺️ Navigation Map

### Core Structure

```
GRID-main/
├── src/
│   ├── application/
│   │   └── mothership/          # Main FastAPI app
│   ├── grid/                    # Core GRID logic
│   ├── tools/                   # RAG and AI tools
│   └── services/                # External service clients
├── tests/                       # Test suites
├── docs/                        # Documentation
└── pyproject.toml              # Python project config
```

## 📋 Exploration Checklist

### Phase 1: Understanding the Architecture

- [ ] **Review Main Entry Point**
  - `src/application/mothership/main.py` - FastAPI application setup
  - Look for router registrations and middleware
  - Identify configuration loading and environment setup

- [ ] **Examine API Structure**
  - `src/application/mothership/routers/` - All API endpoints
  - Key routers: `intelligence.py`, `health.py`, `metrics.py`
  - Note authentication and permission decorators

- [ ] **Study Core GRID Logic**
  - `src/grid/` - Core reasoning and intelligence modules
  - `awareness/` - Context management
  - `patterns/` - Pattern recognition
  - `interfaces/` - External integrations

### Phase 2: Key Components Deep Dive

- [ ] **RAG Integration**
  - `src/tools/rag/` - Complete RAG implementation
  - `rag_engine.py` - Main orchestration
  - `config.py` - Configuration management
  - Test the indexing and query pipeline

- [ ] **Safety & Security**
  - Look for `safety/`, `security/`, `boundaries/` modules
  - Understand validation layers and guardrails
  - Review audit trail implementation

- [ ] **Service Integrations**
  - `src/services/` - External service clients
  - Check Ollama integration for LLM services
  - Review embedding service connections

### Phase 3: Data Flow Analysis

- [ ] **Request Processing**
  - Trace a request from entry to response
  - Identify middleware and processing stages
  - Document error handling patterns

- [ ] **Context Management**
  - How is context tracked across requests?
  - Session management implementation
  - Memory persistence mechanisms

- [ ] **Async Operations**
  - Identify async/await patterns
  - Background task processing
  - Concurrent request handling

## 🔍 Specific Exploration Commands

### 1. Quick Health Check

```bash
cd /home/caraxes/CascadeProjects/GRID-main
uv run python -m application.mothership.main --help
```

### 2. Test API Endpoints

```bash
# Start the server
uv run python -m application.mothership.main

# In another terminal:
curl http://localhost:8080/health
curl http://localhost:8080/metrics
```

### 3. Run Tests

```bash
# Unit tests
uv run pytest tests/unit/ -v

# Integration tests
uv run pytest tests/ --cov=src

# RAG-specific tests
uv run pytest tests/test_rag*.py
```

### 4. Explore RAG System

```bash
# Index some documentation
uv run python -m tools.rag.cli index /path/to/docs --rebuild

# Query the system
uv run python -m tools.rag.cli query "Your question here"
```

## 📊 Key Areas to Investigate

### 1. Configuration System

- Environment variable handling
- Configuration validation
- Default values and overrides

### 2. Authentication & Authorization

- JWT token implementation
- Role-based access control
- API key management

### 3. Performance Characteristics

- Request latency patterns
- Memory usage profiles
- Concurrent request limits

### 4. Error Handling

- Exception hierarchy
- Error response formats
- Logging and monitoring

### 5. External Dependencies

- Ollama model connections
- Database connections (if any)
- MCP server integrations

## 🛠️ Development Setup

### Prerequisites

```bash
# Ensure you're in GRID-main directory
cd /home/caraxes/CascadeProjects/GRID-main

# Install dependencies
uv sync --group dev --group test

# Set up environment
cp .env.example .env
# Edit .env with your settings
```

### Common Development Tasks

```bash
# Add new dependency
uv add package-name

# Run with specific environment
RAG_LLM_MODEL_LOCAL=model-name uv run python script.py

# Format code
uv run ruff format .
uv run ruff check .
```

## 🔗 Integration Points

### With MCP Servers

- **Echoes-server**: Audit logging
- **Grid-server**: Direct intelligence processing
- **Pulse-server**: Health and metrics reporting
- **Afloat-server**: Workflow triggers

### External Services

- **Ollama**: LLM and embedding models
- **ChromaDB**: Vector storage (local file-based)
- **Monitoring**: Metrics collection endpoints

## 📈 Performance Monitoring

### Key Metrics to Track

1. **API Response Times**
   - `/intelligence` endpoint latency
   - RAG query processing time
   - Model inference duration

2. **Resource Usage**
   - Memory consumption per request
   - CPU usage patterns
   - Disk I/O for vector operations

3. **Error Rates**
   - Failed RAG queries
   - Model unavailability
   - Authentication failures

### Monitoring Commands

```bash
# Check system health
curl http://localhost:8080/health

# View metrics
curl http://localhost:8080/metrics

# Monitor logs
tail -f logs/application.log
```

## 🚨 Common Pitfalls

1. **Model Configuration**: Ensure exact model names match Ollama
2. **Memory Limits**: Local LLMs require significant RAM (6GB+)
3. **Path Issues**: Use absolute paths for file operations
4. **Async Context**: Properly handle async/await in FastAPI
5. **Environment Variables**: Check `.env` file for required settings

## 📝 Documentation Tips

While exploring, document:

- API endpoint purposes and parameters
- Configuration options and their effects
- Performance bottlenecks and optimizations
- Security considerations and best practices
- Integration patterns with other services

## 🎯 Next Steps After Exploration

1. **Identify Improvement Opportunities**
   - Performance optimizations
   - Security enhancements
   - Feature gaps

2. **Create Integration Examples**
   - Sample API calls
   - Common workflows
   - Error handling patterns

3. **Contribute Back**
   - Documentation updates
   - Test improvements
   - Bug fixes or features

---

**Remember**: GRID-main is designed as a production-ready system with extensive safety measures. Take time to understand the security boundaries and validation layers before making modifications.

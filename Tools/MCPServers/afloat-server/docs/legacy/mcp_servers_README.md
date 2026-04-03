# Afloat MCP Servers

Secure, custom MCP servers designed for the Afloat project with workflow automation capabilities.

## Architecture Overview

### Security-First Design

All Afloat MCP servers follow the "Trust Layer" standard:

- **No Perpetrator Voice**: Safety code describes harm, doesn't perform it
- **Cultural Integrity**: Grammar-aware safety registers
- **Documentation Honesty**: Clear limitations and AI-assembled labels
- **Distress vs Threat**: Support pathways for distress signals
- **Technical Safeguards**: Active refusal, provenance tracking, drift monitoring

### Server Portfolio

#### 1. Afloat Workflow Orchestrator (Port 8010)

**Purpose**: End-to-end workflow automation for project lifecycle management

**Tools**:

- `workflow_create` - Create new workflows with validation
- `workflow_execute` - Execute workflows with rollback capability
- `workflow_status` - Track workflow progress and health
- `workflow_rollback` - Safe rollback to previous states
- `workflow_audit` - Complete audit trail with cryptographic hashes

**Security Features**:

- Immutable workflow definitions
- Cryptographic integrity verification
- Role-based access control
- Automatic rollback on failure

#### 2. Afloat Knowledge Manager (Port 8011)

**Purpose**: Secure document and knowledge base management

**Tools**:

- `knowledge_index` - Index documents with semantic analysis
- `knowledge_query` - Query with context-aware filtering
- `knowledge_validate` - Validate document integrity
- `knowledge_purge` - Secure document deletion with audit trail
- `knowledge_export` - Export knowledge with encryption

**Security Features**:

- Document fingerprinting
- Content sanitization before indexing
- Encrypted storage at rest
- Access logging with tamper detection

#### 3. Afloat Development Gateway (Port 8012)

**Purpose**: Secure development environment management

**Tools**:

- `dev_environment_setup` - Create isolated dev environments
- `dev_dependency_audit` - Audit dependencies for security
- `dev_code_scan` - Static analysis with security focus
- `dev_deploy_approval` - Deployment approval workflow
- `dev_incident_response` - Automated incident response

**Security Features**:

- Sandboxed environments
- Dependency vulnerability scanning
- Code signing requirements
- Automated security testing

#### 4. Afloat Communication Hub (Port 8013)

**Purpose**: Secure team communication and collaboration

**Tools**:

- `comm_channel_create` - Create encrypted communication channels
- `comm_message_send` - Send messages with end-to-end encryption
- `comm_audit_log` - Access communication audit logs
- `comm_policy_enforce` - Enforce communication policies
- `comm_emergency_alert` - Emergency alert system

**Security Features**:

- End-to-end encryption
- Message retention policies
- Content filtering for safety
- Emergency bypass protocols

## Implementation Guidelines

### 1. Server Structure

```python
#!/usr/bin/env python3
"""
Afloat [Server Name] MCP Server
Secure [Purpose] with full safety compliance
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.types import CallToolResult, TextContent, Tool

# Security imports
from afloat.security.trust_layer import TrustLayer
from afloat.security.audit_logger import AuditLogger
from afloat.security.access_control import AccessControl

class AfloatServer:
    """Base class for Afloat MCP servers with security built-in"""

    def __init__(self, server_name: str):
        self.server = Server(server_name)
        self.trust_layer = TrustLayer()
        self.audit_logger = AuditLogger()
        self.access_control = AccessControl()
        self._register_handlers()

    def _register_handlers(self):
        """Register MCP handlers with security middleware"""

        @self.server.list_tools()
        async def list_tools():
            """List available tools with security annotations"""
            tools = [
                Tool(
                    name="tool_name",
                    description="Safe description following trust layer",
                    inputSchema={...},
                    annotations={
                        "readOnlyHint": False,
                        "destructiveHint": True/False,
                        "idempotentHint": True/False,
                        "openWorldHint": False
                    }
                )
            ]
            return tools

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict[str, Any]):
            """Handle tool calls with security checks"""
            # 1. Access control check
            if not self.access_control.check_access(name, arguments):
                raise PermissionError("Access denied")

            # 2. Input sanitization
            sanitized_args = self.trust_layer.sanitize_input(name, arguments)

            # 3. Audit logging
            self.audit_logger.log_call(name, sanitized_args)

            # 4. Execute with safety
            result = await self._execute_tool(name, sanitized_args)

            # 5. Output sanitization
            safe_result = self.trust_layer.sanitize_output(result)

            return CallToolResult(content=[TextContent(safe_result)])
```

### 2. Security Middleware

#### Trust Layer Implementation

```python
class TrustLayer:
    """Implements the 'No Perpetrator Voice' safety standard"""

    def sanitize_input(self, tool_name: str, arguments: dict) -> dict:
        """Sanitize inputs according to safety rules"""
        # Implement pronoun filtering, nominalization, etc.
        pass

    def sanitize_output(self, output: Any) -> str:
        """Sanitize outputs to prevent harmful content"""
        # Convert harmful actions to descriptive nouns
        pass
```

#### Audit Logger

```python
class AuditLogger:
    """Cryptographically secure audit logging"""

    def log_call(self, tool_name: str, arguments: dict):
        """Log with cryptographic hash for integrity"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "tool": tool_name,
            "args_hash": self._hash_args(arguments),
            "session_id": self._get_session_id()
        }
        # Write to append-only log
```

### 3. Configuration Management

All servers use a unified configuration:

```json
{
  "servers": [
    {
      "name": "afloat-workflow",
      "enabled": true,
      "command": "python",
      "args": ["-m", "afloat.mcp.workflow_server"],
      "port": 8010,
      "security": {
        "trust_layer_enabled": true,
        "audit_logging": true,
        "access_control": "rbac",
        "encryption_at_rest": true
      }
    }
  ]
}
```

## Deployment Strategy

### Phase 1: Core Infrastructure

1. Implement base AfloatServer class with security
2. Create TrustLayer with safety rules
3. Set up AuditLogger with cryptographic integrity
4. Deploy Workflow Orchestrator as proof of concept

### Phase 2: Knowledge Management

1. Deploy Knowledge Manager with semantic search
2. Implement document fingerprinting
3. Add encryption for sensitive data
4. Create validation workflows

### Phase 3: Development Gateway

1. Set up sandboxed environments
2. Integrate with existing CI/CD
3. Add security scanning pipeline
4. Implement deployment approvals

### Phase 4: Communication Hub

1. Deploy encrypted messaging
2. Add policy enforcement
3. Implement emergency protocols
4. Integrate with incident response

## Testing Strategy

### Security Testing

- Penetration testing for each server
- Access control validation
- Audit log integrity verification
- Input/output sanitization testing

### Integration Testing

- Cross-server workflow testing
- Failure scenario testing
- Performance under load
- Recovery and rollback testing

## Compliance & Governance

### Standards Compliance

- SOC 2 Type II controls
- GDPR data protection
- Industry-specific regulations

# HuggingFace Egress Policy

## Overview

This document makes explicit the HuggingFace egress policy for the MCP ecosystem to ensure controlled, audited, and secure external model access.

## Policy Statement

**Default Position**: Local-first operation with HuggingFace egress **disabled by default**. All MCP servers must operate in offline mode unless explicitly authorized.

## Implementation Details

### 1. Environment Variables

| Variable                      | Default                                | Purpose                               |
| ----------------------------- | -------------------------------------- | ------------------------------------- |
| `HF_HUB_OFFLINE`              | `1` (disabled)                         | Blocks all HuggingFace Hub downloads  |
| `TRANSFORMERS_OFFLINE`        | Not set (inherits from HF_HUB_OFFLINE) | Legacy compatibility flag             |
| `RAG_RERANKER_ALLOW_DOWNLOAD` | `false`                                | Controls RAG reranker model downloads |

### 2. Egress Control Mechanisms

#### A. Runtime Enforcement

```python
# HuggingFaceEmbeddingProvider in GRID-main/src/tools/rag/embeddings/huggingface.py
prev_offline = os.environ.get("HF_HUB_OFFLINE")
if not allow_download:
    os.environ["HF_HUB_OFFLINE"] = "1"
    logger.info("HuggingFace egress blocked (HF_HUB_OFFLINE=1) — using cached models only")
```

#### B. Error Handling

- Models not in local cache fail fast with clear error messages
- No silent fallback to external downloads
- Explicit user guidance for enabling downloads when required

### 3. Authorized Use Cases

#### A. Explicit Opt-in Required

To enable HuggingFace egress:

```bash
export HF_HUB_OFFLINE=0
export RAG_RERANKER_ALLOW_DOWNLOAD=true
```

#### B. Approved Components

1. **RAG System**: `HuggingFaceEmbeddingProvider` for embeddings when `allow_download=True`
2. **Finetuning Scripts**: Model downloads in controlled environments
3. **Development Tools**: Explicit CLI commands with user confirmation

### 4. Audit and Monitoring

#### A. Startup Validation

- All MCP servers log egress policy status at startup
- Clear warnings when operating in degraded mode due to missing models
- Health checks report egress capability status

#### B. Network Monitoring

- HuggingFace Hub endpoints should be monitored in network infrastructure
- Alert on unexpected HuggingFace traffic when policy should be offline

### 5. Security Considerations

#### A. Threat Vectors Mitigated

- **Supply Chain Attacks**: Blocking unauthorized model downloads
- **Data Exfiltration**: Preventing telemetry and model metadata leaks
- **Resource Consumption**: Controlling bandwidth and storage usage

#### B. Trust Boundaries

- Local cache is trusted; remote Hub is untrusted
- Model verification required before allowing downloads
- Air-gapped environments supported by default

### 6. Component-Specific Policies

#### A. grid-rag & grid-rag-enhanced

- **Default**: Ollama-only embeddings (no HuggingFace)
- **Fallback**: HuggingFace with `allow_download=false` (cache-only)
- **Explicit**: HuggingFace with `allow_download=true` (requires opt-in)

#### B. Other MCP Servers

- **echoes-server**: No HuggingFace dependencies
- **grid-server**: No HuggingFace dependencies
- **portfolio-safety-lens**: No HuggingFace dependencies
- **maintain-server**: No HuggingFace dependencies

#### C. Development Tools

- **Finetuning Scripts**: Explicit user confirmation required
- **Model Evaluation**: Controlled environments with audit trails

### 7. Compliance and Verification

#### A. Automated Checks

```bash
# Verify egress policy is enforced
grep -r "HF_HUB_OFFLINE" /home/caraxes/CascadeProjects/GRID-main/src/
env | grep HF_HUB_OFFLINE
```

#### B. Manual Verification

1. Check startup logs for egress policy messages
2. Verify network traffic to huggingface.co is blocked by default
3. Test model loading failures when offline mode is active

### 8. Incident Response

#### A. Policy Violations

- Immediate investigation of unauthorized HuggingFace traffic
- Review of `HF_HUB_OFFLINE` environment variable settings
- Audit of model cache for unexpected additions

#### B. Recovery

- Reset `HF_HUB_OFFLINE=1` across all environments
- Clear model cache if compromised
- Review and update authorization procedures

## Implementation Status

✅ **Completed**:

- HuggingFaceEmbeddingProvider egress controls
- Default offline mode enforcement
- Clear error messages and user guidance

🔄 **In Progress**:

- Network monitoring integration
- Automated compliance checks

⏳ **Planned**:

- Model signature verification
- Centralized egress policy management

## References

- [HuggingFace Hub Offline Mode](https://huggingface.co/docs/huggingface_hub/en/guides/offline)
- [GRID RAG System](/home/caraxes/CascadeProjects/GRID-main/src/tools/rag/README.md)
- [Security Hardening Guidelines](/home/caraxes/CascadeProjects/GRID-main/docs/safeguards/SYSTEM_HARDENING.md)

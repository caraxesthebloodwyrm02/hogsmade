# @cascade/shared-types

Shared Zod schemas and utilities for CascadeProjects MCP servers. Reduces drift and enables consistent validation across servers.

## Adopted by 2+ servers

- **AuditEvent** and **emitAudit** (audit-client): used by **lots-server** and **maintain-server** to append audit events to the echoes NDJSON log. Import from `@cascade/shared-types/audit-client` for the emitter; use `AuditEventSchema` / `AuditEvent` from the main package for types.

## Deferred for Phase 2 close

- **HealthCheckResponse** / **HealthCheckResponseSchema**: deferred because adoption in 3+ servers has not yet been completed, and forcing adoption now would add schema churn late in Phase 2.
- **TelemetrySnapshot** / **TelemetrySnapshotSchema**: deferred because adoption in 3+ servers has not yet been completed, and telemetry is not yet a required cross-server contract outside the current documented snapshot/audit flows.

Servers may continue to use local interfaces for health and telemetry until adoption is desired; the shared schemas are the recommended contract when multiple servers need to produce or consume the same shape.

## Usage

```bash
npm install  # from workspace root or with file:../shared-types
```

```ts
import { AuditEventSchema, type AuditEvent } from "@cascade/shared-types";
import { emitAudit } from "@cascade/shared-types/audit-client";
```

## Data contracts

See [docs/DATA_CONTRACTS.md](../docs/DATA_CONTRACTS.md) for workspace-level audit and snapshot contracts.

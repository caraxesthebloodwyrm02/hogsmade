# Transformation Feature Demo

Demonstrates the biochem-inspired transformation system in ori-server.

## Schema

```typescript
// Transformation Registry (notebook.ts:250)
const TRANSFORM_REGISTRY = {
  ".ts": { to: ".js", tool: "esbuild", tier: 3 },
  ".tsx": { to: ".js", tool: "esbuild", tier: 3 },
  ".py": { to: ".pyc", tool: "compile", tier: 3 },
  ".md": { to: ".html", tool: "marked", tier: 3 },
  ".json": { to: ".ts", tool: "json2ts", tier: 2 },
  ".yaml": { to: ".json", tool: "js-yaml", tier: 2 },
  ".sql": { to: ".duckdb", tool: "duckdb", tier: 3 },
  ".pdf": { to: ".txt", tool: "pdftotext", tier: 3 },
  ".png": { to: ".txt", tool: "tesseract", tier: 3 },
  ".mp3": { to: ".txt", tool: "whisper", tier: 3 },
};
```

## Phenomenon Background

| Source    | Principle           | Application              |
| --------- | ------------------- | ------------------------ |
| Mystique  | Mass conservation   | `massConserved: boolean` |
| Mystique  | Time limit          | Duration tracking        |
| Hox Genes | Colinearity         | `tier: 0\|1\|2\|3`       |
| Hox Genes | Selector→Realizator | Pipeline                 |

## Demo: Log a Transformation

```typescript
import { logTransformation, getTransformStats } from "./notebook.js";

// Step 1: Log TypeScript → JavaScript transform
const note = await logTransformation(".ts", ".js", {
  durationMs: 150,
  massConserved: true,
});
// Returns: NotebookEntry with category: "transformation"

// Step 2: Get statistics
const stats = await getTransformStats();
// Returns: { total, byTier, byTool, massConservedRate }
```

## Demo: MCP Tools

```json
// transform_log input
{
  "fromExt": ".md",
  "toExt": ".html",
  "durationMs": 45,
  "massConserved": true
}

// transform_history input
{
  "since": "2026-04-01T00:00:00Z",
  "limit": 20
}

// transform_stats output
{
  "total": 47,
  "byTier": { "0": 0, "1": 5, "2": 12, "3": 30 },
  "byTool": { "esbuild": 20, "marked": 15, "json2ts": 8, "tesseract": 4 },
  "massConservedRate": 0.96
}
```

## Tier Mapping

| Tier | Layer     | Function   |
| ---- | --------- | ---------- |
| 0    | parsing   | Input→raw  |
| 1    | AST       | Parse tree |
| 2    | semantics | Type check |
| 3    | codegen   | Emit       |

## Hook Architecture

```typescript
interface TransformHook<TIn, TOut> {
  before?: (input: TIn) => TIn; // Mystique: concentration
  after?: (output: TOut) => TOut; // Hox: realizator
  tier: 0 | 1 | 2 | 3;
}
```

## Test Validation

```bash
# Run notebook tests
npm run test --workspace Tools/MCPServers/ori-server -- tests/notebook.test.ts

# Expected: 15 tests, 14 pass (+3 transform tools registered)
```

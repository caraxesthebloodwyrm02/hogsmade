---
name: mangrove-dev
description: Development guide for pi-mangrove extensions, skills, and tools. Use when adding new capabilities to the Mangrove pi package or debugging DIO/security/MCP integrations.
---

# Mangrove Pi Development

## Package Structure

```
pi-mangrove/
├── extensions/          # TypeScript extensions (loaded via jiti)
│   └── dio-bridge.ts    # DIO bridge and security tooling
├── skills/             # SKILL.md files (auto-discovered)
├── prompts/            # Prompt templates (this file)
└── package.json        # Pi manifest root-level
```

## Key Conventions

**Extensions**

- Export default function receiving `pi: ExtensionAPI`
- Register tools with `pi.registerTool({ name, description, parameters, execute })`
- Handle errors in `execute` and return stringified JSON for structured payloads

**Python Bridge Pattern (DIO)**

```typescript
const cp = spawn("uv", ["run", "python", "-c", code], {
  cwd: dioRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
// Always handle: stdout, stderr, error, timeout, exit code !== 0
```

## Quick Reference

| Task             | Command                      |
| ---------------- | ---------------------------- |
| Typecheck        | `npm run typecheck`          |
| Build (optional) | `npm run build`              |
| Reload pi        | `/reload` or restart         |
| Verify loaded    | `/hotkeys` — check tool list |

## Extension Template

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "mangrove:example",
    description: "One-line description",
    parameters: {
      type: "object",
      properties: {
        arg: { type: "string", description: "Arg description" },
      },
      required: ["arg"],
    },
    execute: async (args: { arg: string }): Promise<string> => {
      return JSON.stringify({ result: args.arg });
    },
  });
}
```

## Validation Checklist

- [ ] Extension file exports default function
- [ ] Tool name uses `mangrove:` or `dio:` or `security:` prefix
- [ ] Parameters schema valid JSON Schema
- [ ] Execute returns string (JSON.stringify for objects)
- [ ] Python subprocess uses `uv run python`
- [ ] All error paths return structured error, never raw throw

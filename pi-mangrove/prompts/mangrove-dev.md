---
name: mangrove-dev
description: Development guide for pi-mangrove extensions, skills, and tools. Use when adding new capabilities to the Mangrove pi package or debugging DIO/security/MCP integrations.
---

# Mangrove Pi Development

## Package Structure

```
pi-mangrove/
├── extensions/          # TypeScript extensions (loaded via jiti)
│   ├── dio.ts          # DIO bridge (Python subprocess)
│   └── dio-bridge.ts   # Extended DIO capabilities
├── skills/             # SKILL.md files (auto-discovered)
├── prompts/            # Prompt templates (this file)
└── package.json        # Pi manifest root-level
```

## Key Conventions

**Extensions**
- Export default function receiving `pi: ExtensionAPI`
- Register tools with `pi.registerTool({ name, description, parameters, execute })`
- Use `pi.notify()` for non-blocking status
- Handle errors in `execute` — return stringified JSON, never throw uncaught

**Python Bridge Pattern (DIO)**
```typescript
const cp = spawn(pythonPath, ["-c", code], {
  cwd: dioRoot,
  env: { ...process.env, PYTHONPATH: dioRoot },
});
// Always handle: stdout, stderr, error, timeout, exit code !== 0
```

**Local Install**
```bash
pi install /home/caraxes/CascadeProjects/pi-mangrove
# Or via workspace .pi/settings.json: "packages": ["../pi-mangrove"]
```

## Quick Reference

| Task | Command |
|------|---------|
| Typecheck | `npm run typecheck` |
| Build (optional) | `npm run build` → outputs `dist/` |
| Reload pi | `/reload` or restart |
| Verify loaded | `/hotkeys` — check tool list |

## Extension Template

```typescript
import { spawn } from "node:child_process";

export default function (pi: any) {
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
      // Implementation
      return JSON.stringify({ result: args.arg });
    },
  });

  pi.notify({ type: "info", message: "Extension loaded" });
}
```

## Validation Checklist

- [ ] Extension file exports default function
- [ ] Tool name uses `mangrove:` or `dio:` or `security:` prefix
- [ ] Parameters schema valid JSON Schema
- [ ] Execute returns string (JSON.stringify for objects)
- [ ] Python subprocess has 5s timeout
- [ ] All error paths return structured error, never raw throw

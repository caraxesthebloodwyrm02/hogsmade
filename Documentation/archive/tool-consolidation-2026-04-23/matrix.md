# Topic × Tool Matrix

Every cell is `canonical`, `pointer`, `delta`, or `—`. No duplication of `AGENTS.md` content across tools.

| Topic \ Tool               | AGENTS.md | Windsurf                              | VS Code            | Cursor             | Zed     | Claude Code      | Copilot |
| -------------------------- | --------- | ------------------------------------- | ------------------ | ------------------ | ------- | ---------------- | ------- |
| Repository layout          | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | pointer |
| Build/test commands        | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | pointer |
| Coding style               | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | delta   |
| Testing conventions        | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | pointer |
| Commits and PRs            | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | delta   |
| Security/git hygiene       | canonical | delta                                 | pointer            | pointer            | pointer | pointer          | pointer |
| TUV-001 governance         | canonical | pointer                               | pointer            | pointer            | pointer | pointer          | pointer |
| Output discipline          | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Git session flow           | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Eligibility-server routine | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Signal-IO hardening        | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Windsurf workflows         | —         | canonical                             | —                  | —                  | —       | —                | —       |
| Cursor skills              | —         | —                                     | —                  | canonical          | —       | —                | —       |
| MCP live config            | —         | `~/.codeium/windsurf/mcp_config.json` | `.vscode/mcp.json` | `.cursor/mcp.json` | —       | `~/.claude.json` | —       |

## Legend

- **canonical**: Primary source for this topic.
- **pointer**: References the canonical source without duplication.
- **delta**: Adds tool-specific logic on top of the pointer (e.g., Copilot review guardrails, Windsurf OS / network constraints).
- **—**: Topic not applicable or handled by another layer.

## Notes

- `Copilot / Coding style` and `Copilot / Commits and PRs` are `delta` because `.github/copilot-instructions.md` retains Zod, shared-types, and audit-contract guardrails that are Copilot-specific on top of the pointer to `AGENTS.md`.
- `Windsurf / Security/git hygiene` is `delta` because `.windsurfrules` retains OS guardrails + network isolation constraints on top of the pointer to `AGENTS.md`.
- The 4 Cursor-specific canonical rows (`Output discipline`, `Git session flow`, `Eligibility-server routine`, `Signal-IO hardening`) correspond to the 4 `.mdc` files kept in `.cursor/rules/`.

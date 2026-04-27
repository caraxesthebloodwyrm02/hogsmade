# Topic × Tool Matrix

| Topic \\ Tool              | AGENTS.md | Windsurf                              | VS Code            | Cursor             | Zed     | Claude Code      | Copilot |
| -------------------------- | --------- | ------------------------------------- | ------------------ | ------------------ | ------- | ---------------- | ------- |
| Repository layout          | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Build/test commands        | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Coding style               | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Testing conventions        | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Commits and PRs            | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Security/git hygiene       | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| TUV-001 governance         | canonical | —                                     | pointer            | —                  | pointer | pointer          | pointer |
| Output discipline          | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Git session flow           | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Windsurf workflows         | —         | canonical                             | —                  | —                  | —       | —                | —       |
| Cursor skills              | —         | —                                     | —                  | canonical          | —       | —                | —       |
| MCP live config            | —         | `~/.codeium/windsurf/mcp_config.json` | `.vscode/mcp.json` | `.cursor/mcp.json` | —       | `~/.claude.json` | —       |
| Eligibility-server routine | —         | —                                     | —                  | canonical          | —       | —                | —       |
| Signal-IO hardening        | —         | —                                     | —                  | canonical          | —       | —                | —       |

**Key:**

- `canonical`: Primary source for this topic.
- `pointer`: References the canonical source without duplication.
- `delta`: Adds tool-specific content on top of canonical source.
- `—`: Topic not applicable or handled by another layer.

**Notes:**

- **Copilot**: Several topics (`Coding style`, `Commits and PRs`) are technically `delta` because `.github/copilot-instructions.md` retains specific guardrails for review.
- **Cursor**: `Eligibility-server routine` and `Signal-IO hardening` are project-scoped/branch-specific rules kept as `.mdc` files.

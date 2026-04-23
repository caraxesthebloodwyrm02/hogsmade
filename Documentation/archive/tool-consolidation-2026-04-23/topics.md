# Canonical Topics from AGENTS.md

The 9 behavior domains that `AGENTS.md` is the single canonical source for. Every tool-specific rule file is either a pointer to `AGENTS.md` for these topics or a scope-specific delta that does not duplicate content.

- **Repository layout**: Defines the directory structure (`Tools/MCPServers`, `Components`, `Applications`, `Projects`, `Documentation`) and workspace-scoped change policy.
- **Build, test, and development commands**: Lists the canonical shell commands for Node (`npm`, `prettier`, `pre-commit`) and Python (`uv`, `pytest`, `ruff`).
- **Coding style and naming**: Specifies language-specific standards (TS strict/ESM, Python 3.13+/Pydantic) and file/folder naming conventions.
- **Testing conventions**: Defines the primary frameworks (Vitest, pytest), file-naming patterns, and requirements for coverage with behavior changes.
- **Commits and pull requests**: Enforces Conventional Commits with scope and specific PR body requirements (`pr-contract`).
- **Security and configuration**: Covers secret management (`detect-secrets`), `.env.example` usage, and local-first AI preference (Ollama).
- **Git hygiene**: Explicit rules for `.gitignore` adherence, staging discipline, and avoiding force-pushes or history rewrites.
- **Governance (TUV-001)**: The Unbreakable Vow — three binding conditions (Fidelity, Integrity, Accountability) and five Never-Rules.
- **Agent registry**: Lists the tool-specific rule files in `.cursor/rules/` and the owner personal agents in `~/.claude/agents/`.

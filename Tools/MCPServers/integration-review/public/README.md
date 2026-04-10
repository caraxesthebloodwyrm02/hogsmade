# ori-server — Integration Review Package

An MCP server for test-suite research and risk analysis.
This package provides everything needed to evaluate, integrate with,
and give feedback on ori-server — without requiring access to the source.

---

## Contents

| Document                           | For                 | Purpose                                       |
| ---------------------------------- | ------------------- | --------------------------------------------- |
| [CAPABILITIES.md](CAPABILITIES.md) | Everyone            | What ori-server does and what it exposes      |
| [INTEGRATION.md](INTEGRATION.md)   | Developers & Agents | How to connect, configure, and call tools     |
| [METHODOLOGY.md](METHODOLOGY.md)   | Reviewers           | How to evaluate quality, security, and design |
| [EVIDENCE.md](EVIDENCE.md)         | Reviewers           | Test results and expected behavior reference  |

## Reading Order

**If you are integrating**: CAPABILITIES → INTEGRATION
**If you are reviewing**: CAPABILITIES → EVIDENCE → METHODOLOGY
**If you are an agent**: Parse CAPABILITIES for the tool contract, then METHODOLOGY for flagging protocol.

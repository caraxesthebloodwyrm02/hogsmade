# school-server

Foundational cognitive node for AI-assisted **learning and education**. This is the
education core of the workspace: it ingests knowledge, retrieves concepts, builds study
plans, and tracks progress as **learning milestones** (mastery checkpoints) rather than
competitive scores.

## Status

Active. Reactivated from archive as the learning/education core of the ecosystem.

- **Owner:** workspace maintainer (`caraxesthebloodwyrm02`).
- **Use-case:** structured study and knowledge synthesis for learners — the program's
  stated core intent (learning + education), distinct from the game/performance surfaces.
- **CI/tests:** Vitest suite under `tests/` covers the learning engine.

## MCP tools

| Tool                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `ingest_knowledge`    | Store a foundational knowledge block (topic, content, tags, level). |
| `retrieve_concept`    | Search stored blocks by topic, content, or tag.                     |
| `generate_study_plan` | Synthesize a study plan from blocks relevant to a subject.          |
| `assess_milestone`    | Report progress as a learning milestone (mastery checkpoint).       |

## Develop

```bash
npm run --workspace Tools/MCPServers/school-server start   # run via stdio MCP transport
npm run --workspace Tools/MCPServers/school-server test    # vitest
npm run --workspace Tools/MCPServers/school-server lint    # tsc --noEmit
npm run --workspace Tools/MCPServers/school-server build   # tsc
```

## Learning milestones

Progress is expressed as mastery checkpoints, not points or rankings:

| Completion ratio | Milestone label  |
| ---------------- | ---------------- |
| 0                | Not started      |
| > 0 and < 0.66   | Getting started  |
| ≥ 0.66 and < 1   | Building fluency |
| 1                | Mastery          |

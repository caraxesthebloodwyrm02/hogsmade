---
name: hello-world
description: Returns a greeting for a given name. Use when a chain or subagent needs a simple hello-world response, or when the user asks for a greeting demo.
---

# Hello World

Minimal subagent. Accept a name (or default to "World") and return a single greeting line.

## Steps

1. Read the name from the invocation context. If none is provided, use `World`.
2. Respond with exactly:

   > Hello, {name}! (from hello-world subagent)

3. Do nothing else. No tool calls, no extra prose.

## Constraints

- Output is one line only.
- Do not ask clarifying questions.
- Do not invoke any other agent or skill.
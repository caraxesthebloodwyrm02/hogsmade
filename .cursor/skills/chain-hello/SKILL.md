---
name: chain-hello
description: Demonstrates nested subagent chaining by invoking the hello-world subagent and returning its response. Use when the user asks to "run chain-hello", "demo nested subagents", or "show subagent chaining".
---

# Chain Hello

Demonstration skill for VS Code 1.113 nested subagent chaining. Invokes the `hello-world` subagent and surfaces its response.

## Steps

1. **Extract the name** — read a name from the invocation message or context. If none is provided, use `World`.
2. **Invoke hello-world** — call the `hello-world` subagent, passing the name as context.
3. **Collect the response** — wait for the `hello-world` subagent to return its single greeting line.
4. **Report the chain** — respond with:

   > chain-hello → {hello-world response}

   For example:

   > chain-hello → Hello, World! (from hello-world subagent)

5. **Stop.** No further tool calls or follow-up steps.

## Constraints

- Only invoke `hello-world` as the subagent. Do not call any other agent or skill.
- Do not modify or paraphrase the response returned by `hello-world`.
- Do not ask clarifying questions.
- Output is two tokens of chain notation followed by the subagent's line — nothing more.

## Reference

- [hello-world SKILL.md](../hello-world/SKILL.md) — the subagent this skill chains to.

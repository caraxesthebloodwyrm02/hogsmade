# integration-review/

Pre-ship review package for ori-server.
Start here. Read in this order.

| File                       | Audience      | Purpose                                                     |
| -------------------------- | ------------- | ----------------------------------------------------------- |
| [REVIEW.md](REVIEW.md)     | Human + Agent | What to look at, what to evaluate, how to flag findings     |
| [SETUP.md](SETUP.md)       | Human         | Exact cold-start steps to run ori-server on any machine     |
| [SURFACE.md](SURFACE.md)   | Agent + Human | Mechanical tool catalog — 22 tools, schemas, dependency map |
| [SECURITY.md](SECURITY.md) | Agent + Human | Every attack surface, what to probe, what to flag           |
| [TRACE.md](TRACE.md)       | Agent + Human | Live test run + expected e2e tool call sequence             |

## For Agents

Parse SURFACE.md for the tool contract.
Parse SECURITY.md for flagging criteria.
Use the FLAG format from REVIEW.md for structured output.
Cross-reference TRACE.md expected outputs with actual tool responses.

## For Humans

Start with SETUP.md to get it running.
Read REVIEW.md for what to look at.
Skim SURFACE.md for the API shape.
Deep-read SECURITY.md if security is your focus.
Use TRACE.md as your reference for "what correct looks like."

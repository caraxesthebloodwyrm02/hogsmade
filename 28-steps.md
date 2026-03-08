Plan outline

The plan is an Interactive Tools Research Summary: it defines what makes a tool or artifact interactive and how that works in practice, then gives a 28-step implementation checklist. There are no subagent calls or hooks in this plan; it is a single-document research summary plus a linear todo list.

Research content (Sections 1–4). Section 1 defines interactivity in UX/HCI terms: two-way communication (user input and system reaction), responsiveness, behavior over time, and affordances, and ties that to cognitive artifacts (Norman) and degree of interactivity (passive read vs. edit/undo). Section 2 describes the mechanics: a repeating Input → Process → State → Output loop; the event loop (dequeue event, run handler, enqueue new events, repeat) for non-blocking responsiveness; the GUI pipeline (UI tree → layout → paint → composite, then input → hit-test → handler → state update → re-render); feedback and timing (Doherty threshold: <400 ms to keep flow, <100 ms to feel instant; micro-interactions for slower work); and Interacto-style higher-level interaction models (first-class interactions, undo/redo). Section 3 summarizes this in a four-layer table (Concept, Runtime, GUI, Perception). Section 4 lists the six references (IxDF, cognitive artifacts, Medium/Skia, MDN, LogRocket, IEEE Interacto). The plan states it is research-only and does not by itself imply implementation.

Todo steps (28 total, all pending). The todos implement the plan in order. Scope (scope-1–scope-5): define purpose and user goal; list user inputs and system reactions; set level of interactivity; capture non-functional requirements (e.g. <400 ms, platform, accessibility). Design (design-1–design-5): design the input–process–state–output loop; define application state and how it changes; design affordances and the five dimensions; specify feedback type, content, and timing; add micro-interactions or loading for actions that can exceed the Doherty threshold. Architecture (arch-1–arch-4): choose event-loop/runtime model; define UI tree and interactive nodes; map input to hit-test and handlers; plan the render path and optimizations. Implementation (impl-1–impl-7): implement event loop and queue; UI tree and layout with hit areas; input handling chain; state updates; rendering from state; per-action feedback; loading/skeleton for slow operations. Quality (quality-1–quality-7): verify feedback timing; test the full loop and edge cases; check affordances; optionally add Interacto-style abstractions and undo/redo; run accessibility and usability checks; document the interaction model and timing; deploy and iterate.

Subagents and hooks. The plan does not reference or invoke any subagents (e.g. plan-resolver, subtractive-analyst, explore), and it does not define conditional hooks, re-invocation logic, or residual evaluation. It is a self-contained research document with a straight-line implementation checklist from scope through deploy.

## Todo checklist

| ID        | Content                                                                                                                             | Status  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| scope-1   | Define the interactive artifact's purpose and the user goal it supports                                                             | pending |
| scope-2   | Enumerate the user actions (inputs) the artifact must accept                                                                        | pending |
| scope-3   | Enumerate the system reactions (outputs/feedback) that must occur for each action                                                   | pending |
| scope-4   | Decide the minimum level of interactivity (e.g. read+filter vs full edit+undo) from the plan's "degree of interactivity"            | pending |
| scope-5   | Capture non-functional requirements (e.g. response under 400ms for critical actions, platform, accessibility)                       | pending |
| design-1  | Design the input–process–state–output loop (what event triggers what handler and what state change)                                 | pending |
| design-2  | Define application state (data and UI state) and how it changes per user action                                                     | pending |
| design-3  | Design affordances so interactive elements are recognizable (e.g. clickable, draggable) and align with the 5 dimensions             | pending |
| design-4  | Specify feedback for each action (type, content, timing—aim under 400ms, under 100ms where it should feel instant)                  | pending |
| design-5  | Add micro-interactions or loading states for any action that can exceed the Doherty threshold                                       | pending |
| arch-1    | Choose or confirm the event loop / runtime model (e.g. browser event loop, framework lifecycle) so the app stays non-blocking       | pending |
| arch-2    | Define the UI tree (or component tree) and which nodes are interactive                                                              | pending |
| arch-3    | Map input events to hit-testing (or equivalent) and then to the correct handler and state update                                    | pending |
| arch-4    | Plan the render path (state change → layout/paint/composite or framework equivalent) and where to optimize (e.g. incremental/dirty) | pending |
| impl-1    | Implement the event loop (or integrate with the framework's) and event queue                                                        | pending |
| impl-2    | Implement the UI tree and layout so every interactive element has a well-defined box/hit area                                       | pending |
| impl-3    | Implement input handling (OS/framework events → hit-test → handler → state update)                                                  | pending |
| impl-4    | Implement state updates so each user action produces a deterministic state change                                                   | pending |
| impl-5    | Implement rendering (layout → paint → composite or framework equivalent) driven by state                                            | pending |
| impl-6    | Add feedback for every user action (visual and/or other) within the target timing                                                   | pending |
| impl-7    | Add loading/skeleton or progress feedback for slow operations so the loop still feels responsive                                    | pending |
| quality-1 | Verify that every user action produces visible (or otherwise perceivable) feedback within ~400ms (and under 100ms where instant)    | pending |
| quality-2 | Test the full loop (input → handler → state → output → next input) including edge cases and errors                                  | pending |
| quality-3 | Check affordances (interactive elements are discoverable and their behavior is consistent with the design)                          | pending |
| quality-4 | Optionally introduce higher-level interaction abstractions (e.g. Interacto-style commands) for complex interactions and undo/redo   | pending |
| quality-5 | Run accessibility and usability checks (keyboard, focus, screen reader, clarity of feedback)                                        | pending |
| quality-6 | Document the interaction model and timing constraints for future maintainers                                                        | pending |
| quality-7 | Deploy and iterate based on real usage and any perceived lag or confusion                                                           | pending |

The table has three columns (ID, Content, Status), one header row, one separator row, and 28 data rows. To have this added directly into the plan file, switch to Agent mode and ask to add the todo table to the plan.

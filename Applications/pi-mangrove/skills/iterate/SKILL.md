---
name: iterate
description: "Framework for delivering freelance projects from start to finish. Use when starting a new project, planning delivery milestones, implementing a feature, fixing bugs, or completing client work. Keywords: freelance, project, delivery, milestone, scope, verification, client work."
---

# Iterate: Freelance Project Delivery Framework

## When to Use

- User asks to start a project, implement a feature, fix bugs, or complete client work
- Context requires milestone planning, delivery sequencing, or quality gates
- A structured loop is needed to move from requirements to verified delivery

## Steps

1. **Understand**

   - Extract requirements, deliverables, constraints, and explicit scope boundaries
   - Clarify ambiguities before implementation
   - State assumptions explicitly if anything remains uncertain

2. **Plan**

   - Design the structure before building
   - Define modules, responsibilities, interfaces, and implementation order
   - Sequence work from foundation to dependent features

3. **Implement**

   - Complete one module at a time
   - Write tests alongside implementation
   - Verify locally as you go instead of deferring all checks to the end

4. **Verify**
   - Run the project’s required quality gates in order
   - Fix failures before proceeding
   - Confirm the deliverable matches the original requirements before marking complete

## Quality Gates

Run the narrowest relevant checks for the project being changed. Typical gates include:

- Lint
- Type check
- Tests
- Coverage threshold
- Any project-specific verification required by the workspace

## Hard Constraints

- Do not expand scope beyond the user’s stated deliverables without explicit approval
- Do not skip clarification when requirements are ambiguous
- Do not mark work complete until the required verification gates pass
- Each milestone or deliverable must have explicit validation criteria
- Re-plan instead of improvising when the current plan stops matching the task

## Example Invocation

User: "I need to build a Python API for data processing."
Use the iterate skill to:

1. capture requirements
2. define milestones and module order
3. implement incrementally
4. verify against quality gates before delivery

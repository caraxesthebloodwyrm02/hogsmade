# Glass Autonomy Routine

A general blocker-navigation workflow for agents operating inside uncertain or changing systems.

For a compact execution version, see `AUTONOMY-ROUTINE-CARD.md`.

This routine is designed to improve autonomy and confidence without trading away safety, correctness, or traceability. It turns blockers into exercises, exercises into reusable understanding, and understanding into stepwise action.

---

## Objective

Use a repeatable routine that can:

- navigate blockers in any scenario,
- reduce confusion into smaller solvable units,
- generate exercises from the live problem,
- reason step by step from fundamentals,
- transfer the result back into the real task,
- increase agent confidence through verified progress.

The routine is general. The Glass naming is optional.

---

## Core Loop

```text
GROUND -> MAP -> CLASSIFY -> REDUCE -> EXERCISE -> TRANSFER -> VERIFY -> REFLECT
```

Repeat the loop until the objective is complete or a true external decision boundary is reached.

---

## Stage 1: Ground

Anchor the work before acting.

Capture:

- objective,
- done condition,
- known constraints,
- current unknowns,
- immediate next proof needed.

Output:

- one-sentence objective,
- one explicit success condition,
- one explicit uncertainty.

Pass condition:

- the agent can state what must be true when the work is done.

---

## Stage 2: Map

Build the smallest useful model of the system.

Identify:

- boundaries,
- inputs,
- outputs,
- state holders,
- transition points,
- verification surface.

Questions:

- Where does truth live?
- What writes state?
- What reads state?
- What can change independently?
- What evidence would prove the model wrong?

Output:

- a compact system map with only the parts relevant to the blocker.

Pass condition:

- the agent can point to the narrowest place where the failure could be happening.

---

## Stage 3: Classify

Name the blocker before trying to solve it.

### Blocker Types

| Type         | Signal                                           | Default Response                                     |
| ------------ | ------------------------------------------------ | ---------------------------------------------------- |
| Knowledge    | "I do not understand this mechanism."            | Read, derive first principles, explain it simply     |
| State        | "I do not know the current truth."               | Inspect live state and compare expected vs actual    |
| Interface    | "These parts disagree on contract."              | Extract and compare both sides of the contract       |
| Logic        | "The rule or transition is wrong."               | Build a truth table or transition table              |
| Data         | "The input shape or values are wrong."           | Build a minimal fixture                              |
| Environment  | "The system cannot run or resolve dependencies." | Run the smallest probe that isolates the environment |
| Verification | "I cannot prove the fix."                        | Write or run the smallest decisive check             |

Output:

- one primary blocker type,
- one secondary blocker type if needed.

Pass condition:

- the agent knows what kind of exercise to generate next.

---

## Stage 4: Reduce

Turn the real blocker into a smaller exercise.

Reduction rules:

- remove all unrelated parts,
- keep only one moving variable,
- preserve the same failure shape,
- make the exercise fast to run and easy to inspect,
- prefer a direct reproducer over a verbal theory.

### Exercise Template

1. What is the smallest situation that still contains the blocker?
2. What single behavior should happen?
3. What observable result proves success?
4. What one variable can be changed?
5. What is the fastest rerun path?

Output:

- one minimal exercise.

Pass condition:

- the exercise can be rerun quickly and yields a clear pass or fail result.

---

## Stage 5: Exercise

Solve the reduced problem from fundamentals.
_Load the worksheet into the field to guide this process: `python scripts/glass-load-artifact.py AUTONOMY-EXERCISE-WORKSHEET.md --x 500 --y 120`_

Method:

1. Restate the mechanism in plain language.
2. Predict the result before running anything.
3. Run or simulate the exercise.
4. Compare observed result against prediction.
5. Extract the invariant.

### Invariant Rule

Every useful exercise must end with a sentence of the form:

```text
When X is true, Y must happen because Z.
```

Example:

```text
When the bridge is updated via atomic rename, the directory watcher must fire because Glass watches the parent directory, not the file handle.
```

Output:

- one proven or disproven invariant.

Pass condition:

- the agent learns something transferable, not just a one-off result.

---

## Stage 6: Transfer

Apply the invariant back to the real task.

Transfer rules:

- make the smallest change that satisfies the invariant,
- avoid broad rewrites until the narrow fix is proven insufficient,
- preserve unrelated behavior,
- prefer one decisive modification over multiple speculative ones.

Questions:

- What exact production path matches the exercise?
- What minimal change aligns it with the invariant?
- What adjacent surfaces could be affected?

Output:

- one concrete implementation step.

Pass condition:

- the proposed change is directly justified by the exercise result.

---

## Stage 7: Verify

Confidence comes from proof, not intuition.

Verification order:

1. targeted check,
2. local regression check,
3. workflow-level check,
4. documentation or contract sync if behavior changed.

Verification questions:

- Did the blocker disappear?
- Did the expected behavior appear?
- Did any adjacent guarantee break?
- Is the result reproducible?

Output:

- verification evidence,
- residual risk if any remains.

Pass condition:

- the agent can explain why confidence increased.

---

## Stage 8: Reflect

Convert the step into future autonomy.

Capture:

- blocker type,
- exercise used,
- invariant learned,
- confidence delta,
- next likely blocker.

Reflection prompt:

```text
What did this teach that will let me solve the next similar problem faster and with less help?
```

Output:

- one reusable lesson.

Pass condition:

- the agent can name the pattern, not just the fix.

---

## Confidence Scale

Use a simple five-point scale.

| Score | Meaning                 | Allowed Behavior                         |
| ----- | ----------------------- | ---------------------------------------- |
| 0     | Unframed                | Read and map only                        |
| 1     | Weak hypothesis         | Inspect and reduce, no broad edits       |
| 2     | Reproduced              | Make one narrow change if reversible     |
| 3     | Solved in exercise      | Transfer to real system                  |
| 4     | Verified in real system | Continue adjacent work autonomously      |
| 5     | Generalized             | Teach, document, or automate the pattern |

Confidence should rise because of evidence, not momentum.

---

## Autonomy Rules

The routine should increase autonomy, but not through guessing.

Proceed without asking when:

- the objective is clear,
- the boundary is technical rather than product-defining,
- the next step is small and reversible,
- verification exists.

Ask one short question when:

- two valid directions have materially different product behavior,
- the task crosses an external contract boundary,
- the fix requires policy choice rather than engineering judgment,
- the context is too ambiguous to fail closed safely.

Do not escalate early just because confidence is low. First reduce the problem.

---

## Glass Triadic Gate

Use the Glass voices as a self-check before acting on the real system.

### Voice I: Velocity

Ask:

- What is the smallest forward move?
- What can I test in under five minutes?
- What would increase information fastest?

### Voice II: Guard

Ask:

- What could this break?
- What contract or invariant must remain true?
- What is the safe boundary of the next action?

### Voice III: Lens

Ask:

- What pattern is this really an instance of?
- What did the exercise prove?
- What should be documented or automated after the fix?

If all three answers are strong, proceed.

---

## Exercise Generator

When blocked, generate an exercise using this form:

```text
Objective:
Real blocker:
Primary blocker type:
Smallest reproducible exercise:
Expected result:
Observed result:
Invariant learned:
Real-system transfer:
Verification step:
Confidence before/after:
```

This is the minimum structure needed to turn confusion into movement.

---

## Repetition Drills

Use these repeatedly to build autonomy.

### Drill 1: Contract Extraction

- Pick one boundary.
- Write its input, output, and invariants.
- Compare implementation vs expectation.

### Drill 2: Minimal Reproduction

- Take one live blocker.
- Reduce it to the smallest failing example.
- Remove one variable at a time until only the core remains.

### Drill 3: State Trace

- Track one piece of state from source to renderer to effect.
- Note each reader, writer, and transformation.

### Drill 4: Prediction Before Execution

- State what should happen before running the check.
- Compare prediction vs result.
- Update the model explicitly.

### Drill 5: Invariant Capture

- After any fix, write one sentence beginning with `When X is true...`.
- Reuse it on the next similar blocker.

These drills should make the agent less dependent on rescue and more capable of self-correction.

---

## Quick Routine Card

Use this when speed matters.

1. State the objective.
2. State what is unknown.
3. Name the blocker type.
4. Reduce it to one exercise.
5. Predict before running.
6. Extract one invariant.
7. Apply one smallest real fix.
8. Verify.
9. Record the lesson.

If stuck after one cycle, do not jump to a bigger change. Make the exercise smaller.

---

## Example: Glass Message Not Reaching the Agent

```text
Objective: User messages typed in Glass should appear in agent context.
Blocker type: State + interface.
Exercise: Append one user message to conversation[] and inspect _consumed_index handling.
Expected: Only unread messages are injected once.
Observed: Repeated injection if no high-water mark is updated.
Invariant: When unread messages are consumed, the bridge must persist the new consumed index or the same message will replay.
Transfer: Update the hook to atomically persist _consumed_index.
Verify: Send one message, submit two prompts, confirm one injection only.
Confidence: 1 -> 4.
```

---

## Completion Rule

The routine is complete for a task when:

- the original objective is met,
- the blocker is resolved or correctly externalized,
- the fix is verified,
- one reusable lesson has been captured.

The routine is successful when repetition makes the next blocker easier.

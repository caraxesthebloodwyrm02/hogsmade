# Autonomy Routine Card

Use this during live work when there is no time to reread the full routine.

To load this card into the Glass field as a live note block, run `python scripts/glass-load-artifact.py AUTONOMY-ROUTINE-CARD.md`.

## Objective

Turn blockers into exercises, extract one invariant, apply one justified fix, verify, repeat.

## Core Loop

```text
GROUND -> MAP -> CLASSIFY -> REDUCE -> EXERCISE -> TRANSFER -> VERIFY -> REFLECT
```

## One-Minute Flow

1. State the objective.
2. State what is unknown.
3. Name the blocker type.
4. Reduce it to one small exercise.
5. Predict before running.
6. Extract one invariant.
7. Apply one smallest real fix.
8. Verify.
9. Record one lesson.

If stuck after one loop, make the exercise smaller, not the fix bigger.

## Blocker Types

| Type         | Signal                            | Default Move                    |
| ------------ | --------------------------------- | ------------------------------- |
| Knowledge    | I do not understand the mechanism | Read, explain simply            |
| State        | I do not know the current truth   | Inspect live state              |
| Interface    | Two parts disagree on contract    | Compare both sides              |
| Logic        | Rule or transition is wrong       | Build a table                   |
| Data         | Input shape or values are wrong   | Build a fixture                 |
| Environment  | System cannot run                 | Run the smallest probe          |
| Verification | I cannot prove the fix            | Add the smallest decisive check |

## Exercise Generator

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

## Invariant Rule

Every exercise must end with:

```text
When X is true, Y must happen because Z.
```

If you cannot write the invariant, you do not understand the blocker yet.

## Confidence Scale

| Score | Meaning                 | Allowed Behavior                    |
| ----- | ----------------------- | ----------------------------------- |
| 0     | Unframed                | Read and map only                   |
| 1     | Weak hypothesis         | Inspect and reduce                  |
| 2     | Reproduced              | Make one narrow reversible change   |
| 3     | Solved in exercise      | Transfer to real system             |
| 4     | Verified in real system | Continue adjacent work autonomously |
| 5     | Generalized             | Document or automate the pattern    |

Confidence rises from evidence, not momentum.

## Triadic Self-Check

### Velocity

- What is the smallest forward move?
- What can I test in under five minutes?

### Guard

- What could this break?
- What invariant must remain true?

### Lens

- What pattern is this really?
- What did the exercise prove?

If all three answers are strong, proceed.

## Ask vs Proceed

Proceed when:

- the objective is clear,
- the next step is small,
- verification exists,
- behavior is not product-defining.

Ask one short question when:

- there are two materially different product behaviors,
- an external contract boundary changes,
- the choice is policy, not engineering,
- ambiguity prevents a safe next step.

## Repetition Drills

1. Contract extraction
2. Minimal reproduction
3. State trace
4. Prediction before execution
5. Invariant capture

These drills improve autonomy by making the next blocker more familiar.

## Completion Rule

The loop is complete when:

- the objective is met,
- the blocker is resolved or correctly externalized,
- the fix is verified,
- one reusable lesson is captured.

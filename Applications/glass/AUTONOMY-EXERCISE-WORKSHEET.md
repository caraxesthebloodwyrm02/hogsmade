# Autonomy Routine: Exercise Worksheet

_Fill this out during the EXERCISE stage of the autonomy loop to map invariants and build verifiable confidence._

## 1. The Blocker

_What exactly is stopping progress? State it as a measurable fact, not an opinion._

- **Symptom:** [e.g., test failing on line 42]
- **Error/Output:** [e.g., TypeError: undefined is not a function]
- **Current Hypothesis:** [Why is this happening?]

## 2. Invariant Extraction (The "What Must Be True" Check)

_List 3 things that MUST be true for this to work, regardless of implementation._

1. [Invariant 1: e.g., The IPC payload must be a JSON object.]
2. [Invariant 2: e.g., The handler must be registered before the event fires.]
3. [Invariant 3: e.g., The ID must match exactly between sender and receiver.]

## 3. Disproof Strategy

_How can we prove our hypothesis WRONG in the next 5 minutes?_

- **Test/Command:** [What will we run?]
- **Expected Result if Hypothesis is TRUE:** [What should happen?]
- **Expected Result if Hypothesis is FALSE:** [What should happen?]

## 4. Reduction Target

_What is the smallest possible piece of code that isolates this interaction?_

- **Isolated File/Function:** [Where will we test this?]
- **Inputs:** [What exactly goes in?]
- **Outputs:** [What exactly comes out?]

---

_Once filled out, review this with the user before writing the implementation._

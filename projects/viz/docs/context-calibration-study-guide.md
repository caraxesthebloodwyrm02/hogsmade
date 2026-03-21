# Context Calibration — Study Guide

> Easy-difficulty read. No code, no jargon walls. Understand the thinking first, then come back for the build doc.

---

## What problem are we solving?

You write a prompt. The model responds — but it missed the point. Not because you were unclear, but because some part of your context was distorted, ignored, or over-assumed by the model.

The usual reaction: rewrite the prompt, try again, hope it lands. That's guessing.

**Context Calibration** replaces guessing with measurement. Before writing the next prompt, you diagnose *where* and *how far off* the model was — then apply targeted correction.

---

## The metaphor (and why it's more than a metaphor)

This tool borrows directly from **room acoustic calibration** — the process audio engineers use to make speakers sound accurate in a specific room.

### The room problem

A speaker plays music perfectly. But the room changes the sound: walls reflect it, corners trap bass, furniture absorbs highs. What you hear isn't what the speaker played — it's the speaker *plus the room's distortions*.

### The AI problem

You write a clear prompt. But the model changes the meaning: training biases amplify some ideas, attention limits cause blind spots, context window boundaries cut off earlier instructions. What the model responds with isn't what you said — it's your input *plus the model's distortions*.

Same problem. Same solution: measure the distortion, then counteract it.

---

## Three instruments, three questions

Audio engineers use three tools for calibration. Each one answers a different question:

### 1. EQ — "Where is the problem?"

An equalizer shows you which frequencies are too loud or too quiet in a room. You see a curve: peaks where the room amplifies, dips where it absorbs.

**In context calibration**: each "frequency" is a **dimension** of your prompt — specificity, clarity, constraints, domain knowledge, assumptions, evidence, confidence, and tension. You mark which dimensions the model got wrong, and by how much.

- **Above the line (+dB)** = model over-indexed: it assumed too much, hallucinated, was over-confident
- **Below the line (-dB)** = model under-read: it missed context, ignored constraints, had a blind spot
- **On the line (0 dB)** = model understood correctly

### 2. Phase — "How far off is it?"

Phase is about alignment between two signals. If you and a friend both clap at the same time, the sounds reinforce each other (in phase). If one claps half a beat late, the sounds partially cancel (out of phase).

**In context calibration**: phase measures the angle between what you meant and what the model interpreted.

- **0 degrees** = perfectly aligned. You said X, model understood X.
- **90 degrees** = sideways. Model understood something adjacent but not what you meant.
- **180 degrees** = inverted. Model understood the opposite of your intent.

This isn't a feeling — it's a number you set per dimension after examining the model's response.

### 3. Delay — "What do I add to fix it?"

In audio, delay is a precisely timed repeat of a signal. Unlike echo (chaotic, uncontrolled reflections), delay is intentional — it fills gaps with exact timing.

**In context calibration**: the delay panel reads your EQ and phase measurements, then recommends specific corrections:

- Which dimension needs more context
- Whether to add emphasis, examples, counter-statements, or reframe the angle
- Ranked by severity so you fix the worst distortions first

---

## The 8 dimensions

These are the measurement points on the spectrum. Each one names a type of context where things can go wrong:

| Dimension | What it measures | Over-indexing (+dB) | Under-reading (-dB) |
|-----------|-----------------|---------------------|---------------------|
| **Specificity** | How precisely scoped is the context? | Model narrowed scope you didn't intend | Model interpreted too broadly |
| **Clarity** | How clearly does the prompt communicate intent? | Model "filled in" clarity you didn't provide | Model couldn't parse your intent |
| **Constraints** | Are boundaries and limitations stated? | Model invented constraints you didn't set | Model ignored stated boundaries |
| **Domain** | Is vocabulary and domain context sufficient? | Model mapped wrong domain assumptions | Model lacked domain knowledge |
| **Assumptions** | What unstated assumptions exist? | Model assumed things you didn't say | Model ignored implicit information |
| **Evidence** | Are claims grounded with examples? | Model treated weak evidence as strong | Model dismissed your evidence |
| **Confidence** | Model's certainty level | Over-confident = false assumptions | Under-confident = hedging on facts |
| **Tension** | Attention strain across competing signals | Model locked onto one signal, ignored others | Model spread attention too thin |

---

## How to use it (workflow)

### Step 1: The failed prompt

You already have a prompt that didn't work. You have the model's response. Keep both visible.

### Step 2: Add bands

For each dimension where the model went wrong, click **+ Add Band** on the calibration tool. Each band is a measurement point.

### Step 3: Set the reading

For each band:
- **Dimension**: which context dimension was distorted?
- **Gain**: how severely? Drag up for over-indexing, down for under-reading.
- **Q (width)**: is this a narrow assumption ("model thinks X is exactly Y") or a wide misunderstanding ("model misreads this entire area")?
- **Phase**: how misaligned? 0 = got the direction right but the amount wrong. 180 = interpreted the opposite.

### Step 4: Read the correction

The **Delay Correction** panel at the bottom generates recommendations sorted by severity. These tell you what to add or change in your next prompt.

### Step 5: Apply and iterate

Revise your prompt using the corrections. Run it again. Re-measure. The gap should be narrower. Repeat until alignment.

---

## What the composite curve tells you

When you have multiple bands, the purple curve shows the **sum of all distortions** — the full "room response" of how this model distorts your context. Shapes to watch for:

- **One tall peak** = single dominant false assumption
- **One deep dip** = one critical blind spot
- **Multiple peaks and dips** = compound misunderstanding (fix the tallest peak first)
- **Flat line at 0** = well-calibrated (the model understood your context)

---

## What Phase Meter tells you

The strip between spectrum and controls shows aggregate readings:

- **Phase**: average angular displacement across all bands
- **Gap**: how many dimensions have significant distortion (>3 dB)
- **Drift**: how much the phase angles vary across dimensions (high drift = inconsistent misunderstanding)
- **Alignment**: LOCKED (all small, consistent) or DRIFTING (scattered, significant)

---

## What this tool does NOT do

- Does not connect to an AI model. This is a manual instrument — you are the sensor.
- Does not auto-analyze your prompt. You examine the model's response and set the readings.
- Does not generate prompts. It generates correction specifications — you write the prompt.
- Does not fix context in one pass (usually). Calibration is iterative: measure, correct, re-measure.

---

## Current state — honest assessment

### What works well
- The EQ metaphor maps cleanly: named dimensions on X, severity on Y, composite curve shows the full picture
- The measurement workflow (add bands, set readings, read corrections) is coherent
- Export/import lets you save calibration profiles and compare across sessions

### What needs more work
- **Phase knob** is currently manual — you set it yourself based on judgment, not measurement
- **Q (width)** maps imperfectly to discrete named dimensions — it's more useful on continuous spectra
- **Delay correction panel** gives template-based advice, not custom analysis per case
- The tool is strongest when you already know something went wrong and want to name it precisely. It's weaker at discovering problems you can't yet articulate.

### What's next (if we continue)
- A **phaser** — multi-turn patching that targets one dimension at a time, batches corrections, and synthesizes them
- Better correction generation — less template, more context-aware
- Probe measurement — structured test prompts that measure the model's response before you try your real prompt

---

## Key terms reference

| Term | Audio meaning | Context calibration meaning |
|------|--------------|----------------------------|
| Band | A single EQ filter targeting one frequency range | A measurement point targeting one context dimension |
| Gain | Volume boost or cut at that frequency | Severity of distortion on that dimension |
| Q (bandwidth) | How narrow or wide the filter affects | How specific or broad the model's misunderstanding is |
| Phase | Angular offset between two signals | Angular offset between user intent and model interpretation |
| Composite curve | Sum of all EQ bands | Full distortion profile across all dimensions |
| 0 dB | No change to the signal | Model understood correctly |
| Delay | Precisely timed signal repeat | Calculated context addition to close a measured gap |
| Echo | Uncontrolled room reflections | Raw model additions (assumptions, hallucinations) |
| Calibration | Measure room, apply correction, re-measure | Measure context gap, revise prompt, re-measure |

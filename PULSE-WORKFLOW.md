# Pulse — Session Workflow Reference

Pulse is an MCP server (`pulse-server`) registered in Claude Code.
Invoke all tools by asking Claude in the session — no bash required.

Data stored at: `~/.pulse-server/` (journal, focus, digests)
Audit written to: `~/.echoes/audit.ndjson`

---

## Session Lifecycle

### 1. Badge-in (session start)

Run in sequence — big picture first, priority queue second.

```
Use morning_briefing
```

Reads overnight audit events, repo health (from seeds snapshots), failed workflows,
and unfinished focus sessions. Returns `warnings` and `priorities`.

```
Use what_should_i_work_on
```

Returns up to 5 ranked items scored by:

1. Correlated failures (audit failure + low-health repo in same domain) — highest weight
2. Low-health repos below threshold (default 70/100)
3. Failed or incomplete workflow executions
4. Scheduled diagnostics follow-up
5. Unfinished focus session (stale if >4h)

---

### 2. Declare focus

```
Use focus_start with task="<what you're doing>" project="<project name>"
```

Only one active session at a time. If interrupted:

```
Use focus_interrupt
```

When done:

```
Use focus_end with outcome="<what was accomplished>"
```

`focus_end` auto-adds a journal entry with duration, interruption count, and quality signal
(`flow` if ≤1 interruption and ≥25 min; `scattered` if ≥3 interruptions).

---

### 3. Log mid-session decisions

Anything not captured by focus — blockers, architectural decisions, context switches:

```
Use journal_add with entry="<what happened>" tags=["<tag>"] mood="<mood>" linkedServer="<server>"
```

**mood options:** `focused` | `scattered` | `blocked` | `flow`

**Example:**

```
Use journal_add with entry="decided to align pulse journal with sessions corpus, not run parallel" tags=["architecture"] mood="focused" linkedServer="pulse-server"
```

---

### 4. Badge-out (session end)

```
Use daily_digest
```

Returns: focus session count, total focus minutes, journal entries, audit events today,
workflow runs, blockers from journal, tomorrow suggestions. Saved to disk automatically.

Then run personal-rag sync:

```bash
bash ~/personal-rag/sync.sh "optional manual context note"
```

`sync.sh` synthesizes a narrative summary (Shipped / Friction / Patterns / Next) from
the audit + pulse journal + prior sessions and writes it to `~/personal-rag/sessions/`.

---

### 5. Weekly (Fridays or on-demand)

```bash
bash ~/personal-rag/weekly.sh --save
```

Queries 7-day session history + audit → generates Additive EQ (amplify) /
Subtractive EQ (cut) / Health / Recommendation report. Saves to sessions corpus.

---

## Tool Reference

| Tool                       | When                  | Key inputs                                   |
| -------------------------- | --------------------- | -------------------------------------------- |
| `morning_briefing`         | Session start         | none                                         |
| `what_should_i_work_on`    | After briefing        | `healthThreshold` (default 70)               |
| `focus_start`              | Beginning a block     | `task`, `project`                            |
| `focus_interrupt`          | Context switch        | none                                         |
| `focus_end`                | Block complete        | `outcome`                                    |
| `journal_add`              | Any mid-session event | `entry`, `tags`, `mood`, `linkedServer`      |
| `journal_list`             | Review entries        | `date` (default today)                       |
| `check_alerts`             | Spot check            | `healthThreshold`                            |
| `daily_digest`             | Session end           | `date`, `save` (default true)                |
| `briefing_preferences_set` | One-time tuning       | `skippedBriefingSections`, `promotedSignals` |
| `health_check`             | Diagnostics           | none                                         |

---

## Pulse + personal-rag Alignment

These two systems cover the same session from different angles:

| System                 | Signal type                               | Written to                 |
| ---------------------- | ----------------------------------------- | -------------------------- |
| Pulse `daily_digest`   | Structured metrics (time, counts, health) | `~/.pulse-server/digests/` |
| personal-rag `sync.sh` | Synthesized narrative (LLM summary)       | `~/personal-rag/sessions/` |

Run both at session end. The sessions corpus feeds `start.sh` orientation brief next morning.
The digest feeds `morning_briefing` the following day.

---

## Briefing Preferences (one-time setup)

Skip noisy sections or promote specific signals to the top of briefings:

```
Use briefing_preferences_set with skippedBriefingSections=["correlations"] promotedSignals=["GRID", "echoes"]
```

**Skippable sections:** `ecosystem` | `overnightActivity` | `correlations` | `currentState` | `warnings` | `priorities`

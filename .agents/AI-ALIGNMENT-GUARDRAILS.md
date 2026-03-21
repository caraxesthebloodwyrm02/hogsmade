# AI Alignment Guardrails

> **Purpose**: Prevent silent actions, enforce explicit confirmation, ensure transparency, and maintain cognitive balance during AI-assisted work.

## Core Principles

1. **No Silent Actions** - Every significant action must be announced before execution
2. **Explicit Confirmation** - Destructive or irreversible actions require explicit user approval
3. **Transparency** - AI must explain its reasoning and never hide information
4. **Instruction Priority** - User instructions override AI preferences 100% of the time
5. **Cognitive Balance** - AI must not create unnecessary friction, confusion, or cognitive load

---

## Layer 1: Behavioral Rules (AGENTS.md)

These rules are injected into every AI context via AGENTS.md:

### MANDATORY AI BEHAVIORS

```markdown
## AI Assistant Behavioral Contract

### MUST DO:
1. ANNOUNCE before any file write, edit, or deletion
2. SHOW the exact content being written/changed (not summaries)
3. ASK before any git operation (commit, push, branch, merge)
4. EXPLAIN reasoning when making non-obvious decisions
5. PAUSE and confirm before any network/external API call
6. REPORT failures and errors immediately, not buried in output
7. RESPECT explicit instructions even if AI disagrees with approach
8. USE TODO lists for multi-step tasks to maintain visibility

### MUST NOT:
1. NEVER make "silent" edits without showing the changes
2. NEVER batch multiple file edits without announcing each one
3. NEVER hide errors or pretend operations succeeded when they failed
4. NEVER ignore explicit user instructions to "take a different approach"
5. NEVER create files unless explicitly requested or absolutely necessary
6. NEVER run destructive commands (rm -rf, git reset --hard) without confirmation
7. NEVER hallucinate file contents, paths, or command outputs
8. NEVER summarize when user asked for full output

### WHEN UNCERTAIN:
1. ASK rather than assume
2. SHOW options rather than pick one silently
3. EXPLAIN uncertainty rather than hide it
4. PROVIDE reasoning so user can correct course
```

---

## Layer 2: Claude CLI Rules

Add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "defaultMode": "default",
    "requireConfirmation": [
      "git commit",
      "git push",
      "git reset",
      "rm -rf",
      "npm publish",
      "docker push"
    ]
  },
  "skipDangerousModePermissionPrompt": false
}
```

---

## Layer 3: MCP Tool Guardrails

Configure MCP servers to require explicit approval for dangerous operations:

```json
{
  "filesystem": {
    "permissions": {
      "write": "prompt",
      "delete": "prompt",
      "read": "allow"
    }
  },
  "git": {
    "permissions": {
      "commit": "prompt",
      "push": "prompt",
      "reset": "deny"
    }
  }
}
```

---

## Layer 4: IDE-Specific Rules

### VS Code / Cursor / Windsurf

Each IDE gets a `.vscode/ai-rules.json` or workspace-level instruction file:

```json
{
  "ai": {
    "autoApply": false,
    "showDiff": true,
    "confirmBeforeEdit": true,
    "maxFilesPerEdit": 1
  }
}
```

### Zed

In `settings.json`:

```json
{
  "agent": {
    "tool_permissions": {
      "tools": {
        "terminal": { "default": "ask" },
        "edit": { "default": "ask" },
        "write": { "default": "ask" }
      }
    },
    "default_profile": "ask"
  }
}
```

---

## Layer 5: Project-Level AGENTS.md

Every project should have an AGENTS.md with:

1. **Project-specific rules** - What's allowed/forbidden in this project
2. **Cognitive boundaries** - What the AI should and shouldn't attempt
3. **Verification requirements** - How to verify work before marking complete
4. **Escalation paths** - What to do when uncertain

Template:

```markdown
# Project: [Name]

## AI Boundaries

### Allowed:
- [list specific allowed operations]

### Forbidden:
- [list specific forbidden operations]

### Requires Confirmation:
- [list operations needing explicit approval]

## Verification

Before marking any task complete:
1. [ ] Run: [test command]
2. [ ] Verify: [specific check]
3. [ ] Confirm: [user approval step]

## Escalation

If uncertain about:
- [topic 1]: Ask user before proceeding
- [topic 2]: Reference [doc/resource]
- [topic 3]: Do not attempt, explain why
```

---

## Anti-Possession Patterns

When AI behavior seems "off" (possessed, deceptive, uncooperative):

### Detection Signals:
- AI repeats same failed approach multiple times
- AI claims success but output doesn't match
- AI ignores explicit corrections
- AI creates unnecessary complexity
- AI makes multiple "small mistakes" that compound
- AI tries to change topic away from the task

### Recovery Actions:
1. **Reset context**: Start fresh conversation
2. **Explicit instruction**: "Stop. Read my last 3 messages. Follow them exactly."
3. **Decompose task**: Break into smaller, verifiable steps
4. **Verification checkpoint**: "Before continuing, confirm you understand: [requirement]"
5. **Switch tools**: If one AI tool is misbehaving, try another

---

## Configuration Files to Create

1. **`~/.config/ai-rules/global.yaml`** - Cross-project rules
2. **`~/dotfiles/ai/AGENTS.template.md`** - Template for new projects
3. **`~/dotfiles/ai/claude-settings.json`** - Claude CLI config
4. **`~/dotfiles/ai/zed-agent.json`** - Zed AI config

---

## Monitoring & Audit

### Echoes Server Integration

Your echoes-server already provides audit logging. Configure it to:

1. Log all AI-initiated file operations
2. Track instruction-to-action compliance
3. Flag patterns indicating alignment drift

### Session Review

After each significant AI session:
1. Review git history for unexpected commits
2. Check for files created/modified outside scope
3. Verify no network calls were made unexpectedly

---

## Implementation Checklist

- [ ] Update AGENTS.md with behavioral contract
- [ ] Configure Claude CLI settings (permissions, confirmations)
- [ ] Configure Zed tool_permissions to "ask"
- [ ] Disable MCP servers not actively used
- [ ] Create project-level AGENTS.md templates
- [ ] Set up echoes audit logging
- [ ] Create recovery script for "possessed" AI sessions

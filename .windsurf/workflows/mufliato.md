# Mufliato Workflow

> Audience translation and sensitive-content sanitization for internal documentation.
> Mufliato fills the eavesdropper's ears with noise — but the intended audience still hears clearly.

---

## Mode Tetrachotomy

Choose one mode before starting. The mode governs how deeply the document is transformed.

| Mode              | What it does                                                                                    | When to use                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **substitute**    | Replace literals (paths, keys, ports) with env-var references or generic placeholders           | Configs, .env examples, setup guides with hardcoded values                                                                      |
| **reframe**       | Restructure content around principles, not specifics — rename concepts, anonymize topology      | Architecture docs, decision records, internal design notes                                                                      |
| **reauthor**      | Rewrite as a standalone public artifact — new structure, new voice, same instructional value    | Pre-ship review packages, public READMEs, blog-ready write-ups (see `Tools/MCPServers/integration-review/public/` as reference) |
| **veil** _(flex)_ | All of the above plus glass-shader opacity: inject plausible decoy blocks at signal-gated ratio | High-sensitivity docs where structural fingerprinting is a concern                                                              |

Pinned core: **substitute + reframe + reauthor** are always available.
Flex slot: **veil** is opt-in — invoke only when `noise-level=high` or explicitly requested.

---

## Layer 1 — Mechanical Scan (delegate to script)

Run `scripts/mufliato.py scan <input.md>` before touching the document.

The script handles:

- Absolute paths (`/home/*`, `/Users/*`, `C:\Users\*`)
- Env var assignments with literal values
- API key / secret / token literals
- Port numbers and localhost bindings
- Deep directory paths (depth > 2)

Output: `.mufliato-log.json` — extraction manifest with `{line, pattern_type, raw_value, context_hint}` for every hit.

**Read the manifest before proceeding.** Context hints tell you whether a finding is load-bearing (referenced in instructions) or incidental (appears in a comment or example).

---

## Layer 2 — Structural Survey

Before substituting anything, map the document's skeleton:

1. List all headings and their nesting depth
2. Identify the primary action sequence (what the reader is being asked to do, in order)
3. Flag any section whose _content_ would change meaning if its sensitive values were replaced — these need reframe or reauthor treatment, not just substitute

This step is agent work — do it by reading the document, not by running the script.

---

## Layer 3 — Decoy Injection _(veil mode only)_

Activate only if `noise-level=high` or mode is **veil**.

Insert plausible-but-inert configuration blocks at a 1:3 ratio (1 decoy per 3 real abstracted blocks). Requirements:

- Decoys must match the document's technical register (same stack, same config syntax)
- Decoys must not contradict the document's functional instructions
- Mark each decoy in the extraction manifest with `"decoy": true` — never let a decoy become load-bearing

If in doubt, skip decoy injection. Inert fillers that confuse the reader defeat the purpose.

---

## Layer 4 — Substitution Pass (delegate to script)

Run `scripts/mufliato.py sanitize <input.md> [--submap <custom.json>]`.

The script applies regex substitutions for paths, secrets, and ports. For values the script misses (identified in Layer 2's structural survey), apply manual substitutions using this map:

```
internal project names     →  [service], [module], [component]
internal domain names      →  example.internal, service.local
specific version numbers   →  <version>  (unless the version is the point)
team/person names          →  [team], [maintainer]
organization-specific URLs →  https://your-org.example.com/...
```

After the script runs, verify the surviving finding count it reports. Any survivors need either manual substitution or a reframe pass on the surrounding section.

---

## Layer 5 — Audience Translation

Substitute alone is not enough. After the mechanical pass, read the document as the target audience would — not as someone who already knows what the internals mean.

For each section, ask:

- Is the _why_ still present, or did substitution strip it?
- Does the _action sequence_ still make sense without the specific values?
- Would the target audience (external contributor, public reviewer, partner team) be able to reproduce the intent from the output alone?

If any section fails this test: reframe (restructure around the principle) or reauthor (rewrite the section from scratch preserving only the instructional goal).

Reference: `Tools/MCPServers/integration-review/public/` demonstrates the reauthor pattern — internal tool docs rewritten as public-facing capability/integration/methodology guides without leaking internal topology.

---

## Layer 6 — Provenance Seal

Append to the output document:

```
<!-- Sanitized via Mufliato | mode=<mode> | audience=<audience> | source_hash=<sha256_first8> | date=<YYYY-MM-DD> -->
```

The script appends this automatically for `sanitize` runs. For manual reauthor passes, append it yourself.

Also ensure `.mufliato-log.json` is committed alongside the output (or stored in the audit trail) — it is the evidentiary record that the output derives from a known source.

---

## Output Contract

| Property                           | Guarantee | Verified by                              |
| ---------------------------------- | --------- | ---------------------------------------- |
| No absolute paths                  | ✓         | Script re-scan                           |
| No literal secrets                 | ✓         | Script re-scan                           |
| No internal naming                 | ✓         | Layer 5 audience read                    |
| Core instructional value preserved | ✓         | Layer 5 audience read                    |
| Reproducible from principle alone  | ✓         | Layer 5 audience read                    |
| Provenance traceable               | ✓         | `.mufliato-log.json` + provenance footer |

---

## Invocation

```bash
# Scan only (see what the script finds)
python scripts/mufliato.py scan <input.md>

# Mechanical sanitize (phases 2 + 4)
python scripts/mufliato.py sanitize <input.md> --output <output.md>

# With a custom substitution overlay
python scripts/mufliato.py sanitize <input.md> --submap substitutions.json --output <output.md>

# Veil mode (noise injection) — mechanical pass only; agent handles decoy injection
python scripts/mufliato.py sanitize <input.md> --noise-level high --output <output.md>
```

After the mechanical pass, continue with Layers 2–5 as agent work.

---

## Coverage Map

| Layer                   | Handled by                       | Mode                      |
| ----------------------- | -------------------------------- | ------------------------- |
| 1. Mechanical scan      | `mufliato.py scan`               | All                       |
| 2. Structural survey    | Agent                            | All                       |
| 3. Decoy injection      | Agent (script flag reserved)     | veil only                 |
| 4. Substitution         | `mufliato.py sanitize` + agent   | All                       |
| 5. Audience translation | Agent                            | reframe / reauthor / veil |
| 6. Provenance seal      | Script (auto) + agent (reauthor) | All                       |

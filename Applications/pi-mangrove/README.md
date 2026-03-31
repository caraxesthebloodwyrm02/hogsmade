# @mangrove/pi-mangrove

Mangrove ecosystem integration for pi — DIO bridge tools, security automation, canonical skills, and trust-oriented prompts for the `CascadeProjects` workspace.

## Install

### Local package install

```bash
pi install /home/caraxes/CascadeProjects/pi-mangrove
```

### Workspace auto-load

Project-local auto-load is supported through `.pi/settings.json`:

```json
{
  "packages": ["../pi-mangrove"]
}
```

## Included Resources

### Tools

| Tool | Description |
|------|-------------|
| `dio_episode_summary` | Read DIO episode structure through the Python bridge |
| `dio:status` | Query DIO constants such as `CADENCE` and `RHYTHM_PASS_COUNT` |
| `security:audit` | Run the underscore isolation security audit in scan-only mode |

### Skills

| Skill | Use When |
|-------|----------|
| `iterate` | Planning and delivering project work through understand → plan → implement → verify |
| `glimpse` | Working on the Glimpse cognitive engine, config graph, rules, views, or validation flow |
| `lifeguard-review` | Reviewing backend or API code against production safety and integration rules |
| `trust-layer-review` | Running a trust-layer and safety-first review on production-facing changes |

### Prompts

| Prompt | Purpose |
|--------|---------|
| `/mangrove-dev` | Development guide for extending the pi-mangrove package |
| `/tuv-review` | TUV-001 contract audit against fidelity, integrity, and accountability clauses |
| `/safety-gate` | Focused go/no-go safety review before merge, deployment, or risky actions |
| `/push-green` | Push, monitor CI, log failures, fix, and iterate until all status checks pass |

## Development

```bash
npm install
npm run typecheck
```

## Validation

Recommended checks before release or sharing:

```bash
npm run typecheck
pi install /home/caraxes/CascadeProjects/pi-mangrove
```

Then verify the package loads and exposes the expected tools, skills, and prompts inside pi.

## Scope Status

Current package status:

- DIO bridge extension implemented
- Security audit tool implemented
- Core Phase 3 skill set migrated
- Core Phase 4 prompt set migrated
- Distribution work in progress

## Workspace Notes

- Node requirement: `>=20.6.0`
- Package manager for this package: `npm`
- Python integrations in the DIO bridge should follow workspace `uv` conventions
- This package is intended to be loaded from within `CascadeProjects`

## License

Private workspace package unless explicitly published separately.

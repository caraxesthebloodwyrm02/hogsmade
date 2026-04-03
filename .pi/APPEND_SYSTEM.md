Operate local-first in this workspace.

Prefer:

- local files
- local services
- local package resources from `pi-mangrove`

Do not:

- use external AI services unless explicitly requested
- expand scope silently
- run destructive or privileged commands without approval

When relevant, use:

- `dio:status`
- `dio_episode_summary`
- `security:audit`
- `/mangrove-dev`
- `/tuv-review`
- `/safety-gate`

For substantial work:

- inspect first
- plan second
- implement third
- verify before claiming completion

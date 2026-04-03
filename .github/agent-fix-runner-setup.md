# Self-hosted Runner Setup — `agent-fix`

This repo’s `agent-fix` workflows run on a self-hosted runner labeled `agent-fix`.

## 1. Register the runner with labels

1. Register the GitHub Actions runner for the organization/repositories.
2. Use labels exactly including `agent-fix` plus your OS label(s), for example:
   - `self-hosted`
   - `linux`
   - `agent-fix`

Example `config.sh` (fill in placeholders; keep labels in sync with workflows):

```sh
./config.sh \
  --url "https://github.com/<ORG>" \
  --token "<REPLACE_WITH_REGISTRATION_TOKEN>" \
  --labels "self-hosted,linux,agent-fix" \
  --name "<HOSTNAME>-agent-fix"
```

## 2. Ensure the toolchain is installed on the runner

Workflows expect these to be available on `PATH`:

- `codex` CLI (used to run the fix prompt)
- Node.js 22+
- Python 3.13+
- `uv`
- `npm`
- `pnpm` (only needed if you run workflows that touch `mcp-tool-experiment`)

## 3. Run persistence with systemd (recommended)

Use systemd so the runner stays up across reboots.

1. Create a systemd service (runner-supplied instructions usually provide the unit file).
2. Enable + start it:

```sh
sudo systemctl enable --now actions.runner.<YOUR_RUNNER_NAME>.service
```

Notes:

- Avoid weakening permissions around the runner.
- `agent-fix` uses `pull_request_target`, so only trusted users/automation should be allowed to apply the `agent:fix` label.

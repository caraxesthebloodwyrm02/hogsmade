# DIO

Control room suite and interactive episode tool — airflow coordination, light control, and security auditing.

## Commands

```bash
# Install (Python 3.13+, uv only)
uv sync

# Run tests
uv run pytest roots/security/scripts

# Control room modules
uv run python -m control_room.airflow
uv run python -m control_room.light_control
```

## Structure

- `control_room/` — airflow coordination, light control, constants
- `roots/security/` — underscore-isolation security audit scripts

## Notes

- Built with hatchling. Wheel packages: `control_room`, `roots`.
- Episode structure managed via `mangrove-server` MCP bridge.
- Security audit checks underscore-isolation patterns across the DIO workspace.

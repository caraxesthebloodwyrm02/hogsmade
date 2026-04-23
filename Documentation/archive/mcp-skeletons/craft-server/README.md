# craft-server

MCP server for **python-craft** — transformer LSP templates, geometric renders, and context artifacts.

## Tools

| Tool                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `health_check`        | Verify python-craft root, uv, venv, and available render modules |
| `list_modules`        | List craft modules with descriptions; filter by tier (T1–T6)     |
| `render`              | Execute a render module → PNG, GIF, or HTML artifact             |
| `run_template`        | Call any public function from T1–T6 LSP templates                |
| `get_recommendations` | Run Sylveon heatmap analysis → basepyright LSP recommendations   |
| `fold_contrast`       | Compute geo-fold contrast between context anchors                |

## Render Targets

| Target               | Module                   | Output                             |
| -------------------- | ------------------------ | ---------------------------------- |
| `gruff_sketch`       | `gruff_geometric_sketch` | `out/gruff_sketch.png`             |
| `gruff_360`          | `gruff_geometric_sketch` | `out/gruff_360_wide.png`           |
| `gruff_compass_x`    | `gruff_geometric_sketch` | `out/gruff_compass_x_contrast.png` |
| `gruff_shift_cycles` | `gruff_geometric_sketch` | `out/gruff_shift_cycles.png`       |
| `sylveon`            | `sylveon_heatmap`        | `out/sylveon_heatmap.png`          |
| `atlas`              | `atlas_polar_field`      | `out/atlas_polar_field.gif`        |
| `fireworks`          | `caraxes_fireworks`      | `out/caraxes_fireworks.gif`        |
| `context_weave`      | `context_weave`          | `out/context_weave.html`           |

## Environment

| Variable     | Default                            | Description               |
| ------------ | ---------------------------------- | ------------------------- |
| `CRAFT_ROOT` | `/home/caraxes/roots/python-craft` | Path to python-craft repo |

## Architecture

TypeScript MCP server (stdio) that shells out to python-craft's Python modules via `uv run python -c "..."`. Validates module and function names against a built-in catalog before execution.

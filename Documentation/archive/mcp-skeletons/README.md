# Archived MCP Skeleton Servers

Archived 2026-04-23. These servers were scaffolded but never implemented — each had 1–2 source files and a smoke test; no tools delivered production value.

| Server | Tools defined | Reason for archival |
|--------|---------------|---------------------|
| `craft-server` | `render`, `run_template`, `fold_contrast`, `get_recommendations`, `list_modules` | No clear owner; no domain differentiation from existing servers |
| `glimpse-server` | `glimpse_analyze`, `glimpse_compress`, `glimpse_similarity`, `glimpse_confidence`, `glimpse_paths`, `glimpse_session`, `glimpse_track` | Redundant with `glimpse-engine` + `glimpse-artifact`; zero active callers |
| `mangrove-server` | `dio_status`, `dio_episode_summary`, `security_audit` | Redundant with echoes observability; DIO bridge never wired |

Source code preserved here for reference. No production traffic was routed to these servers.

To restore any server: `git mv Documentation/archive/mcp-skeletons/<server> Tools/MCPServers/<server>` and re-add to `package.json` workspaces, `mcp_inventory.manifest.json`, and CI workflows.

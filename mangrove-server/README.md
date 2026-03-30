# mangrove-server

Dedicated MCP server for the Mangrove DIO bridge and security audit tools.

## Tools

| Tool | Description |
|------|-------------|
| `dio_episode_summary` | Read DIO episode structure from the local DIO workspace |
| `dio_status` | Query DIO constants such as cadence and pass counts |
| `security_audit` | Run the underscore-isolation security audit in read-only mode |

## Setup

```bash
cd mangrove-server
npm install
```

## Run

```bash
npm start
```

## Environment

- `MANGROVE_DIO_ROOT`
  - optional override for the DIO workspace root
  - defaults to `../DIO` relative to this server package

## Register in MCP config

This server is intended to be registered in:

- `mcp_config.json`
- `claude_code_config.json`

using the stdio `npx tsx /home/caraxes/CascadeProjects/mangrove-server/src/server.ts` pattern.

## Scope

This server intentionally exposes only the MCP-natural subset of `pi-mangrove`:

- DIO bridge query tools
- read-only security audit tooling

It does not attempt to expose Pi skills or prompt templates as MCP tools.

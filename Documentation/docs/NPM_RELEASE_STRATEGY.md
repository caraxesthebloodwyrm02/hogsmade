# NPM Release Strategy

## Current State

The CascadeProjects monorepo is `"private": true` — **no packages are published to npm**.

## Package Distribution Model

| Package             | Type          | Distribution              | npm Published |
| ------------------- | ------------- | ------------------------- | ------------- |
| `shared-types`      | Library       | `file:` reference (local) | No            |
| `shared-resilience` | Library       | `file:` reference (local) | No            |
| `shared-pipeline`   | Library       | `file:` reference (local) | No            |
| `glimpse-artifact`  | React library | Consumed locally          | No            |
| MCP servers (11)    | Services      | Source (stdio transport)  | No            |

## Why No npm Publish

1. **Monorepo is private** — all packages are consumed within the workspace via `file:` references
2. **MCP servers use stdio transport** — they run as local processes, not installed from a registry
3. **Shared packages are workspace-internal** — no external consumers exist
4. **GitHub Releases** cover distribution needs via `release.yml` workflow (tag `v*.*.*`)

## Versioning

- All TypeScript packages are at `1.0.0`
- Versioning follows semver, driven by conventional commits
- Version bumps are manual (no changeset tooling)

## If npm Publish Is Needed in Future

1. Add `publishConfig` to the target package's `package.json`:
   ```json
   {
     "publishConfig": {
       "access": "public",
       "registry": "https://registry.npmjs.org/"
     }
   }
   ```
2. Remove `"private": true` from that package (not the root)
3. Add `npm publish` step to `release.yml` workflow
4. Set `NPM_TOKEN` secret in GitHub repo settings
5. Consider adopting `changesets` for automated version management

## Python Packages (PyPI)

| Package  | Version | PyPI Published                                  |
| -------- | ------- | ----------------------------------------------- |
| GRID     | 2.8.0   | No (private, source-distributed)                |
| echoes   | 0.1.0   | No (name collision on PyPI — unrelated package) |
| apiguard | 0.1.0   | No (name collision on PyPI — unrelated package) |

No Python packages are published to PyPI. All are installed locally via `uv sync`.

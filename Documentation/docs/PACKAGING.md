# Packaging Guide

How to add new packages to hogsmade monorepo.

## Adding a New MCP Server

1. Create directory: `mkdir my-server`
2. Add `package.json`:

```json
{
  "name": "my-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@cascade/shared-types": "file:../shared-types"
  }
}
```

3. Add to root `package.json` workspaces
4. Update cross-project smoke test

## Adding a Shared Package

1. Create directory: `mkdir shared-mypackage`
2. Follow `shared-types` structure
3. Export from `src/index.ts`
4. Add `build` script
5. Update all dependent packages

## Versioning Rules

- **Patch (1.0.x)**: Bug fixes, docs updates
- **Minor (1.x.0)**: New features, backwards compatible
- **Major (x.0.0)**: Breaking changes

All releases use GitHub Releases (no npm publish currently).

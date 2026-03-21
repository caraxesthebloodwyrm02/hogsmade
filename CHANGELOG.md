# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] - 2026-03-21

### Added

- Root repo structure: LICENSE, CONTRIBUTING.md, .editorconfig, .github templates, CHANGELOG.md, SECURITY.md, docs/README.md.
- docs/progress-and-vision.html — Visual progress and vision artifact (phase timeline, project map, Phase 4 vision, doc links).
- docs/PROGRESS_SUMMARY.md — Progress summary and gist; links to Phase 4 quality contract and schema.
- docs/PHASE4_QUALITY_CONTRACT.md — Phase 4 quality contract (acceptance criteria, probabilities, quality-gate report).
- docs/schemas/phase4-quality-gates.schema.json — JSON schema for validating Phase 4 quality-gate reports.
- Lint scripts (`tsc --noEmit`) added to all MCP servers and shared-types.
- CODEOWNERS, pre-commit config, pr-contract and agent-fix CI workflows.
- glimpse-engine module reorganization (core/ imports).
- All MCP servers aligned at v1.0.0; glimpse-artifact bumped from 0.0.0 to 1.0.0.

## [0.1.0] - 2026-03-08

### Added

- Initial workspace layout and root documentation.
- README, CLAUDE.md, AGENTS.md, docs/GIT_REPO.md, docs/DATA_CONTRACTS.md.
- Staging and push workflow in docs/GIT_REPO.md.

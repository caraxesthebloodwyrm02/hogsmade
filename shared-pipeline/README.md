# Shared Pipeline

Shader-pass pipeline primitive — staged pass execution with residue accumulation.

## Commands

```bash
npm install
# Build shared-types first:
#   cd ../shared-types && npm run build
npm run build
npm test
```

## Notes

- Provides the pipeline execution model used by `eligibility-server` for multi-pass evaluation.
- Each pass accumulates residue that feeds into subsequent passes.
- Depends on `@cascade/shared-types`.

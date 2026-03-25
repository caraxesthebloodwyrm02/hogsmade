# Eligibility Routine Schema

Version: 1.0.0
Status: Runtime-backed reference for the dedicated eligibility-server

## Summary

`eligibility-server` evaluates one or more candidates into:

- seeded analog weights
- vertical hierarchy slices
- condition notes
- observation notes
- reusable form artifacts
- collection tables with provenance credit

The runtime uses `@cascade/shared-pipeline` as the execution model. Residue stays append-only so later passes can observe earlier decisions without mutating them.

## Dimensions

- `governance`
- `usability`
- `integration`
- `observability`
- `operational_fit`

## Runtime Args

```ts
RoutineArgs {
  governance: number
  usability: number
  integration: number
  observability: number
  operationalFit: number
  seed?: string
  formTarget: "server_tool" | "rule" | "agent" | "skill" | "reference" | "all"
  tableScope: "attributes" | "dimensions" | "all"
}
```

## Pipeline Passes

1. `normalize-runtime-args`
2. `build-attribute-catalog`
3. `derive-analog-weights`
4. `project-vertical-hierarchy`
5. `derive-condition-notes`
6. `derive-observation-notes`
7. `compile-reusable-forms`
8. `emit-collection-table`

## Server Tools

- `list_attribute_catalog`
- `evaluate_candidate`
- `compile_forms`
- `collect_table`
- `explain_hierarchy`

## Collection Table Columns

- `rowId`
- `rowType`
- `candidateId`
- `dimension`
- `attributeId`
- `sourcePass`
- `sourceArtifact`
- `seed`
- `argvSignature`
- `weightRaw`
- `weightBand`
- `dimensionScore`
- `hierarchyRank`
- `conditionIds`
- `observationIds`
- `creditLabel`

## Notes

- Runtime-backed outputs remain the truth layer.
- Rule, agent, and skill artifacts are compiled projections and must cite candidate ids and weighting inputs.
- Entry candidates remain open-ended; fixtures exist only for tests and examples.

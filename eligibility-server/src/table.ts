import type {
  CollectionRow,
  CollectionTable,
  ConditionNote,
  HierarchySlice,
  ObservationNote,
  RoutineArgs,
  WeightBand,
  AnalogWeight,
} from "./types.js";

interface BuildCollectionTableInput {
  args: RoutineArgs;
  argvSignature: string;
  seed: string;
  weights: AnalogWeight[];
  hierarchy: HierarchySlice[];
  conditions: ConditionNote[];
  observations: ObservationNote[];
  generatedAt: string;
}

function getConditionIds(
  conditions: ConditionNote[],
  candidateId: string,
  dimension: CollectionRow["dimension"],
): string[] {
  return conditions
    .filter((note) => note.candidateId === candidateId && note.dimension === dimension)
    .map((note) => note.id);
}

function getObservationIds(
  observations: ObservationNote[],
  candidateId: string,
  dimension: CollectionRow["dimension"],
): string[] {
  return observations
    .filter((note) => note.candidateId === candidateId && note.dimension === dimension)
    .map((note) => note.id);
}

function nullBand(): WeightBand | null {
  return null;
}

export function buildCollectionTable(input: BuildCollectionTableInput): CollectionTable {
  const rows: CollectionRow[] = [];

  if (input.args.tableScope === "attributes" || input.args.tableScope === "all") {
    for (const weight of input.weights) {
      rows.push({
        rowId: `attribute:${weight.id}`,
        rowType: "attribute",
        candidateId: weight.candidateId,
        dimension: weight.dimension,
        attributeId: weight.attributeId,
        sourcePass: "derive-analog-weights",
        sourceArtifact: "analog-weight",
        seed: input.seed,
        argvSignature: input.argvSignature,
        weightRaw: weight.weightRaw,
        weightBand: weight.weightBand,
        dimensionScore: null,
        hierarchyRank: null,
        conditionIds: getConditionIds(input.conditions, weight.candidateId, weight.dimension),
        observationIds: getObservationIds(input.observations, weight.candidateId, weight.dimension),
        creditLabel: `weight:${weight.id}`,
      });
    }
  }

  if (input.args.tableScope === "dimensions" || input.args.tableScope === "all") {
    for (const slice of input.hierarchy) {
      rows.push({
        rowId: `dimension:${slice.id}`,
        rowType: "dimension",
        candidateId: slice.candidateId,
        dimension: slice.dimension,
        attributeId: null,
        sourcePass: "project-vertical-hierarchy",
        sourceArtifact: "hierarchy-slice",
        seed: input.seed,
        argvSignature: input.argvSignature,
        weightRaw: null,
        weightBand: nullBand(),
        dimensionScore: slice.score,
        hierarchyRank: slice.rank,
        conditionIds: getConditionIds(input.conditions, slice.candidateId, slice.dimension),
        observationIds: getObservationIds(input.observations, slice.candidateId, slice.dimension),
        creditLabel: `hierarchy:${slice.id}`,
      });
    }
  }

  return {
    columns: [
      "rowId",
      "rowType",
      "candidateId",
      "dimension",
      "attributeId",
      "sourcePass",
      "sourceArtifact",
      "seed",
      "argvSignature",
      "weightRaw",
      "weightBand",
      "dimensionScore",
      "hierarchyRank",
      "conditionIds",
      "observationIds",
      "creditLabel",
    ],
    rows,
    generatedAt: input.generatedAt,
  };
}

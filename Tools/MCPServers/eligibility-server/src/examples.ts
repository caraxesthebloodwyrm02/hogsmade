import type { EligibilityCandidate } from "./types.js";

export const FIXTURE_CANDIDATES: readonly EligibilityCandidate[] = [
  {
    id: "governance-lattice",
    label: "Governance lattice",
    summary:
      "A governance-heavy candidate that favors traceability, isolation, and policy discipline.",
    tags: ["governance", "server", "policy"],
    source: "fixture",
    properties: [
      { id: "provenance", label: "Provenance", value: 0.93, source: "fixture" },
      { id: "auditability", label: "Auditability", value: 0.89, source: "fixture" },
      { id: "clarity", label: "Clarity", value: 0.61, source: "fixture" },
      { id: "ambiguity_handling", label: "Ambiguity handling", value: 0.82, source: "fixture" },
      { id: "tooling_fit", label: "Tooling fit", value: 0.64, source: "fixture" },
      { id: "adapter_readiness", label: "Adapter readiness", value: 0.59, source: "fixture" },
      { id: "table_fitness", label: "Table fitness", value: 0.81, source: "fixture" },
      { id: "isolation", label: "Isolation", value: 0.88, source: "fixture" },
      { id: "entry_flexibility", label: "Entry flexibility", value: 0.46, source: "fixture" },
      { id: "friction", label: "Friction", value: 0.34, source: "fixture" },
      { id: "operator_empathy", label: "Operator empathy", value: 0.48, source: "fixture" },
    ],
  },
  {
    id: "usability-orbit",
    label: "Usability orbit",
    summary:
      "A user-centric candidate that favors operator clarity, low friction, and broad entry flexibility.",
    tags: ["usability", "entry", "forms"],
    source: "fixture",
    properties: [
      { id: "provenance", label: "Provenance", value: 0.58, source: "fixture" },
      { id: "auditability", label: "Auditability", value: 0.4, source: "fixture" },
      { id: "clarity", label: "Clarity", value: 0.92, source: "fixture" },
      { id: "ambiguity_handling", label: "Ambiguity handling", value: 0.48, source: "fixture" },
      { id: "tooling_fit", label: "Tooling fit", value: 0.71, source: "fixture" },
      { id: "adapter_readiness", label: "Adapter readiness", value: 0.74, source: "fixture" },
      { id: "table_fitness", label: "Table fitness", value: 0.67, source: "fixture" },
      { id: "isolation", label: "Isolation", value: 0.52, source: "fixture" },
      { id: "entry_flexibility", label: "Entry flexibility", value: 0.91, source: "fixture" },
      { id: "friction", label: "Friction", value: 0.14, source: "fixture" },
      { id: "operator_empathy", label: "Operator empathy", value: 0.94, source: "fixture" },
    ],
  },
  {
    id: "balanced-bridge",
    label: "Balanced bridge",
    summary:
      "A balanced candidate that keeps governance, usability, and integration in workable tension.",
    tags: ["balanced", "bridge", "routine"],
    source: "fixture",
    properties: [
      { id: "provenance", label: "Provenance", value: 0.77, source: "fixture" },
      { id: "auditability", label: "Auditability", value: 0.74, source: "fixture" },
      { id: "clarity", label: "Clarity", value: 0.78, source: "fixture" },
      { id: "ambiguity_handling", label: "Ambiguity handling", value: 0.73, source: "fixture" },
      { id: "tooling_fit", label: "Tooling fit", value: 0.79, source: "fixture" },
      { id: "adapter_readiness", label: "Adapter readiness", value: 0.75, source: "fixture" },
      { id: "table_fitness", label: "Table fitness", value: 0.83, source: "fixture" },
      { id: "isolation", label: "Isolation", value: 0.76, source: "fixture" },
      { id: "entry_flexibility", label: "Entry flexibility", value: 0.78, source: "fixture" },
      { id: "friction", label: "Friction", value: 0.27, source: "fixture" },
      { id: "operator_empathy", label: "Operator empathy", value: 0.79, source: "fixture" },
    ],
  },
] as const;

export function getFixtureCandidates(): EligibilityCandidate[] {
  return FIXTURE_CANDIDATES.map((candidate) => ({
    ...candidate,
    tags: candidate.tags ? [...candidate.tags] : undefined,
    properties: candidate.properties.map((property) => ({ ...property })),
  }));
}

export function getFixtureCandidateById(id: string): EligibilityCandidate | undefined {
  return getFixtureCandidates().find((candidate) => candidate.id === id);
}

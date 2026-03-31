import { describe, expect, it } from "vitest";
import {
  compileFormsHandler,
  evaluateCandidateHandler,
  evaluateRoutine,
  explainHierarchyHandler,
  getFixtureCandidateById,
  listAttributeCatalogHandler,
  safeEvaluateRoutine,
} from "../src/index.js";

describe("eligibility routine smoke", () => {
  it("fails closed with a typed validation result when no candidates are provided", () => {
    const evaluation = safeEvaluateRoutine([]);
    expect(evaluation.validation.ok).toBe(false);
    expect(evaluation.validation.issues).toContain("At least one candidate is required.");
    expect(evaluation.result).toBeNull();
  });

  it("reproduces identical weights and hierarchy for the same candidate, args, and seed", () => {
    const candidate = getFixtureCandidateById("balanced-bridge");
    expect(candidate).toBeDefined();

    const args = {
      governance: 1.1,
      usability: 1.1,
      integration: 1.2,
      observability: 1.3,
      operationalFit: 1.0,
      seed: "stable-seed",
      formTarget: "all" as const,
      tableScope: "all" as const,
    };

    const first = evaluateRoutine([candidate!], args);
    const second = evaluateRoutine([candidate!], args);

    expect(first.seed).toBe(second.seed);
    expect(first.argvSignature).toBe(second.argvSignature);
    expect(first.weights).toEqual(second.weights);
    expect(first.hierarchy).toEqual(second.hierarchy);
    expect(first.table.rows).toEqual(second.table.rows);
  });

  it("changes the overall hierarchy when governance and usability biases change", () => {
    const governanceHeavy = evaluateRoutine(
      [
        getFixtureCandidateById("governance-lattice")!,
        getFixtureCandidateById("usability-orbit")!,
      ],
      {
        governance: 1.8,
        usability: 0.7,
        integration: 1,
        observability: 1,
        operationalFit: 1,
      },
    );

    const usabilityHeavy = evaluateRoutine(
      [
        getFixtureCandidateById("governance-lattice")!,
        getFixtureCandidateById("usability-orbit")!,
      ],
      {
        governance: 0.7,
        usability: 1.8,
        integration: 1,
        observability: 1,
        operationalFit: 1,
      },
    );

    expect(governanceHeavy.hierarchy.find((slice) => slice.dimension === "overall" && slice.rank === 1)?.candidateId)
      .toBe("governance-lattice");
    expect(usabilityHeavy.hierarchy.find((slice) => slice.dimension === "overall" && slice.rank === 1)?.candidateId)
      .toBe("usability-orbit");
  });

  it("exposes handlers for catalog, forms, and hierarchy explanation", () => {
    const catalog = listAttributeCatalogHandler();
    expect(catalog.attributes.length).toBeGreaterThan(0);
    expect(catalog.fixtures.length).toBeGreaterThan(0);

    const forms = compileFormsHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(forms.validation.ok).toBe(true);
    expect(forms.forms.length).toBe(5);

    const explanation = explainHierarchyHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(explanation.validation.ok).toBe(true);
    expect(explanation.explanation).toContain("Top overall hierarchy");

    const evaluation = evaluateCandidateHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(evaluation.validation.ok).toBe(true);
    expect(evaluation.result?.forms.length).toBe(5);
  });
});

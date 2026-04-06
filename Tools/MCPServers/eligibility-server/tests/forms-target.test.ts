import { describe, expect, it } from "vitest";
import { compileFormArtifacts } from "../src/forms.js";
import { getFixtureCandidateById } from "../src/examples.js";
import { evaluateRoutine } from "../src/pipeline.js";

describe("compileFormArtifacts formTarget branching", () => {
  it("emits only the requested form when formTarget is not all", () => {
    const candidate = getFixtureCandidateById("balanced-bridge")!;
    const result = evaluateRoutine([candidate], {
      governance: 1,
      usability: 1,
      integration: 1,
      observability: 1,
      operationalFit: 1,
      formTarget: "reference",
      tableScope: "dimensions",
    });

    const forms = compileFormArtifacts({
      args: result.args,
      seed: result.seed,
      argvSignature: result.argvSignature,
      candidateIds: result.candidates.map((c) => c.id),
      hierarchy: result.hierarchy,
      conditions: result.conditions,
      observations: result.observations,
      summary: result.summary,
    });

    expect(forms).toHaveLength(1);
    expect(forms[0]?.kind).toBe("reference");
  });
});

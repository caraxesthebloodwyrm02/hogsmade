import { describe, it, expect } from "vitest";
import * as learning from "../src/engine/learning";

describe("school-server", () => {
  it("exposes the core learning engine API", () => {
    expect(typeof learning.ingestKnowledge).toBe("function");
    expect(typeof learning.retrieveConcept).toBe("function");
    expect(typeof learning.generateStudyPlan).toBe("function");
    expect(typeof learning.assessMilestone).toBe("function");
  });
});

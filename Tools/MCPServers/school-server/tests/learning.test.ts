import { beforeEach, describe, it, expect } from "vitest";
import {
  ingestKnowledge,
  retrieveConcept,
  generateStudyPlan,
  assessMilestone,
  resetKnowledgeBase,
} from "../src/engine/learning";

beforeEach(() => {
  resetKnowledgeBase();
});

describe("ingestKnowledge", () => {
  it("stores a block with a unique id and default level", () => {
    const a = ingestKnowledge("Photosynthesis", "Plants convert light to energy");
    const b = ingestKnowledge("Photosynthesis", "Plants convert light to energy");

    expect(a.id).not.toBe(b.id);
    expect(a.level).toBe("foundational");
    expect(a.tags).toEqual([]);
  });

  it("respects explicit tags and level", () => {
    const block = ingestKnowledge("Calculus", "Limits and derivatives", ["math"], "advanced");
    expect(block.level).toBe("advanced");
    expect(block.tags).toEqual(["math"]);
  });
});

describe("retrieveConcept", () => {
  it("matches by topic, content, and exact tag (case-insensitive)", () => {
    ingestKnowledge("Gravity", "A force of attraction", ["physics"]);
    ingestKnowledge("Tides", "Caused by gravity and the moon", ["earth"]);

    expect(retrieveConcept("gravity")).toHaveLength(2); // topic + content match
    expect(retrieveConcept("PHYSICS")).toHaveLength(1); // tag match
    expect(retrieveConcept("unrelated")).toHaveLength(0);
  });
});

describe("generateStudyPlan", () => {
  it("returns an intro plan with no blocks when nothing matches", () => {
    const plan = generateStudyPlan("Astrophysics");
    expect(plan.title).toBe("Introduction to Astrophysics");
    expect(plan.blocks).toHaveLength(0);
    expect(plan.estimatedMinutes).toBe(0);
  });

  it("estimates 15 minutes per relevant block", () => {
    ingestKnowledge("Algebra basics", "Variables and equations", ["algebra"]);
    ingestKnowledge("Algebra II", "Quadratics", ["algebra"]);

    const plan = generateStudyPlan("algebra");
    expect(plan.blocks).toHaveLength(2);
    expect(plan.estimatedMinutes).toBe(30);
  });
});

describe("assessMilestone", () => {
  it("labels progress as mastery checkpoints, not scores", () => {
    ingestKnowledge("Cells", "Basic unit of life", ["biology"]);
    ingestKnowledge("DNA", "Genetic code", ["biology"]);
    ingestKnowledge("Evolution", "Change over time", ["biology"]);

    expect(assessMilestone("biology", 0).label).toBe("Not started");
    expect(assessMilestone("biology", 1).label).toBe("Getting started");
    expect(assessMilestone("biology", 2).label).toBe("Building fluency");
    expect(assessMilestone("biology", 3).label).toBe("Mastery");
  });

  it("clamps mastered count to the number of available blocks", () => {
    ingestKnowledge("History", "The past", ["history"]);
    const milestone = assessMilestone("history", 99);
    expect(milestone.blocksMastered).toBe(1);
    expect(milestone.totalBlocks).toBe(1);
    expect(milestone.completionRatio).toBe(1);
  });

  it("handles subjects with no material", () => {
    const milestone = assessMilestone("emptysubject", 5);
    expect(milestone.totalBlocks).toBe(0);
    expect(milestone.completionRatio).toBe(0);
    expect(milestone.label).toBe("Not started");
  });
});

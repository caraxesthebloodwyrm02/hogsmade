import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeStringSimilarity,
  computeTokenOverlap,
  computeDimensionSimilarity,
} from "../analysis/similarity.js";

describe("computeStringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    assert.equal(computeStringSimilarity("hello", "hello"), 1);
  });

  it("is case-insensitive", () => {
    assert.equal(computeStringSimilarity("Hello", "hello"), 1);
  });

  it("returns 0 for empty vs non-empty", () => {
    assert.equal(computeStringSimilarity("", "hello"), 0);
  });

  it("returns 1 for both empty", () => {
    assert.equal(computeStringSimilarity("", ""), 1);
  });

  it("handles null/undefined", () => {
    assert.equal(computeStringSimilarity(null, "hello"), 0);
    assert.equal(computeStringSimilarity(undefined, undefined), 1);
  });

  it("scores similar strings high", () => {
    const score = computeStringSimilarity("Germany", "Germanny");
    assert.ok(score > 0.7, `Expected > 0.7, got ${score}`);
  });

  it("scores dissimilar strings low", () => {
    const score = computeStringSimilarity("apple", "zebra");
    assert.ok(score < 0.5, `Expected < 0.5, got ${score}`);
  });
});

describe("computeTokenOverlap", () => {
  it("returns 1 for identical token sets", () => {
    assert.equal(computeTokenOverlap("new york", "new york"), 1);
  });

  it("handles partial overlap", () => {
    const score = computeTokenOverlap("new york city", "new york state");
    // Tokens: {new, york, city} vs {new, york, state} -> 2/4 = 0.5
    assert.equal(score, 0.5);
  });

  it("returns 0 for disjoint sets", () => {
    assert.equal(computeTokenOverlap("apple", "zebra"), 0);
  });

  it("handles different delimiters", () => {
    const score = computeTokenOverlap("north-east", "north east");
    assert.equal(score, 1);
  });
});

describe("computeDimensionSimilarity", () => {
  it("returns exact match for identical space values", () => {
    const result = computeDimensionSimilarity("London", "London", "space");
    assert.equal(result.score, 1);
    assert.equal(result.method, "exact");
    assert.equal(result.matched, true);
  });

  it("detects space aliases", () => {
    const result = computeDimensionSimilarity("USA", "United States", "space");
    assert.ok(result.score >= 0.9, `Expected >= 0.9, got ${result.score}`);
    assert.equal(result.method, "alias");
    assert.equal(result.matched, true);
  });

  it("fuzzy matches similar space values", () => {
    const result = computeDimensionSimilarity(
      "New York",
      "New York City",
      "space"
    );
    assert.ok(result.score > 0.4, `Expected > 0.4, got ${result.score}`);
  });

  it("handles time dimension with continuous distance", () => {
    const result = computeDimensionSimilarity(1990, 1995, "time");
    assert.ok(result.score > 0.9, `Expected > 0.9, got ${result.score}`);
    assert.equal(result.method, "temporal-distance");
  });

  it("time similarity decreases with distance", () => {
    const close = computeDimensionSimilarity(1990, 1995, "time");
    const far = computeDimensionSimilarity(1990, 2050, "time");
    assert.ok(close.score > far.score);
  });

  it("time returns 0 for 100+ year gap", () => {
    const result = computeDimensionSimilarity(1800, 1950, "time");
    assert.equal(result.score, 0);
    assert.equal(result.matched, false);
  });

  it("handles null inputs", () => {
    const result = computeDimensionSimilarity(null, "London", "space");
    assert.equal(result.score, 0);
    assert.equal(result.matched, false);
  });

  it("domain similarity uses token overlap", () => {
    const result = computeDimensionSimilarity(
      "computer science",
      "computer engineering",
      "domain"
    );
    assert.ok(result.score > 0.3, `Expected > 0.3, got ${result.score}`);
    assert.equal(result.method, "fuzzy-domain");
  });

  it("uses config synonym groups for space aliases", () => {
    const config = {
      semantic_packs: {
        synonym_groups: {
          "bd": ["bangladesh", "bangla"],
        },
      },
    };
    const result = computeDimensionSimilarity("BD", "Bangladesh", "space", config);
    assert.ok(result.score >= 0.9, `Expected >= 0.9, got ${result.score}`);
  });
});

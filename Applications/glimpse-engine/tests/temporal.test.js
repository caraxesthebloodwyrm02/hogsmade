import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bucketYearAdaptive,
  computeTemporalRange,
  detectTemporalClusters,
  computeTemporalDensity,
} from "../analysis/temporal.js";

describe("bucketYearAdaptive", () => {
  it("returns null for non-numeric", () => {
    assert.equal(bucketYearAdaptive("abc", 50), null);
    assert.equal(bucketYearAdaptive(null, 50), null);
  });

  it("uses 5-year buckets for narrow range", () => {
    assert.equal(bucketYearAdaptive(2023, 15), "2020-2024");
    assert.equal(bucketYearAdaptive(2027, 15), "2025-2029");
  });

  it("uses decade buckets for medium range", () => {
    assert.equal(bucketYearAdaptive(1985, 50), "1980s");
    assert.equal(bucketYearAdaptive(1993, 50), "1990s");
  });

  it("uses quarter-century for wide range", () => {
    assert.equal(bucketYearAdaptive(1850, 200), "1850-1874");
    assert.equal(bucketYearAdaptive(1920, 200), "1900-1924");
  });

  it("uses century buckets for very wide range", () => {
    assert.equal(bucketYearAdaptive(1650, 600), "1600s");
    assert.equal(bucketYearAdaptive(1850, 600), "1800s");
  });
});

describe("computeTemporalRange", () => {
  it("returns null for empty array", () => {
    assert.equal(computeTemporalRange([]), null);
  });

  it("computes range correctly", () => {
    const result = computeTemporalRange([1900, 1950, 2000]);
    assert.deepEqual(result, { min: 1900, max: 2000, range: 100 });
  });

  it("filters non-numeric values", () => {
    const result = computeTemporalRange([1900, "abc", null, 2000]);
    assert.deepEqual(result, { min: 1900, max: 2000, range: 100 });
  });

  it("handles single value", () => {
    const result = computeTemporalRange([1990]);
    assert.deepEqual(result, { min: 1990, max: 1990, range: 0 });
  });
});

describe("detectTemporalClusters", () => {
  it("returns empty for fewer than 2 values", () => {
    assert.deepEqual(detectTemporalClusters([1990]), []);
  });

  it("detects a single cluster for close values", () => {
    const clusters = detectTemporalClusters([1990, 1992, 1993, 1995]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].count, 4);
  });

  it("detects multiple clusters with gaps", () => {
    const values = [1800, 1805, 1810, 1950, 1955, 1960];
    const clusters = detectTemporalClusters(values, { gapThreshold: 20 });
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].count, 3);
    assert.equal(clusters[1].count, 3);
  });

  it("respects minClusterSize", () => {
    const values = [1800, 1950, 1955, 1960];
    const clusters = detectTemporalClusters(values, {
      gapThreshold: 20,
      minClusterSize: 2,
    });
    // 1800 alone doesn't meet minClusterSize=2
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].min, 1950);
  });

  it("cluster has label spanning min-max", () => {
    const clusters = detectTemporalClusters([1990, 1995, 2000], {
      gapThreshold: 20,
    });
    assert.equal(clusters[0].label, "1990-2000");
  });
});

describe("computeTemporalDensity", () => {
  it("returns empty for fewer than 2 values", () => {
    assert.deepEqual(computeTemporalDensity([1990]), []);
  });

  it("returns density array with normalized values", () => {
    const density = computeTemporalDensity([1990, 1992, 1995, 2000]);
    assert.ok(density.length > 0);
    // Max density should be 1.0 (normalized)
    const maxD = Math.max(...density.map((d) => d.density));
    assert.equal(maxD, 1);
  });

  it("peaks near clusters of values", () => {
    const density = computeTemporalDensity([1990, 1991, 1992, 2020]);
    const around1991 = density.find((d) => d.year === 1991);
    const around2010 = density.find((d) => d.year === 2010);
    if (around1991 && around2010) {
      assert.ok(
        around1991.density > around2010.density,
        "Density should be higher near the cluster"
      );
    }
  });
});

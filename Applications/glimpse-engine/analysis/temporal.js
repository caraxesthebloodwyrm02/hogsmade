/**
 * Adaptive Temporal Resolution
 *
 * Replaces crude decade-only bucketing with range-aware temporal analysis.
 * Pure functions, browser-compatible, zero dependencies.
 */

/**
 * Adaptive year bucketing based on the data's temporal range.
 *
 * @param {number} value - Year value
 * @param {number} range - Span of the dataset in years (max - min)
 * @returns {string|null} Bucket label or null if value is not a number
 */
export function bucketYearAdaptive(value, range) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  if (range < 20) {
    // 5-year buckets
    const base = Math.floor(value / 5) * 5;
    return `${base}-${base + 4}`;
  }
  if (range <= 100) {
    // Decade buckets (matches existing behavior)
    return `${Math.floor(value / 10) * 10}s`;
  }
  if (range <= 500) {
    // Quarter-century buckets
    const base = Math.floor(value / 25) * 25;
    return `${base}-${base + 24}`;
  }
  // Century buckets
  const century = Math.floor(value / 100) * 100;
  return `${century}s`;
}

/**
 * Compute the temporal range (min, max, span) from a set of time values.
 *
 * @param {Array<number|*>} values - Raw time values (non-numeric filtered out)
 * @returns {{ min: number, max: number, range: number }|null}
 */
export function computeTemporalRange(values) {
  const years = (values || [])
    .filter((v) => v != null && v !== "" && typeof v !== "boolean")
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (years.length < 1) return null;

  const min = Math.min(...years);
  const max = Math.max(...years);
  return { min, max, range: max - min };
}

/**
 * Gap-based 1D temporal clustering.
 *
 * Sorts time values, splits where gaps exceed a threshold (adaptive or fixed).
 * Each cluster has a center (mean), spread (stdev), and member indices.
 *
 * @param {Array<number>} timeValues - Numeric year values
 * @param {object} [options]
 * @param {number} [options.gapThreshold] - Fixed gap threshold. If omitted, uses adaptive.
 * @param {number} [options.minClusterSize=2] - Minimum entities per cluster
 * @returns {Array<{center: number, spread: number, members: Array<number>, label: string}>}
 */
export function detectTemporalClusters(timeValues, options = {}) {
  const years = (timeValues || [])
    .map(Number)
    .filter((v) => Number.isFinite(v));

  if (years.length < 2) return [];

  const sorted = [...years].sort((a, b) => a - b);
  const minSize = options.minClusterSize || 2;

  // Adaptive gap threshold: median gap * 2, or use provided value
  let gapThreshold = options.gapThreshold;
  if (gapThreshold == null) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i] - sorted[i - 1]);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)] || 10;
    gapThreshold = Math.max(medianGap * 2, 5);
  }

  // Split into clusters at gaps
  const clusters = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gapThreshold) {
      if (current.length >= minSize) {
        clusters.push(buildCluster(current));
      }
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  if (current.length >= minSize) {
    clusters.push(buildCluster(current));
  }

  return clusters;
}

function buildCluster(members) {
  const sum = members.reduce((a, b) => a + b, 0);
  const center = sum / members.length;
  const variance =
    members.reduce((acc, v) => acc + (v - center) ** 2, 0) / members.length;
  const spread = Math.sqrt(variance);
  const min = members[0];
  const max = members[members.length - 1];

  return {
    center: Math.round(center),
    spread: Math.round(spread * 10) / 10,
    members,
    count: members.length,
    min,
    max,
    label: min === max ? `${min}` : `${min}-${max}`,
  };
}

/**
 * Simple kernel density estimation for temporal hotspot detection.
 *
 * Returns density values at each unique year plus interpolated points.
 * Uses a Gaussian-like kernel with configurable bandwidth.
 *
 * @param {Array<number>} timeValues - Numeric year values
 * @param {object} [options]
 * @param {number} [options.bandwidth] - Kernel bandwidth in years (default: adaptive)
 * @param {number} [options.resolution=1] - Step size for density output
 * @returns {Array<{year: number, density: number}>}
 */
export function computeTemporalDensity(timeValues, options = {}) {
  const years = (timeValues || [])
    .map(Number)
    .filter((v) => Number.isFinite(v));

  if (years.length < 2) return [];

  const sorted = [...years].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;

  if (range === 0) {
    return [{ year: min, density: years.length }];
  }

  // Adaptive bandwidth: Silverman's rule of thumb (simplified)
  const bandwidth =
    options.bandwidth ||
    Math.max(
      1,
      Math.round(
        1.06 *
          standardDeviation(years) *
          Math.pow(years.length, -0.2)
      )
    );

  const resolution = options.resolution || 1;
  const result = [];

  for (let y = min; y <= max; y += resolution) {
    let density = 0;
    for (const v of years) {
      const u = (y - v) / bandwidth;
      // Gaussian kernel (unnormalized — relative density is what matters)
      density += Math.exp(-0.5 * u * u);
    }
    result.push({
      year: y,
      density: Math.round(density * 1000) / 1000,
    });
  }

  // Normalize to [0, 1]
  const maxDensity = Math.max(...result.map((r) => r.density));
  if (maxDensity > 0) {
    for (const r of result) {
      r.density = Math.round((r.density / maxDensity) * 1000) / 1000;
    }
  }

  return result;
}

function standardDeviation(values) {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

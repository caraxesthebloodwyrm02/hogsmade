/**
 * Entity building for the Glimpse engine.
 * Transforms records into enriched entities with dimensions and metrics.
 */

import {
  flattenRecord,
  normalizeName,
  normalizeScalar,
  slugify,
} from "../utils/utils.js";
import {
  chooseEntityColumn,
  chooseTypeColumn,
  detectTones,
  inferEntityType,
  scoreTaxonomy
} from "./profiling.js";

export function buildEntities(records, profile, config) {
  const entityColumn = chooseEntityColumn(profile);
  const typeColumn = chooseTypeColumn(profile);
  const timeColumn = profile.dimensionMap.time?.[0] || null;
  const spaceColumn = profile.dimensionMap.space?.[0] || null;
  const domainColumn = profile.dimensionMap.domain?.[0] || null;
  const catalystColumn = profile.dimensionMap.catalyst?.[0] || null;

  // Track seen names to handle duplicates
  const seenNames = new Map();

  return records.map((record, index) => {
    const recordText = flattenRecord(record);
    const domainKeywordHits = scoreTaxonomy(recordText, config);
    const tones = detectTones(recordText, config);
    const metrics = {};
    profile.descriptors.filter((descriptor) => descriptor.type === "number").forEach((descriptor) => {
      const value = normalizeScalar(record[descriptor.name]);
      if (typeof value === "number") metrics[descriptor.name] = value;
    });

    const rawName = String(record[entityColumn] || `Record ${index + 1}`);
    const normalizedName = normalizeName(rawName);

    // Handle duplicate names by appending a counter
    let uniqueName = rawName;
    const nameCount = seenNames.get(normalizedName) || 0;
    if (nameCount > 0) {
      uniqueName = `${rawName} (${nameCount + 1})`;
    }
    seenNames.set(normalizedName, nameCount + 1);

    // Generate stable ID based on normalized unique name
    const stableId = `e-${slugify(uniqueName)}`;

    return {
      id: stableId,
      name: uniqueName,
      type: typeColumn ? String(record[typeColumn] || "object").toLowerCase() : inferEntityType(recordText),
      dimensions: {
        time: normalizeScalar(record[timeColumn]),
        space: normalizeScalar(record[spaceColumn]),
        domain: normalizeScalar(record[domainColumn]),
        catalyst: normalizeScalar(record[catalystColumn]),
      },
      metrics,
      text: recordText,
      domainKeywordHits,
      domain_keyword_hits: domainKeywordHits,
      tones,
      tone_hits: tones,
      properties: record,
    };
  });
}

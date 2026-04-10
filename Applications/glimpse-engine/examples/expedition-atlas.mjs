/**
 * Expedition Atlas — fictional deep-field mission log
 *
 * Same machinery as the “innovation network” examples, but the records read like
 * a speculative voyage: beacons, archives, and anomalies linked by who decoded whom.
 * Good for storytelling demos and browser paste (glimpse-engine.html → load JSON).
 *
 * Run: node examples/expedition-atlas.mjs
 */

import { runContextPipeline } from "../core/engine.js";

const expeditionLog = [
  {
    name: "Archive Node Zero",
    year: 2024,
    contribution: "Baseline stellar cartography; established silence calibration for void channels",
    domain: "archive",
    location: "Lagrange L2",
    influenced_by: "",
  },
  {
    name: "Relay Outpost Minya",
    year: 2027,
    contribution: "First stable sublight relay through dust curtain; preserved phase coherence",
    domain: "transit",
    location: "Belt Sector 7",
    influenced_by: "Archive Node Zero",
  },
  {
    name: "Echo-7 Arctic Shelf",
    year: 2031,
    contribution: "Sub-ice acoustic mesh; quantum timing drift corrected under pressure",
    domain: "signal",
    location: "Fram Strait",
    influenced_by: "Relay Outpost Minya",
  },
  {
    name: "Vessel Calypso Drift",
    year: 2034,
    contribution:
      "Crew psychology loops mapped to navigation uncertainty; compassion as stabilizer",
    domain: "biosphere",
    location: "Indian Ocean",
    influenced_by: "Echo-7 Arctic Shelf",
  },
  {
    name: "Blackbox Choir",
    year: 2036,
    contribution: "Listened to vacuum harmonics; classified three non-random void signatures",
    domain: "void",
    location: "Trans-Neptunian",
    influenced_by: "Archive Node Zero",
  },
  {
    name: "Harvester Kind-9",
    year: 2038,
    contribution: "Recovered organic polymer not in any catalog; quarantined with song protocol",
    domain: "biosphere",
    location: "Europa shadow sea",
    influenced_by: "Blackbox Choir",
  },
  {
    name: "Lighthouse Unspoken",
    year: 2040,
    contribution: "Mirrored signal from Minya through void band; triangulated an exit whisper",
    domain: "signal",
    location: "Proxima convoy",
    influenced_by: "Harvester Kind-9",
  },
  {
    name: "Cartographers Guild (dissolved)",
    year: 2042,
    contribution: "Merged three incompatible star maps; one deliberate lie detected in the overlap",
    domain: "archive",
    location: "Orbital drydock",
    influenced_by: "Lighthouse Unspoken",
  },
  {
    name: "The Tangent Kids",
    year: 2045,
    contribution: "Teenagers rebuilt the relay stack from myth and scrap; faster than spec",
    domain: "transit",
    location: "Pacific arcology",
    influenced_by: "Vessel Calypso Drift",
  },
  {
    name: "Final Buoy Maybe",
    year: 2048,
    contribution: "Transmitted anyway; message contained only coordinates and an apology",
    domain: "void",
    location: "No fixed point",
    influenced_by: "Cartographers Guild (dissolved)",
  },
];

const atlasConfig = {
  semantic_packs: {
    dimension_aliases: {
      time: ["year", "epoch", "date"],
      space: ["location", "place", "sector"],
      domain: ["domain", "discipline"],
      catalyst: ["influenced_by", "decoded_from", "mentor"],
    },
    query_aliases: {
      views: {
        timeline: ["chronicle", "log", "mission clock"],
        constellation: ["crew", "beacons", "network"],
        flow: ["lineage", "who taught whom", "signal path"],
        clusters: ["factions", "domains"],
        map: ["where we stood", "coordinates"],
      },
    },
  },
  taxonomy: {
    domains: [
      {
        id: "archive",
        label: "Archive & cartography",
        keywords: ["archive", "cartograph", "map", "catalog", "baseline", "guild", "overlap"],
      },
      {
        id: "transit",
        label: "Transit & relays",
        keywords: ["relay", "transit", "sublight", "mesh", "stack", "scrap", "convoy"],
      },
      {
        id: "signal",
        label: "Signal craft",
        keywords: ["signal", "acoustic", "quantum", "phase", "listen", "harmonic", "whisper"],
      },
      {
        id: "biosphere",
        label: "Living systems",
        keywords: ["crew", "psychology", "organic", "polymer", "sea", "compassion", "quarantine"],
      },
      {
        id: "void",
        label: "Void phenomenology",
        keywords: ["void", "vacuum", "signature", "blackbox", "apology", "no fixed"],
      },
    ],
  },
  defaults: {
    active_preset: "storyteller",
    secondary_lens_threshold: 0.35,
    top_secondary_limit: 4,
    evidence_confidence_floor: 0.36,
  },
  presets: {
    storyteller: {
      lens_weights: { void: 1.25, signal: 1.15, biosphere: 1.1, archive: 1.05, transit: 1.0 },
      view_bias: { flow: 1.2, timeline: 1.15, constellation: 1.05, map: 0.9 },
    },
  },
  view_specs: {
    timeline: { label: "Mission clock" },
    constellation: { label: "Beacon web" },
    clusters: { label: "Domains" },
    matrix: { label: "Roster matrix" },
    flow: { label: "Signal lineage" },
    map: { label: "Chart" },
  },
  function_registry: {
    field_exists: { scope: ["dataset", "entity"], args: { path: "field_selector" } },
    taxonomy_score: {
      scope: ["entity"],
      args: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" },
    },
    data_shape: { scope: ["dataset"], args: { min_records: "numeric_threshold" } },
    dimension_count: {
      scope: ["dataset"],
      args: { dimension: "dimension_name", min_count: "numeric_threshold" },
    },
    record_range: {
      scope: ["dataset"],
      args: { min: "numeric_threshold", max: "numeric_threshold" },
    },
    influence_link: { scope: ["dataset", "relation"] },
  },
  rules: [
    {
      id: "void-signature",
      label: "Void-touched entries",
      applies_to: "entity",
      priority: 90,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "void", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "void", score: 1.0 },
        { action: "prefer_view", view: "constellation", score: 0.55 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "signal-path",
      label: "Signal-heavy",
      applies_to: "entity",
      priority: 88,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "signal", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "signal", score: 0.95 },
        { action: "prefer_view", view: "flow", score: 0.65 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "living-mission",
      label: "Biosphere / crew",
      applies_to: "entity",
      priority: 84,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "biosphere", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "biosphere", score: 0.9 },
        { action: "prefer_view", view: "clusters", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "archive-thread",
      label: "Archive nodes",
      applies_to: "entity",
      priority: 82,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "archive", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "archive", score: 0.88 },
        { action: "prefer_view", view: "timeline", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "influence-chain",
      label: "Decoded-from chain present",
      applies_to: "dataset",
      priority: 76,
      function: "influence_link",
      returns: "boolean",
      derive: [
        { action: "prefer_view", view: "flow", score: 0.9 },
        { action: "prefer_view", view: "constellation", score: 0.75 },
      ],
      affects: ["view"],
    },
    {
      id: "has-time",
      applies_to: "dataset",
      priority: 60,
      function: "dimension_count",
      args: { dimension: "time", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [{ action: "prefer_view", view: "timeline", score: 0.85 }],
      affects: ["view"],
    },
    {
      id: "has-space",
      applies_to: "dataset",
      priority: 55,
      function: "dimension_count",
      args: { dimension: "space", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [{ action: "prefer_view", view: "map", score: 0.6 }],
      affects: ["view"],
    },
    {
      id: "small-crew",
      applies_to: "dataset",
      priority: 42,
      function: "record_range",
      args: { min: 6, max: 24 },
      returns: "boolean",
      derive: [{ action: "prefer_view", view: "constellation", score: 0.35 }],
      affects: ["view"],
    },
  ],
};

console.log("=== Expedition Atlas — fictional mission log through Glimpse ===\n");

const result = runContextPipeline(expeditionLog, "json", atlasConfig, { grounding: false });

console.log(
  `Narrative spine: ${expeditionLog.length} waypoints, ${
    result.relations.filter((r) => r.type === "influenced").length
  } influence edges`,
);
console.log(`Primary lens: ${result.primaryLens?.label}`);
console.log("Lenses:");
result.contextLenses.forEach((l, i) => console.log(`  ${i + 1}. ${l.label} (${l.role})`));
console.log();
console.log("View preferences:");
Object.entries(result.viewPreferences)
  .sort((a, b) => b[1] - a[1])
  .forEach(([v, s]) => console.log(`  ${v}: ${s.toFixed(2)}`));
console.log();
console.log("Signal path (explicit influences):");
result.relations
  .filter((r) => r.type === "influenced")
  .forEach((r) => {
    const src = result.entities.find((e) => e.id === r.source);
    const dst = result.entities.find((e) => e.id === r.target);
    if (src && dst) console.log(`  ${src.name} → ${dst.name}`);
  });
console.log();
console.log("Mode:", result.modeSettings?.mode, "| complexity:", result.complexity?.level);
console.log(
  "=== chart your own expedition: copy expeditionLog + atlasConfig into glimpse-engine ===",
);

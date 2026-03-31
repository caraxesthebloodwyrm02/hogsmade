/**
 * Temporal Pattern Detection
 * 
 * Detects time-based patterns in datasets:
 * - Temporal clustering (innovations in specific periods)
 * - Generational patterns (decade-based groupings)
 * - Sequential dependencies (chronological influence chains)
 */

export const temporalPatterns = [
  {
    id: 'temporal-clustering',
    name: 'Temporal Clustering',
    description: 'Innovations cluster in specific time periods with high activity',
    category: 'temporal',
    conditions: [
      {
        type: 'dataset',
        function: 'dimension_count',
        args: { dimension: 'time', min_count: 1 },
        threshold: 0.5
      },
      {
        type: 'entity',
        function: 'temporal_distance',
        args: { max_gap: 10 },
        threshold: 0.3
      }
    ],
    insights: [
      {
        type: 'temporal-hotspot',
        template: 'Temporal clustering detected: {0} innovations within 10-year periods',
        priority: 80
      },
      {
        type: 'era-identification',
        template: 'Innovation era: {value0}s with {score0} activity density',
        priority: 70
      }
    ],
    viewRecommendations: [
      { view: 'timeline', score: 0.9, reason: 'Temporal patterns best visualized chronologically' },
      { view: 'clusters', score: 0.6, reason: 'Time-based clustering benefits from cluster view' }
    ]
  },

  {
    id: 'generational-waves',
    name: 'Generational Waves',
    description: 'Innovation comes in waves with distinct generational patterns',
    category: 'temporal',
    conditions: [
      {
        type: 'dataset',
        function: 'dimension_count',
        args: { dimension: 'time', min_count: 1 },
        threshold: 0.4
      },
      {
        type: 'entity',
        function: 'field_pattern',
        args: { pattern: 'generation|wave|era|period' },
        threshold: 0.2
      }
    ],
    insights: [
      {
        type: 'wave-pattern',
        template: 'Generational wave pattern: {0} distinct innovation periods detected',
        priority: 75
      }
    ],
    viewRecommendations: [
      { view: 'timeline', score: 0.85, reason: 'Wave patterns clearly visible in timeline' },
      { view: 'flow', score: 0.5, reason: 'Generational influence flows' }
    ]
  },

  {
    id: 'sequential-dependency',
    name: 'Sequential Dependency',
    description: 'Chronological influence chains where innovations build on each other',
    category: 'temporal',
    conditions: [
      {
        type: 'relation',
        function: 'temporal_distance',
        args: { max_gap: 20 },
        threshold: 0.4
      },
      {
        type: 'relation',
        function: 'influence_link',
        threshold: 0.5
      }
    ],
    insights: [
      {
        type: 'chronological-influence',
        template: 'Sequential dependency: {0} influence chains within 20-year windows',
        priority: 85
      }
    ],
    viewRecommendations: [
      { view: 'flow', score: 0.9, reason: 'Sequential dependencies best shown as flow' },
      { view: 'timeline', score: 0.7, reason: 'Chronological context in timeline' }
    ]
  }
];

/**
 * Influence Pattern Detection
 * 
 * Detects network influence patterns:
 * - Influence cascades (branching trees)
 * - Cross-domain influence
 * - Hub-and-spoke patterns
 */

export const influencePatterns = [
  {
    id: 'influence-cascade',
    name: 'Influence Cascade',
    description: 'Key influencers create branching influence trees across domains',
    category: 'influence',
    conditions: [
      {
        type: 'dataset',
        function: 'influence_link',
        threshold: 0.5
      },
      {
        type: 'relation',
        function: 'shared_dimension',
        args: { dimension: 'domain' },
        threshold: 0.2 // Allow cross-domain
      }
    ],
    insights: [
      {
        type: 'influence-network',
        template: 'Influence cascade detected: {0} with cross-domain connections',
        priority: 90
      },
      {
        type: 'key-influencers',
        template: 'Key influencers identified: {0} entities with multiple connections',
        priority: 85
      }
    ],
    viewRecommendations: [
      { view: 'flow', score: 0.95, reason: 'Influence relationships best shown as flow' },
      { view: 'constellation', score: 0.8, reason: 'Network structure visible in constellation' }
    ]
  },

  {
    id: 'hub-and-spoke',
    name: 'Hub-and-Spoke',
    description: 'Central hub entities influence many peripheral entities',
    category: 'influence',
    conditions: [
      {
        type: 'relation',
        function: 'influence_link',
        threshold: 0.4
      }
    ],
    insights: [
      {
        type: 'central-hubs',
        template: 'Hub-and-spoke pattern: {0} central influence hubs detected',
        priority: 80
      }
    ],
    viewRecommendations: [
      { view: 'constellation', score: 0.9, reason: 'Hub patterns clearly visible in constellation' },
      { view: 'flow', score: 0.7, reason: 'Influence flow from hubs' }
    ]
  },

  {
    id: 'cross-pollination',
    name: 'Cross-Pollination',
    description: 'Ideas spread between different domains and fields',
    category: 'influence',
    conditions: [
      {
        type: 'relation',
        function: 'shared_dimension',
        args: { dimension: 'domain' },
        threshold: 0.1 // Low threshold = different domains
      }
    ],
    insights: [
      {
        type: 'interdisciplinary-flow',
        template: 'Cross-pollination detected: {0} cross-domain influence connections',
        priority: 85
      }
    ],
    viewRecommendations: [
      { view: 'constellation', score: 0.85, reason: 'Cross-domain connections visible' },
      { view: 'matrix', score: 0.6, reason: 'Domain relationships in matrix' }
    ]
  }
];

/**
 * Geographic Pattern Detection
 * 
 * Detects spatial patterns:
 * - Geographic hotspots
 * - Regional clusters
 * - Spatial influence patterns
 */

export const geographicPatterns = [
  {
    id: 'geographic-hotspot',
    name: 'Geographic Hotspot',
    description: 'Innovation activity concentrates in specific locations',
    category: 'geographic',
    conditions: [
      {
        type: 'dataset',
        function: 'dimension_count',
        args: { dimension: 'space', min_count: 1 },
        threshold: 0.5
      },
      {
        type: 'entity',
        function: 'shared_dimension',
        args: { dimension: 'space' },
        threshold: 0.3
      }
    ],
    insights: [
      {
        type: 'geographic-concentration',
        template: 'Geographic hotspot detected: {0} innovations in same location',
        priority: 70
      },
      {
        type: 'innovation-hubs',
        template: 'Innovation hubs: {value0} identified as key centers',
        priority: 75
      }
    ],
    viewRecommendations: [
      { view: 'map', score: 0.9, reason: 'Geographic patterns require map visualization' },
      { view: 'clusters', score: 0.5, reason: 'Location-based clustering' }
    ]
  },

  {
    id: 'regional-clusters',
    name: 'Regional Clusters',
    description: 'Geographic regions show clustering patterns',
    category: 'geographic',
    conditions: [
      {
        type: 'entity',
        function: 'field_pattern',
        args: { pattern: 'region|area|zone|district' },
        threshold: 0.2
      }
    ],
    insights: [
      {
        type: 'regional-grouping',
        template: 'Regional clustering: {0} geographic regions identified',
        priority: 65
      }
    ],
    viewRecommendations: [
      { view: 'map', score: 0.8, reason: 'Regional patterns on map' },
      { view: 'clusters', score: 0.6, reason: 'Regional groupings' }
    ]
  }
];

/**
 * Domain Bridge Pattern Detection
 * 
 * Detects cross-domain patterns:
 * - Interdisciplinary connections
 * - Domain convergence
 * - Knowledge transfer
 */

export const domainBridgePatterns = [
  {
    id: 'domain-bridging',
    name: 'Domain Bridging',
    description: 'Cross-domain influence and interdisciplinary connections',
    category: 'domain',
    conditions: [
      {
        type: 'relation',
        function: 'shared_dimension',
        args: { dimension: 'domain' },
        threshold: 0.1 // Low threshold = different domains
      }
    ],
    insights: [
      {
        type: 'interdisciplinary',
        template: 'Domain bridging detected: {0} cross-domain influences',
        priority: 85
      },
      {
        type: 'knowledge-transfer',
        template: 'Knowledge transfer: {value0} domains connected through influence',
        priority: 80
      }
    ],
    viewRecommendations: [
      { view: 'constellation', score: 0.8, reason: 'Cross-domain connections visible in network' },
      { view: 'matrix', score: 0.6, reason: 'Domain relationships shown in matrix' }
    ]
  },

  {
    id: 'domain-convergence',
    name: 'Domain Convergence',
    description: 'Multiple domains converge on similar problems or solutions',
    category: 'domain',
    conditions: [
      {
        type: 'entity',
        function: 'taxonomy_score',
        args: { path: 'entity.domain_keyword_hits', domain: 'computing', min_score: 1 },
        threshold: 0.3
      },
      {
        type: 'entity',
        function: 'taxonomy_score',
        args: { path: 'entity.domain_keyword_hits', domain: 'physics', min_score: 1 },
        threshold: 0.3
      }
    ],
    insights: [
      {
        type: 'convergence-point',
        template: 'Domain convergence: {0} domains showing overlapping interests',
        priority: 75
      }
    ],
    viewRecommendations: [
      { view: 'matrix', score: 0.8, reason: 'Domain convergence visible in matrix' },
      { view: 'clusters', score: 0.6, reason: 'Convergence clusters' }
    ]
  }
];

/**
 * Structural Pattern Detection
 * 
 * Detects dataset structure patterns:
 * - Complex networks
 * - Hierarchical structures
 * - Dense vs sparse patterns
 */

export const structuralPatterns = [
  {
    id: 'complex-network',
    name: 'Complex Network',
    description: 'Dense network with multiple relationship types',
    category: 'structural',
    conditions: [
      {
        type: 'dataset',
        function: 'record_range',
        args: { min: 15, max: 100 },
        threshold: 0.5
      },
      {
        type: 'dataset',
        function: 'data_shape',
        args: { min_records: 10 },
        threshold: 0.4
      }
    ],
    insights: [
      {
        type: 'network-complexity',
        template: 'Complex network structure: {0} entities with {1} relationship types',
        priority: 75
      },
      {
        type: 'structural-density',
        template: 'Network density: {score0} with {value0} connections per entity',
        priority: 70
      }
    ],
    viewRecommendations: [
      { view: 'constellation', score: 0.9, reason: 'Complex networks best shown as constellation' },
      { view: 'matrix', score: 0.7, reason: 'Network complexity benefits from matrix view' }
    ]
  },

  {
    id: 'hierarchical-structure',
    name: 'Hierarchical Structure',
    description: 'Clear hierarchical relationships and levels',
    category: 'structural',
    conditions: [
      {
        type: 'entity',
        function: 'field_pattern',
        args: { pattern: 'parent|child|level|depth|nested|hierarchy' },
        threshold: 0.3
      }
    ],
    insights: [
      {
        type: 'hierarchy-levels',
        template: 'Hierarchical structure: {0} levels identified',
        priority: 70
      }
    ],
    viewRecommendations: [
      { view: 'flow', score: 0.8, reason: 'Hierarchical flow visualization' },
      { view: 'constellation', score: 0.6, reason: 'Hierarchy in network' }
    ]
  },

  {
    id: 'sparse-network',
    name: 'Sparse Network',
    description: 'Light connections with clear clustering',
    category: 'structural',
    conditions: [
      {
        type: 'dataset',
        function: 'density_score',
        args: { dense_threshold: 0.5 },
        threshold: 0.3 // Low density = sparse
      }
    ],
    insights: [
      {
        type: 'sparse-structure',
        template: 'Sparse network: {0} clusters with minimal interconnections',
        priority: 65
      }
    ],
    viewRecommendations: [
      { view: 'clusters', score: 0.9, reason: 'Sparse networks benefit from cluster view' },
      { view: 'constellation', score: 0.5, reason: 'Light network structure' }
    ]
  }
];

/**
 * Export all pattern collections
 */
export const allPatterns = [
  ...temporalPatterns,
  ...influencePatterns,
  ...geographicPatterns,
  ...domainBridgePatterns,
  ...structuralPatterns
];

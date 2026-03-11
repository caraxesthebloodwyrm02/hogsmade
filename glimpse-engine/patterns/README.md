# Pattern Registry Documentation

## Overview

The Pattern Registry system extends the Glimpse engine with reusable analytical patterns that detect common structures in datasets. This transforms the engine from a generic analyzer into a pattern-recognition system that learns from historical data structures.

## Architecture

### Core Components

1. **PatternRegistry** (`core/registry.js`)
   - Central registry for pattern definitions
   - Pattern matching and evaluation engine
   - Caching system for performance

2. **Pattern Collections** (`patterns/`)
   - `temporal.js` - Time-based patterns (clustering, waves, sequences)
   - `influence.js` - Network influence patterns (cascades, hubs, cross-pollination)
   - `geographic.js` - Spatial patterns (hotspots, regional clusters)
   - `domain-bridge.js` - Cross-domain patterns (interdisciplinary, convergence)
   - `structural.js` - Dataset structure patterns (complex networks, hierarchies)

3. **Pattern Matchers** (`patterns/pattern-matchers.js`)
   - Specialized functions for pattern detection
   - Extends the core function registry
   - Optimized for pattern matching scenarios

## Pattern Definition Structure

```javascript
{
  id: 'temporal-clustering',
  name: 'Temporal Clustering',
  description: 'Innovations cluster in specific time periods',
  category: 'temporal',
  conditions: [
    {
      type: 'dataset',
      function: 'dimension_count',
      args: { dimension: 'time', min_count: 1 },
      threshold: 0.5
    }
  ],
  insights: [
    {
      type: 'temporal-hotspot',
      template: 'Temporal clustering detected: {0} innovations within 10-year periods',
      priority: 80
    }
  ],
  viewRecommendations: [
    { view: 'timeline', score: 0.9, reason: 'Temporal patterns best visualized chronologically' }
  ]
}
```

## Built-in Patterns

### Temporal Patterns
- **Temporal Clustering** - Detects activity concentrations in time periods
- **Generational Waves** - Identifies innovation waves and generational patterns
- **Sequential Dependency** - Finds chronological influence chains

### Influence Patterns
- **Influence Cascade** - Key influencers with branching influence trees
- **Hub-and-Spoke** - Central hub entities with many connections
- **Cross-Pollination** - Ideas spreading between different domains

### Geographic Patterns
- **Geographic Hotspot** - Innovation activity concentration in locations
- **Regional Clusters** - Geographic region-based groupings

### Domain Bridge Patterns
- **Domain Bridging** - Cross-domain influence and interdisciplinary connections
- **Domain Convergence** - Multiple domains converging on similar problems

### Structural Patterns
- **Complex Network** - Dense networks with multiple relationship types
- **Hierarchical Structure** - Clear hierarchical relationships
- **Sparse Network** - Light connections with clear clustering

## Usage Examples

### Basic Pattern Matching

```javascript
import { createPatternRegistry } from './core/registry.js';
import { runContextPipeline } from './core/engine.js';

// Run standard pipeline
const result = runContextPipeline(data, "json", config);

// Create pattern registry
const patternRegistry = createPatternRegistry();

// Match patterns against results
const matches = patternRegistry.matchPatterns(result, functionRegistry);

// Process pattern matches
matches.forEach(match => {
  console.log(`${match.patternName}: ${match.score.toFixed(2)}`);
  match.insights.forEach(insight => {
    console.log(`💡 ${insight.generated}`);
  });
});
```

### Custom Pattern Registration

```javascript
import { PatternRegistry } from './core/registry.js';

const registry = new PatternRegistry();

registry.register({
  id: 'my-custom-pattern',
  name: 'My Custom Pattern',
  category: 'custom',
  conditions: [
    {
      type: 'entity',
      function: 'taxonomy_score',
      args: { domain: 'my-domain', min_score: 2 },
      threshold: 0.5
    }
  ],
  insights: [
    {
      type: 'custom-insight',
      template: 'Custom pattern detected: {0} entities match criteria',
      priority: 70
    }
  ],
  viewRecommendations: [
    { view: 'constellation', score: 0.8, reason: 'Custom pattern visualization' }
  ]
});
```

## Integration with Pipeline

The pattern registry integrates seamlessly with the existing pipeline:

1. **Standard Pipeline** - Run `runContextPipeline()` as usual
2. **Pattern Matching** - Apply pattern registry to results
3. **Enhanced Insights** - Combine rule-based and pattern-based insights
4. **View Recommendations** - Merge pattern-based view preferences

## Performance Considerations

- **Caching** - Pattern matches are cached per dataset for performance
- **Lazy Evaluation** - Patterns only evaluated when conditions are met
- **Threshold Filtering** - Early termination for failed thresholds
- **Function Registry** - Reuses existing function evaluation infrastructure

## Extending the System

### Adding New Pattern Categories

1. Create new pattern collection file (e.g., `patterns/my-category.js`)
2. Define pattern structures following the standard format
3. Add pattern detection functions to `pattern-matchers.js`
4. Import and register patterns in the registry

### Custom Pattern Functions

```javascript
export function my_pattern_function(context, args) {
  // Custom logic for pattern detection
  return {
    matched: true,
    value: result,
    score: calculatedScore,
    reason: "Explanation of pattern match"
  };
}

// Register with pattern registry
registerPatternFunctions(registry);
```

## Example Datasets

The system includes example datasets that demonstrate pattern reuse:

1. **Innovation Network** (`examples/use-case-innovation-network.mjs`)
   - Historical innovations across domains
   - Demonstrates temporal clustering, influence cascades, domain bridging

2. **Citation Network** (`examples/citation-network.mjs`)
   - Academic paper citations and influence
   - Shows temporal patterns, influence networks, geographic clustering

3. **Startup Ecosystem** (`examples/startup-ecosystem.mjs`)
   - Startup funding and exit patterns
   - Demonstrates geographic hotspots, influence cascades, temporal waves

## Benefits

1. **Reusable Knowledge** - Patterns capture analytical insights that apply across domains
2. **Automatic Detection** - System automatically identifies known patterns in new data
3. **Consistent Analysis** - Standardized pattern evaluation across different datasets
4. **Extensible** - Easy to add new patterns without modifying core engine
5. **Performance** - Cached results and optimized evaluation for large datasets

## Future Directions

1. **Learning System** - Automatically extract patterns from successful analyses
2. **Pattern Composition** - Combine multiple patterns for complex insights
3. **Confidence Scoring** - Probabilistic pattern matching with uncertainty quantification
4. **Temporal Evolution** - Track how patterns emerge and evolve over time
5. **Domain Adaptation** - Automatically tune patterns for specific domains

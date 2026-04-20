/**
 * Cognitive Engine Core Logic
 *
 * This engine evaluates structural inputs for architectural resilience
 * and patterns, returning a cognitive analysis rather than raw data.
 */

export interface CodeBlockAnalysis {
  blockLength: number;
  cyclomaticComplexity: number;
  architecturalResilienceScore: number;
  suggestions: string[];
}

export function evaluateArchitecture(code: string): CodeBlockAnalysis {
  if (!code || code.trim() === "") {
    return {
      blockLength: 0,
      cyclomaticComplexity: 0,
      architecturalResilienceScore: 0,
      suggestions: ["Provide valid code for evaluation."],
    };
  }

  const lines = code.split("\n");
  const blockLength = lines.length;

  // Naive cyclomatic complexity estimation (for demonstration purposes)
  let complexity = 1;
  const keywords = ["if", "for", "while", "switch", "catch", "?", "&&", "||"];
  lines.forEach((line) => {
    keywords.forEach((keyword) => {
      if (line.includes(keyword)) {
        complexity += 1;
      }
    });
  });

  // Resilience score: high complexity or long blocks reduce resilience
  let score = 100;
  score -= complexity * 2;
  if (blockLength > 100) score -= 10;
  if (score < 0) score = 0;

  const suggestions: string[] = [];
  if (complexity > 10) {
    suggestions.push("Consider breaking this logic down; complexity is highly elevated.");
  }
  if (blockLength > 100) {
    suggestions.push("Module exceeds 100 lines. Consider extracting smaller components.");
  }
  if (score === 100) {
    suggestions.push("Clean architectural block detected. Excellent resilience.");
  }

  return {
    blockLength,
    cyclomaticComplexity: complexity,
    architecturalResilienceScore: Math.max(score, 0),
    suggestions,
  };
}

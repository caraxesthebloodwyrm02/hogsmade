// core/lending.js — Domain-specific lending analysis module
// Provides structured lending decision support using glimpse engine

/**
 * Lending risk factors and their weights
 */
export const LENDING_FACTORS = {
  repayment_history: { label: 'Repayment Track Record', weight: 1.2, category: 'financial' },
  financial_capacity: { label: 'Financial Capacity', weight: 1.1, category: 'financial' },
  outstanding_debt: { label: 'Existing Outstanding', weight: 1.0, category: 'financial' },
  business_viability: { label: 'Business Viability', weight: 0.9, category: 'market' },
  relationship_strength: { label: 'Relationship Strength', weight: 0.8, category: 'social' },
  emotional_pressure: { label: 'Emotional Pressure', weight: 0.7, category: 'emotional' },
  market_competition: { label: 'Market Competition', weight: 0.6, category: 'market' }
};

/**
 * Analyze lending context and produce a structured decision view
 * @param {Array} contextData - Array of context objects (request, history, finances, etc.)
 * @returns {Object} Structured lending analysis
 */
export function analyzeLending(contextData) {
  const request = contextData.find(c => c.type === 'request');
  const history = contextData.find(c => c.type === 'history');
  const finances = contextData.find(c => c.type === 'your-finances');
  const market = contextData.find(c => c.type === 'market-context');
  const emotional = contextData.find(c => c.type === 'emotional-factor');

  const factors = [];

  // Repayment track record
  if (history) {
    const reliability = history.pastLends > 0 ? history.repaid / history.pastLends : 0.5;
    factors.push({ ...LENDING_FACTORS.repayment_history, score: reliability, detail: `${history.repaid}/${history.pastLends} repaid` });
  }

  // Financial capacity
  if (finances && request) {
    const afterLend = finances.savings - request.amount;
    const monthsLeft = afterLend / finances.monthlyExpenses;
    const capacityScore = monthsLeft >= 6 ? 0.9 : monthsLeft >= 3 ? 0.6 : monthsLeft >= 1 ? 0.3 : 0.1;
    factors.push({ ...LENDING_FACTORS.financial_capacity, score: capacityScore, detail: `${monthsLeft.toFixed(1)} months runway after` });
  }

  // Outstanding debt
  if (history) {
    const outstandingScore = history.outstanding === 0 ? 0.9 : history.outstanding < 10000 ? 0.5 : 0.2;
    factors.push({
      ...LENDING_FACTORS.outstanding_debt,
      score: outstandingScore,
      detail: history.outstanding > 0 ? `৳${history.outstanding.toLocaleString()} outstanding` : 'clean slate'
    });
  }

  // Business viability
  if (market) {
    const viabilityMap = { high: 0.8, moderate: 0.5, low: 0.2 };
    factors.push({ ...LENDING_FACTORS.business_viability, score: viabilityMap[market.businessViability] || 0.4, detail: market.localDemand || 'no demand data' });
  }

  // Relationship
  if (request) {
    const relMap = { 'close family': 0.8, family: 0.6, friend: 0.5, acquaintance: 0.3 };
    factors.push({ ...LENDING_FACTORS.relationship_strength, score: relMap[request.relationship] || 0.4, detail: request.relationship });
  }

  // Emotional pressure (inverted — high pressure = lower score)
  if (emotional) {
    const pressureMap = { high: 0.3, moderate: 0.5, low: 0.8, none: 0.9 };
    factors.push({ ...LENDING_FACTORS.emotional_pressure, score: pressureMap[emotional.pressure] || 0.5, detail: emotional.pressure + ' pressure' });
  }

  // Calculate weighted score
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = factors.reduce((s, f) => s + (f.score * f.weight), 0) / totalWeight;

  // Generate recommendation
  let recommendation;
  if (weightedScore >= 0.7) {
    recommendation = { signal: 'yes', text: 'Lean towards YES — set clear terms and timeline' };
  } else if (weightedScore >= 0.5) {
    recommendation = { signal: 'conditional', text: 'CONDITIONAL — consider partial amount or structured repayment' };
  } else {
    recommendation = { signal: 'no', text: 'Lean towards NO — risk outweighs benefit' };
  }

  return {
    request: request ? { from: request.from, amount: request.amount, currency: request.currency || 'BDT', reason: request.reason, urgency: request.urgency } : null,
    factors,
    weightedScore,
    recommendation,
    summary: {
      factorCount: factors.length,
      topRisk: factors.filter(f => f.score < 0.5).sort((a, b) => a.score - b.score)[0] || null,
      topStrength: factors.filter(f => f.score >= 0.7).sort((a, b) => b.score - a.score)[0] || null
    }
  };
}

/**
 * Format lending analysis for console output
 */
export function formatLendingView(analysis) {
  const lines = [];
  if (analysis.request) {
    lines.push(`${analysis.request.from} wants ৳${analysis.request.amount.toLocaleString()} for: ${analysis.request.reason}`);
    lines.push(`Urgency: ${analysis.request.urgency}`);
    lines.push('');
  }
  lines.push('Factors');
  lines.push('───────');
  analysis.factors.forEach(f => {
    const bar = '█'.repeat(Math.round(f.score * 10)) + '░'.repeat(10 - Math.round(f.score * 10));
    lines.push(`${bar} ${(f.score * 100).toFixed(0)}%  ${f.label} — ${f.detail}`);
  });
  lines.push('');
  lines.push(`Signal: ${(analysis.weightedScore * 100).toFixed(0)}%`);
  lines.push(`→ ${analysis.recommendation.text}`);
  return lines;
}

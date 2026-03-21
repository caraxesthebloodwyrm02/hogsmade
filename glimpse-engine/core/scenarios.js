// core/scenarios.js — built-in scenario registry
// Each scenario returns { data, config, meta, display(session) }
// The display function uses display.js to render the scenario-specific view.

import * as d from './display.js';
import { analyzeLending, formatLendingView } from './lending.js';

// ============================================================================
// SCENARIO REGISTRY
// ============================================================================

const SCENARIOS = new Map();

function register(id, scenario) {
  SCENARIOS.set(id, scenario);
}

/**
 * Get a scenario by ID.
 */
export function getScenario(id) {
  return SCENARIOS.get(id) || null;
}

/**
 * List all available scenario IDs with descriptions.
 */
export function listScenarios() {
  return [...SCENARIOS.entries()].map(([id, s]) => ({
    id,
    name: s.name,
    description: s.description,
    category: s.category
  }));
}

// ============================================================================
// 1. STANDUP — daily team snapshot
// ============================================================================

register('standup', {
  name: 'Daily Standup',
  description: 'Team pulse, blockers, and momentum at a glance',
  category: 'work',
  data: [
    { person: "Rahim", date: "2026-03-14", yesterday: "Fixed auth bug in login flow", today: "Start payment gateway integration", blockers: "Waiting on API credentials from Stripe", mood: "focused", tags: ["auth", "payments", "backend"] },
    { person: "Ayesha", date: "2026-03-14", yesterday: "Completed dashboard redesign mockups", today: "Implement new chart components", blockers: "None", mood: "energized", tags: ["frontend", "design", "charts"] },
    { person: "Kamal", date: "2026-03-14", yesterday: "Reviewed PRs, fixed CI pipeline", today: "Database migration for user preferences", blockers: "Migration script needs testing on staging", mood: "cautious", tags: ["devops", "database", "ci"] },
    { person: "Nadia", date: "2026-03-14", yesterday: "Wrote unit tests for notification service", today: "Integration tests for email + SMS", blockers: "SMS provider sandbox is down", mood: "frustrated", tags: ["testing", "notifications", "integrations"] },
    { person: "Tariq", date: "2026-03-14", yesterday: "Optimized search query performance", today: "Add caching layer for frequent queries", blockers: "Redis cluster config unclear", mood: "thinking", tags: ["performance", "search", "caching"] }
  ],
  config: {
    functions: {}, rules: [],
    lenses: [
      { id: 'team-health', label: 'Team Health', weight: 1.0 },
      { id: 'blockers', label: 'Blockers & Risks', weight: 1.0 },
      { id: 'momentum', label: 'Momentum', weight: 1.0 },
      { id: 'collaboration', label: 'Collaboration', weight: 1.0 }
    ],
    views: [], taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  },
  meta: { source: 'daily-standup', trigger: 'scheduled' },

  display(session) {
    const entries = this.data;

    d.openFrame('GLIMPSE — Daily Standup');

    d.section('Team Pulse');
    entries.forEach(entry => {
      const blockerFlag = entry.blockers !== 'None' ? ' ⚑' : '';
      d.row(d.icon(entry.mood), entry.person, `${entry.mood.padEnd(12)} → ${entry.today}${blockerFlag}`, { padLabel: 10 });
    });

    const blocked = entries.filter(e => e.blockers !== 'None');
    if (blocked.length > 0) {
      d.gap();
      d.section(`Blockers (${blocked.length})`);
      blocked.forEach(entry => d.flag(`${entry.person}: ${entry.blockers}`));
    }
  }
});

// ============================================================================
// 2. ENERGY — personal wellness/energy map
// ============================================================================

register('energy', {
  name: 'Daily Energy Map',
  description: 'Personal energy flow, clarity, and balance throughout the day',
  category: 'personal',
  data: [
    { time: "06:30", activity: "Morning prayer", energy: 7, clarity: 8, mood: "peaceful", notes: "Good start, slept well", category: "spiritual" },
    { time: "08:00", activity: "Deep work — GRID refactor", energy: 9, clarity: 9, mood: "focused", notes: "Flow state for 2 hours", category: "work" },
    { time: "10:30", activity: "Client call", energy: 6, clarity: 5, mood: "drained", notes: "Scope creep discussion", category: "work" },
    { time: "12:00", activity: "Lunch + walk", energy: 5, clarity: 6, mood: "recovering", notes: "Needed the break", category: "rest" },
    { time: "14:00", activity: "Glimpse engine work", energy: 7, clarity: 7, mood: "creative", notes: "Good progress on interview module", category: "work" },
    { time: "16:00", activity: "Email + admin", energy: 4, clarity: 4, mood: "scattered", notes: "Too many context switches", category: "admin" },
    { time: "18:00", activity: "Evening prayer + reflection", energy: 5, clarity: 7, mood: "contemplative", notes: "Good day overall", category: "spiritual" }
  ],
  config: {
    functions: {}, rules: [],
    lenses: [
      { id: 'energy', label: 'Energy Flow', weight: 1.0 },
      { id: 'clarity', label: 'Mental Clarity', weight: 1.0 },
      { id: 'balance', label: 'Life Balance', weight: 1.0 },
      { id: 'patterns', label: 'Daily Patterns', weight: 1.0 }
    ],
    views: [], taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  },
  meta: { source: 'daily-energy', trigger: 'evening-reflection' },

  display(session) {
    const entries = this.data;

    d.openFrame('GLIMPSE — Daily Energy Map');

    d.section('Energy Flow');
    d.timelineView(entries.map(e => ({
      time: e.time, label: e.activity, value: e.energy, mood: e.mood
    })));

    const avgEnergy = entries.reduce((s, e) => s + e.energy, 0) / entries.length;
    const avgClarity = entries.reduce((s, e) => s + e.clarity, 0) / entries.length;
    const peak = entries.reduce((best, e) => e.energy > best.energy ? e : best, entries[0]);
    const dip = entries.reduce((worst, e) => e.energy < worst.energy ? e : worst, entries[0]);

    d.gap();
    d.section('Balance');
    d.kv('Avg energy', `${avgEnergy.toFixed(1)}/10`);
    d.kv('Avg clarity', `${avgClarity.toFixed(1)}/10`);
    d.kv('Peak', `${peak.time} — ${peak.activity}`);
    d.kv('Dip', `${dip.time} — ${dip.activity}`);

    // Category breakdown
    const categories = {};
    entries.forEach(e => {
      if (!categories[e.category]) categories[e.category] = { count: 0, energy: 0 };
      categories[e.category].count++;
      categories[e.category].energy += e.energy;
    });
    d.gap();
    d.section('By Category');
    Object.entries(categories).forEach(([cat, data]) => {
      d.kv(cat.padEnd(12), `${data.count} blocks  avg energy ${(data.energy / data.count).toFixed(1)}`);
    });
  }
});

// ============================================================================
// 3. PORTFOLIO — project health review
// ============================================================================

register('portfolio', {
  name: 'Portfolio Review',
  description: 'Project health, risk flags, and revenue snapshot',
  category: 'work',
  data: [
    { name: "GRID Framework", status: "active", health: "strong", lastCommit: "2026-03-13", linesOfCode: 190000, testCoverage: 85, openIssues: 12, category: "framework", revenue: 0, effort: "high", tags: ["python", "ai", "core-product"] },
    { name: "API Guard", status: "stable", health: "excellent", lastCommit: "2026-03-10", linesOfCode: 8500, testCoverage: 100, openIssues: 2, category: "library", revenue: 0, effort: "low", tags: ["python", "resilience", "pypi"] },
    { name: "Glimpse Engine", status: "building", health: "growing", lastCommit: "2026-03-14", linesOfCode: 6000, testCoverage: 74, openIssues: 0, category: "tool", revenue: 0, effort: "high", tags: ["javascript", "visualization", "decision-support"] },
    { name: "MCP Services", status: "active", health: "stable", lastCommit: "2026-03-12", linesOfCode: 15000, testCoverage: 65, openIssues: 8, category: "infrastructure", revenue: 0, effort: "medium", tags: ["typescript", "mcp", "services"] },
    { name: "Client Project A", status: "in-progress", health: "at-risk", lastCommit: "2026-03-08", linesOfCode: 3200, testCoverage: 40, openIssues: 5, category: "freelance", revenue: 450, effort: "medium", tags: ["python", "api", "client-work"] },
    { name: "Client Project B", status: "delivered", health: "complete", lastCommit: "2026-03-01", linesOfCode: 1800, testCoverage: 90, openIssues: 0, category: "freelance", revenue: 280, effort: "done", tags: ["typescript", "frontend", "client-work"] }
  ],
  config: {
    functions: {}, rules: [],
    lenses: [
      { id: 'health', label: 'Project Health', weight: 1.0 },
      { id: 'momentum', label: 'Momentum', weight: 1.0 },
      { id: 'risk', label: 'Risk Exposure', weight: 1.0 },
      { id: 'revenue', label: 'Revenue', weight: 1.0 }
    ],
    views: [], taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  },
  meta: { source: 'portfolio-review', trigger: 'scheduled' },

  display(session) {
    const projects = this.data;

    d.openFrame('GLIMPSE — Portfolio Review');

    d.section('Project Health');
    d.statusTable(projects.map(p => ({
      icon: d.icon(p.health),
      name: p.name,
      status: p.status,
      health: p.health,
      detail: p.revenue > 0 ? `$${p.revenue}` : ''
    })));

    // Risk flags
    const risky = projects.filter(p => p.health === 'at-risk' || p.testCoverage < 50);
    if (risky.length > 0) {
      d.gap();
      d.section(`Risk Flags (${risky.length})`);
      risky.forEach(p => {
        const reasons = [];
        if (p.health === 'at-risk') reasons.push('at-risk');
        if (p.testCoverage < 50) reasons.push(`tests ${p.testCoverage}%`);
        d.flag(`${p.name}: ${reasons.join(', ')}`);
      });
    }

    // Snapshot
    const totalRevenue = projects.reduce((sum, p) => sum + p.revenue, 0);
    const totalLOC = projects.reduce((sum, p) => sum + p.linesOfCode, 0);
    d.gap();
    d.section('Snapshot');
    d.kv('Total LOC', totalLOC.toLocaleString());
    d.kv('Revenue this period', `$${totalRevenue}`);
    d.kv('Active projects', projects.filter(p => p.status !== 'delivered').length);
  }
});

// ============================================================================
// 4. LENDING — personal financial decision
// ============================================================================

register('lending', {
  name: 'Lending Decision',
  description: 'Should I lend money? Weighs financial, relational, and emotional factors',
  category: 'personal',
  data: [
    { type: "request", from: "Cousin Farhan", amount: 50000, currency: "BDT", reason: "Business startup — opening a phone repair shop", urgency: "moderate", timeline: "needs it within 2 weeks", relationship: "close family", tags: ["family", "business", "lending"] },
    { type: "history", from: "Cousin Farhan", pastLends: 2, repaid: 1, outstanding: 15000, lastRepayment: "2025-11-01", notes: "Paid back first loan on time, second one still pending", tags: ["history", "track-record"] },
    { type: "your-finances", monthlyIncome: 35000, savings: 120000, monthlyExpenses: 28000, emergencyFund: 80000, notes: "Can afford it but would dip into emergency fund", tags: ["personal-finance", "capacity"] },
    { type: "market-context", businessViability: "moderate", localDemand: "phone repairs are in demand in the area", competition: "2 existing shops within 1km", notes: "Viable but competitive market", tags: ["market", "business-viability"] },
    { type: "emotional-factor", pressure: "family expectations to help", guilt: "moderate — he helped during your job search", relationship_risk: "saying no could create tension", notes: "Social obligation is real but shouldn't override financial sense", tags: ["emotional", "social", "family-dynamics"] }
  ],
  config: {
    functions: {}, rules: [],
    lenses: [
      { id: 'financial', label: 'Financial Risk', weight: 1.2 },
      { id: 'relationship', label: 'Relationship', weight: 1.0 },
      { id: 'viability', label: 'Business Viability', weight: 0.9 },
      { id: 'emotional', label: 'Emotional Factors', weight: 0.8 }
    ],
    views: [], taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  },
  meta: { source: 'lending-decision', trigger: 'manual' },

  display(session) {
    const context = this.data;

    d.openFrame('GLIMPSE — Lending Decision');

    // Use the domain-specific analyzer
    const analysis = analyzeLending(context);

    // Situation
    if (analysis.request) {
      d.section('Situation');
      d.kv('Who', `${analysis.request.from} wants ৳${analysis.request.amount.toLocaleString()}`);
      d.kv('Why', analysis.request.reason);
      d.kv('Urgency', analysis.request.urgency);
    }

    // Decision factors
    d.gap();
    d.decisionView({
      title: 'Decision Factors',
      factors: analysis.factors,
      overallScore: analysis.weightedScore,
      recommendation: analysis.recommendation.text
    });

    // Top risk/strength
    if (analysis.summary.topRisk) {
      d.gap();
      d.flag(`Top risk: ${analysis.summary.topRisk.label} — ${analysis.summary.topRisk.detail}`);
    }
    if (analysis.summary.topStrength) {
      d.signal(`Top strength: ${analysis.summary.topStrength.label} — ${analysis.summary.topStrength.detail}`);
    }
  }
});

// ============================================================================
// 5. RECOMMEND — what should I work on next?
// ============================================================================

register('recommend', {
  name: 'Priority Recommendation',
  description: 'What to work on next — weighs urgency, impact, effort, and dependencies',
  category: 'work',
  data: [
    { task: "Fix login timeout bug", priority: "critical", effort: "small", deadline: "2026-03-15", domain: "backend", blockedBy: null, impact: "high", tags: ["bug", "auth", "urgent"] },
    { task: "Implement dashboard charts", priority: "high", effort: "large", deadline: "2026-03-20", domain: "frontend", blockedBy: null, impact: "medium", tags: ["feature", "visualization", "ui"] },
    { task: "Write API documentation", priority: "medium", effort: "medium", deadline: "2026-03-25", domain: "docs", blockedBy: null, impact: "medium", tags: ["docs", "api"] },
    { task: "Migrate to new auth provider", priority: "high", effort: "large", deadline: "2026-03-22", domain: "backend", blockedBy: "Fix login timeout bug", impact: "high", tags: ["migration", "auth", "infrastructure"] },
    { task: "Set up monitoring alerts", priority: "medium", effort: "small", deadline: null, domain: "devops", blockedBy: null, impact: "medium", tags: ["monitoring", "devops", "reliability"] },
    { task: "Refactor notification service", priority: "low", effort: "medium", deadline: null, domain: "backend", blockedBy: null, impact: "low", tags: ["refactor", "notifications", "tech-debt"] },
    { task: "Client demo preparation", priority: "critical", effort: "medium", deadline: "2026-03-14", domain: "business", blockedBy: "Implement dashboard charts", impact: "high", tags: ["client", "demo", "deadline"] }
  ],
  config: {
    functions: {}, rules: [],
    lenses: [
      { id: 'urgency', label: 'Urgency', weight: 1.2 },
      { id: 'impact', label: 'Impact', weight: 1.0 },
      { id: 'flow', label: 'Flow & Dependencies', weight: 0.9 },
      { id: 'effort', label: 'Effort Balance', weight: 0.8 }
    ],
    views: [], taxonomy: { domains: [] },
    inference: { multi_pass: true, max_passes: 2 },
    grounding: { enabled: false }
  },
  meta: { source: 'task-prioritization', trigger: 'manual' },

  display(session) {
    // Use original scenario data for display (pipeline normalization may alter field names)
    const tasks = this.data;

    d.openFrame('GLIMPSE — What to work on next?');

    // Priority matrix
    d.section('Priority Matrix');
    const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...tasks].sort((a, b) => (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4));

    sorted.forEach(t => {
      const blocked = t.blockedBy ? ` ⛔ blocked by: ${t.blockedBy}` : '';
      const deadline = t.deadline ? ` (due ${t.deadline})` : '';
      d.row(d.icon(t.priority), t.task, `${deadline}${blocked}`, { padLabel: 30 });
    });

    // Recommendation
    const doableNow = sorted.filter(t => !t.blockedBy);
    const topPick = doableNow[0];
    if (topPick) {
      d.gap();
      d.signal(`Recommendation: ${topPick.task}`);
      d.kv('  Priority', topPick.priority);
      d.kv('  Effort', topPick.effort);
      d.kv('  Impact', topPick.impact);
      if (topPick.deadline) d.kv('  Due', topPick.deadline);

      const unblocks = tasks.filter(t => t.blockedBy === topPick.task);
      if (unblocks.length > 0) {
        d.kv('  Unblocks', unblocks.map(t => t.task).join(', '));
      }
    }
  }
});

// ============================================================================
// 6. GENERIC — auto-detected display for piped-in data
// ============================================================================

register('generic', {
  name: 'Generic Analysis',
  description: 'Auto-detected analysis for any data',
  category: 'general',
  data: null, // provided externally
  config: null, // auto-detected
  meta: { source: 'glimpse', trigger: 'manual' },

  display(session) {
    d.openFrame('GLIMPSE — Analysis');

    const result = session.result;

    // Entities
    if (result.entities?.length > 0) {
      d.section('Entities');
      d.list(
        result.entities.slice(0, 10).map(e => {
          const dims = Array.isArray(e.dimensions) ? e.dimensions.join(', ') : String(e.dimensions || 'n/a');
          return `${e.label} (${dims})`;
        })
      );
      if (result.entities.length > 10) {
        console.log(`  ... and ${result.entities.length - 10} more`);
      }
    }

    // Relations
    if (result.relations?.length > 0) {
      d.gap();
      d.section('Relations');
      result.relations.slice(0, 5).forEach(r => {
        console.log(`  ${r.source} → ${r.target} [${r.type}] (${(r.similarity || 0).toFixed(2)})`);
      });
    }

    // Lenses
    if (result.contextLenses?.length > 0) {
      d.gap();
      d.section('Lenses');
      result.contextLenses.forEach(l => {
        d.kv(l.id.padEnd(15), l.score.toFixed(2));
      });
    }
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export { SCENARIOS };

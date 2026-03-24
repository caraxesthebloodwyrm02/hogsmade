/**
 * Glimpse Server — MCP Server for the Glimpse Cognitive Engine
 *
 * Exposes the enhanced Glimpse pipeline (5-phase) as MCP tools:
 * - glimpse_analyze: Run full pipeline on inline data
 * - glimpse_complexity: Detect data complexity without full pipeline
 * - glimpse_compress: Score insight density for a text + evidence set
 * - glimpse_confidence: Summarize confidence from a pipeline result
 * - glimpse_similarity: Compute dimension similarity between two values
 * - glimpse_session: Run full pipeline session on GRID event data
 * - glimpse_track: Track incremental session state across calls
 * - glimpse_paths: Evaluate PATH system on session data
 *
 * Runs via stdio transport. Register in mcp_config.json.
 */

import { SessionRateLimiter } from '@cascade/shared-types/session-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'path';
import { pathToFileURL } from 'url';
import { z } from 'zod';

// ── Constants ──

const SERVER_NAME = 'glimpse-server';
const VERSION = '1.0.0';

// Path to the glimpse engine (sibling directory)
const ENGINE_ROOT = path.resolve(
  new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  '../../glimpse-engine'
);

// ── Dynamic Engine Import ──

let engine: Record<string, any> | null = null;

async function loadEngine(): Promise<Record<string, any>> {
  if (engine) return engine;
  const enginePath = pathToFileURL(path.join(ENGINE_ROOT, 'core', 'engine.js')).href;
  engine = await import(enginePath);
  return engine || {};
}

// ── Server Setup ──

const readLimiter = new SessionRateLimiter();

const server = new McpServer({
  name: SERVER_NAME,
  version: VERSION,
});

// ── Tool: glimpse_analyze ──

server.tool(
  'glimpse_analyze',
  'Run the full Glimpse enhanced pipeline on a dataset. Returns context lenses, relations, confidence report, invariant patterns, complexity assessment, and grounded insights.',
  {
    data: z.array(z.record(z.string(), z.any())).describe('Array of data records (objects with string keys)'),
    fileType: z.enum(['json', 'csv']).default('json').describe('Data format'),
    config: z.record(z.string(), z.any()).optional().describe('Master config override. If omitted, uses minimal defaults.'),
    multiPass: z.boolean().default(false).describe('Enable multi-pass inference'),
    grounding: z.boolean().default(false).describe('Enable local-first grounding'),
  },
  async ({ data, fileType, config: userConfig, multiPass, grounding }) => {
    const rlMsg = readLimiter.check('glimpse_analyze');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      const config = {
        ...(userConfig || {}),
        inference: {
          ...(userConfig?.inference || {}),
          multi_pass: multiPass,
        },
        taxonomy: userConfig?.taxonomy || { domains: [] },
        defaults: userConfig?.defaults || { active_preset: 'analyst' },
        function_registry: userConfig?.function_registry || {
          field_exists: { scope: ['dataset', 'entity'], args: { path: 'field_selector' } },
          taxonomy_score: { scope: ['entity'], args: { path: 'field_selector', domain: 'lens_id', min_score: 'numeric_threshold' } },
          data_shape: { scope: ['dataset'], args: { min_records: 'numeric_threshold' } },
          dimension_count: { scope: ['dataset'], args: { dimension: 'dimension_name', min_count: 'numeric_threshold' } },
          record_range: { scope: ['dataset'], args: { min: 'numeric_threshold', max: 'numeric_threshold' } },
        },
        rules: userConfig?.rules || [],
      };

      const result = eng.runContextPipeline(data, fileType, config, { grounding });

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Pipeline returned null — empty or invalid data.' }] };
      }

      const summary = {
        recordCount: result.profile?.recordCount,
        entityCount: result.entities?.length,
        relationCount: result.relations?.length,
        contextLenses: result.contextLenses?.map((l: any) => ({ label: l.label, score: l.score, role: l.role })),
        primaryLens: result.primaryLens?.label || null,
        viewPreferences: result.viewPreferences,
        complexity: result.complexity,
        modeSettings: result.modeSettings,
        confidenceReport: result.confidenceReport,
        inferenceGapCount: result.inferenceGaps?.length || 0,
        invariantPatternCount: result.invariantPatterns?.length || 0,
        invariantPatterns: (result.invariantPatterns || []).slice(0, 5).map((p: any) => ({
          pattern: p.pattern,
          ruleId: p.ruleId,
          densityScore: p.densityScore,
          domainCount: p.domainCount,
          firingCount: p.firingCount,
        })),
        groundedInsightCount: result.groundedInsights?.length || 0,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_complexity ──

server.tool(
  'glimpse_complexity',
  'Detect data complexity level (simple/moderate/complex) from a dataset without running the full pipeline. Useful for deciding how deep to analyze.',
  {
    entities: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dimensions: z.record(z.string(), z.any()).optional(),
    })).describe('Entity array with dimensions'),
    relationCount: z.number().describe('Number of relations'),
    descriptorCount: z.number().default(0).describe('Number of profile descriptors'),
  },
  async ({ entities, relationCount, descriptorCount }) => {
    const rlMsg = readLimiter.check('glimpse_complexity');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      const profile = { descriptors: new Array(descriptorCount) };
      const relations = new Array(relationCount);

      const result = eng.detectDataComplexity(profile, entities, relations);
      const mode = eng.selectPipelineMode(result, {});

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ...result, recommendedMode: mode }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_compress ──

server.tool(
  'glimpse_compress',
  'Score the density of an insight text — how many domains it covers per token. Higher density = higher quality insight.',
  {
    insightText: z.string().describe('The insight statement to score'),
    evidences: z.array(z.object({
      id: z.string(),
      sourceRuleId: z.string(),
      confidence: z.number(),
      scope: z.string(),
      targetId: z.string().optional(),
      reason: z.string().optional(),
      payload: z.record(z.string(), z.any()).optional(),
    })).describe('Supporting evidence array'),
    lenses: z.array(z.object({
      id: z.string().optional(),
      label: z.string(),
    })).default([]).describe('Context lenses'),
  },
  async ({ insightText, evidences, lenses }) => {
    const rlMsg = readLimiter.check('glimpse_compress');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();
      const evidenceIds = evidences.map((e: any) => e.id);
      const density = eng.scoreInsightDensity(insightText, evidenceIds, evidences, lenses);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(density, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_similarity ──

server.tool(
  'glimpse_similarity',
  'Compute fuzzy similarity between two dimension values. Supports space (with aliases), domain (token overlap), and time (temporal distance).',
  {
    a: z.string().describe('First value'),
    b: z.string().describe('Second value'),
    dimension: z.enum(['space', 'domain', 'time']).describe('Dimension type'),
  },
  async ({ a, b, dimension }) => {
    const rlMsg = readLimiter.check('glimpse_similarity');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();
      const result = eng.computeDimensionSimilarity(a, b, dimension);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_confidence ──

server.tool(
  'glimpse_confidence',
  'Create a confidence frame, detect gaps in a pipeline result, and return a calibrated confidence summary.',
  {
    entities: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dimensions: z.record(z.string(), z.any()).optional(),
    })).describe('Entity array'),
    relations: z.array(z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      type: z.string(),
    })).describe('Relation array'),
    evidences: z.array(z.object({
      id: z.string(),
      confidence: z.number(),
      scope: z.string().optional(),
      sourceRuleId: z.string().optional(),
    })).describe('Evidence array'),
  },
  async ({ entities, relations, evidences }) => {
    const rlMsg = readLimiter.check('glimpse_confidence');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      const frame = eng.createConfidenceFrame();
      eng.detectGaps(frame, { entities, relations, evidences, profile: {} });
      const summary = eng.summarizeConfidence(frame);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Session State ──

const sessionState = new Map<string, { records: any[]; history: any; config: any }>();

// ── Tool: glimpse_session ──

server.tool(
  'glimpse_session',
  'Run a full Glimpse pipeline session on GRID event data. Returns complete analysis including context lenses, confidence report, invariant patterns, grounded insights, and complexity assessment.',
  {
    records: z.array(z.record(z.string(), z.any())).describe('Array of event records (from GRID /api/v1/glimpse/feed or inline)'),
    config: z.record(z.string(), z.any()).optional().describe('Master config override'),
    options: z.object({
      multiPass: z.boolean().default(false).describe('Enable multi-pass inference'),
      grounding: z.boolean().default(false).describe('Enable local-first grounding'),
      presetId: z.string().default('analyst').describe('Preset personality'),
    }).optional().describe('Pipeline options'),
  },
  async ({ records, config: userConfig, options }) => {
    const rlMsg = readLimiter.check('glimpse_session');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      const config = {
        ...(userConfig || {}),
        inference: {
          ...(userConfig?.inference || {}),
          multi_pass: options?.multiPass || false,
        },
        taxonomy: userConfig?.taxonomy || { domains: [] },
        defaults: userConfig?.defaults || { active_preset: options?.presetId || 'analyst' },
        function_registry: userConfig?.function_registry || {
          field_exists: { scope: ['dataset', 'entity'], args: { path: 'field_selector' } },
          taxonomy_score: { scope: ['entity'], args: { path: 'field_selector', domain: 'lens_id', min_score: 'numeric_threshold' } },
          data_shape: { scope: ['dataset'], args: { min_records: 'numeric_threshold' } },
          dimension_count: { scope: ['dataset'], args: { dimension: 'dimension_name', min_count: 'numeric_threshold' } },
          record_range: { scope: ['dataset'], args: { min: 'numeric_threshold', max: 'numeric_threshold' } },
        },
        rules: userConfig?.rules || [],
      };

      const result = eng.runContextPipeline(records, 'json', config, {
        grounding: options?.grounding,
        presetId: options?.presetId,
      });

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Pipeline returned null — empty or invalid data.' }] };
      }

      const output = {
        contextLenses: result.contextLenses,
        confidenceReport: result.confidenceReport,
        invariantPatterns: result.invariantPatterns,
        groundedInsights: result.groundedInsights,
        complexity: result.complexity,
        modeSettings: result.modeSettings,
        viewPreferences: result.viewPreferences,
        ruleTraces: result.ruleTraces,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_track ──

server.tool(
  'glimpse_track',
  'Track incremental session state across multiple calls. Maintains running analysis using Glimpse learning system. Returns session recap and incremental delta.',
  {
    events: z.array(z.record(z.string(), z.any())).describe('New event records to add to tracking'),
    sessionId: z.string().describe('Session identifier for state continuity'),
  },
  async ({ events, sessionId }) => {
    const rlMsg = readLimiter.check('glimpse_track');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      // Initialize or retrieve session state
      if (!sessionState.has(sessionId)) {
        sessionState.set(sessionId, {
          records: [],
          history: null,
          config: {
            inference: { multi_pass: false },
            taxonomy: { domains: [] },
            defaults: { active_preset: 'analyst' },
            function_registry: {
              field_exists: { scope: ['dataset', 'entity'], args: { path: 'field_selector' } },
              taxonomy_score: { scope: ['entity'], args: { path: 'field_selector', domain: 'lens_id', min_score: 'numeric_threshold' } },
              data_shape: { scope: ['dataset'], args: { min_records: 'numeric_threshold' } },
              dimension_count: { scope: ['dataset'], args: { dimension: 'dimension_name', min_count: 'numeric_threshold' } },
              record_range: { scope: ['dataset'], args: { min: 'numeric_threshold', max: 'numeric_threshold' } },
            },
            rules: [],
          },
        });
      }

      const session = sessionState.get(sessionId)!;
      const previousCount = session.records.length;

      // Accumulate new events
      session.records.push(...events);

      // Run pipeline on full accumulated buffer
      const result = eng.runContextPipeline(session.records, 'json', session.config, {});

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Pipeline returned null — insufficient accumulated data.' }] };
      }

      // Learn from run (file I/O may fail in some environments)
      let refinement: any = null;
      try {
        refinement = eng.learnFromRun(
          session.records,
          result,
          session.config,
          { source: sessionId, elapsed: 0 }
        );
      } catch (_learnErr: any) {
        refinement = { error: 'Learning unavailable in this environment' };
      }

      // Build session recap
      let recap: string[] = [];
      try {
        recap = eng.buildSessionRecap(session.records, result, refinement, { source: sessionId });
      } catch (_recapErr: any) {
        recap = [`Session ${sessionId}: ${session.records.length} records accumulated`];
      }

      session.history = result;

      const output = {
        recap,
        delta: {
          newRecords: events.length,
          totalRecords: session.records.length,
        },
        learning: {
          trace: refinement?.trace || null,
          refinement: refinement?.refinement || refinement,
          improvements: refinement?.improvements || null,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: glimpse_paths ──

server.tool(
  'glimpse_paths',
  'Evaluate PATH system (condition-driven weighted accumulation) on session data. Returns scored paths with signal inventory.',
  {
    data: z.array(z.record(z.string(), z.any())).describe('Data records to evaluate paths against'),
    pathIds: z.array(z.string()).optional().describe('Specific path IDs to evaluate (default: all builtin)'),
  },
  async ({ data, pathIds }) => {
    const rlMsg = readLimiter.check('glimpse_paths');
    if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
    try {
      const eng = await loadEngine();

      const config = {
        inference: { multi_pass: false },
        taxonomy: { domains: [] },
        defaults: { active_preset: 'analyst' },
        function_registry: {
          field_exists: { scope: ['dataset', 'entity'], args: { path: 'field_selector' } },
          taxonomy_score: { scope: ['entity'], args: { path: 'field_selector', domain: 'lens_id', min_score: 'numeric_threshold' } },
          data_shape: { scope: ['dataset'], args: { min_records: 'numeric_threshold' } },
          dimension_count: { scope: ['dataset'], args: { dimension: 'dimension_name', min_count: 'numeric_threshold' } },
          record_range: { scope: ['dataset'], args: { min: 'numeric_threshold', max: 'numeric_threshold' } },
        },
        rules: [],
      };

      // Run pipeline to get result
      const result = eng.runContextPipeline(data, 'json', config, {});

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Pipeline returned null — empty or invalid data.' }] };
      }

      // Build trace and path context
      const trace = eng.buildTrace(data, result, {});
      const ctx = eng.buildPathContext(data, result, trace, {}, {}, {});

      // Get paths and optionally filter
      let paths = eng.getBuiltinPaths();
      if (pathIds && pathIds.length > 0) {
        paths = paths.filter((p: any) => pathIds.includes(p.id));
      }

      // Evaluate all paths
      const evaluated = eng.evaluateAllPaths(paths, ctx);

      // Get signal inventory
      const signalInventory = eng.getSignalInventory();

      // Find winner (highest score)
      const sorted = [...evaluated].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      const winner = sorted.length > 0 ? sorted[0] : null;

      const output = {
        winner: winner ? { id: winner.id, label: winner.label, score: winner.score } : null,
        all: sorted.map((p: any) => ({ id: p.id, label: p.label, score: p.score, matched: p.matched })),
        signalInventory,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Exports for MCP SDK compatibility ──

export function buildServer(): McpServer {
  return server;
}

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting — engine: ${ENGINE_ROOT}`);
  const s = buildServer();
  await s.connect(new StdioServerTransport());
  return s;
}

// ── Entry-point guard ──

const isEntrypoint = process.argv[1] != null
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((err) => {
    console.error(`[${SERVER_NAME}] Fatal:`, err);
    process.exitCode = 1;
  });
}

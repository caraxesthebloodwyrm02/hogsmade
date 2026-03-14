/**
 * Glimpse Server — MCP Server for the Glimpse Cognitive Engine
 *
 * Exposes the enhanced Glimpse pipeline (5-phase) as MCP tools:
 * - glimpse_analyze: Run full pipeline on inline data
 * - glimpse_complexity: Detect data complexity without full pipeline
 * - glimpse_compress: Score insight density for a text + evidence set
 * - glimpse_confidence: Summarize confidence from a pipeline result
 * - glimpse_similarity: Compute dimension similarity between two values
 *
 * Runs via stdio transport. Register in mcp_config.json.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

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
  return engine;
}

// ── Server Setup ──

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

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${VERSION} running on stdio`);
  console.error(`[${SERVER_NAME}] Engine root: ${ENGINE_ROOT}`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal:`, err);
  process.exit(1);
});

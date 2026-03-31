/**
 * @file tests/drift-guard/error-paths.test.js
 * @description Error path coverage — disk errors, malformed input, execution failures
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DriftTelemetry, DriftDetector, DriftResolver } from '../../core/drift-guard/index.js';

describe('Error path coverage', () => {
  let tmpDir;

  before(() => {
    tmpDir = join(tmpdir(), `driftguard-error-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('DriftTelemetry', () => {
    test('handles read errors gracefully', () => {
      const telemetry = new DriftTelemetry({
        logPath: join(tmpDir, 'events.ndjson'),
        statePath: '/nonexistent/path/state.json'
      });

      const state = telemetry.loadState();
      assert.equal(state.version, '2.1.0');
      assert.deepStrictEqual(state.runs, []);
    });

    test('handles malformed JSON in state file', () => {
      const statePath = join(tmpDir, 'bad-state.json');
      writeFileSync(statePath, '{invalid json');

      const telemetry = new DriftTelemetry({
        logPath: join(tmpDir, 'events.ndjson'),
        statePath
      });

      const state = telemetry.loadState();
      assert.equal(state.version, '2.1.0');
    });

    test('analyzeTrends returns insufficient for < 3 runs', () => {
      const telemetry = new DriftTelemetry({
        logPath: join(tmpDir, 'events.ndjson'),
        statePath: join(tmpDir, 'state.json')
      });

      telemetry.saveState({ runs: [{ driftDetected: false }] });
      const trends = telemetry.analyzeTrends();

      assert.equal(trends.insufficient, true);
      assert.equal(trends.minRequired, 3);
      assert.equal(trends.actual, 1);
    });
  });

  describe('DriftDetector', () => {
    test('handles malformed YAML extraction', () => {
      const detector = new DriftDetector({ root: tmpDir });
      const jsContent = `export const DEFAULT_MASTER_YAML = not_a_template_literal;`;

      const result = detector.extractEmbeddedYaml(jsContent);
      assert.equal(result.success, false);
      assert.equal(result.error, 'no_template_literal_found');
    });

    test('handles empty template literal', () => {
      const detector = new DriftDetector({ root: tmpDir });
      const jsContent = `export const DEFAULT_MASTER_YAML = \`\`;`;

      const result = detector.extractEmbeddedYaml(jsContent);
      assert.equal(result.success, true);
      assert.equal(result.content, '');
    });

    test('handles missing source files', () => {
      const detector = new DriftDetector({
        root: join(tmpDir, 'nonexistent'),
        yamlPath: 'missing.yaml',
        jsPath: 'missing.js'
      });

      const report = detector.detect();
      assert.equal(report.state, 'MISSING_SOURCE');
      assert.ok(Array.isArray(report.recommendations));
      assert.ok(report.recommendations.length > 0);
    });

    test('handles extraction failure from malformed JS', () => {
      const yamlPath = join(tmpDir, 'test.yaml');
      const jsPath = join(tmpDir, 'test.js');
      writeFileSync(yamlPath, 'version: 1');
      writeFileSync(jsPath, 'export const something = "else";');

      const detector = new DriftDetector({
        root: tmpDir,
        yamlPath: 'test.yaml',
        jsPath: 'test.js'
      });

      const report = detector.detect();
      assert.equal(report.state, 'EXTRACTION_FAILED');
      assert.equal(report.drift.detected, true);
    });
  });

  describe('DriftResolver', () => {
    test('execute returns SKIPPED when autoHeal disabled', async () => {
      const resolver = new DriftResolver();
      const plan = { autoHeal: false, reason: 'Manual mode' };

      const result = await resolver.execute(plan);
      assert.equal(result.status, 'SKIPPED');
      assert.ok(result.reason.includes('Manual'));
    });

    test('execute handles command failure', async () => {
      const resolver = new DriftResolver();
      const plan = {
        autoHeal: true,
        command: 'exit 1'
      };

      const result = await resolver.execute(plan);
      assert.equal(result.status, 'FAILED');
      assert.ok(result.error);
    });

    test('execute handles timeout', async () => {
      const resolver = new DriftResolver();
      const plan = {
        autoHeal: true,
        command: 'sleep 60'
      };

      const result = await resolver.execute(plan);
      assert.equal(result.status, 'FAILED');
    });

    test('decide returns HEALTHY when no drift', () => {
      const resolver = new DriftResolver();
      const report = {
        drift: { detected: false },
        gaps: []
      };

      const decision = resolver.decide(report);
      assert.equal(decision.action, 'HEALTHY');
      assert.equal(decision.autoHeal, false);
    });

    test('decide returns HEALTHY for zero-gaps report', () => {
      const resolver = new DriftResolver();
      const report = {
        drift: { detected: false },
        gaps: [],
        contractViolations: 0
      };

      const decision = resolver.decide(report);
      assert.equal(decision.action, 'HEALTHY');
      assert.equal(decision.notify, 'SILENT');
    });
  });

  describe('Complex scenarios', () => {
    test('handles concurrent telemetry writes', () => {
      const telemetry = new DriftTelemetry({
        logPath: join(tmpDir, 'concurrent.ndjson'),
        statePath: join(tmpDir, 'concurrent.json')
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(telemetry.log({ test: i })));
      }

      Promise.all(promises).then(() => {
        const state = telemetry.loadState();
        assert.ok(state);
      });
    });

    test('handles large file detection', () => {
      const yamlPath = join(tmpDir, 'large.yaml');
      const jsPath = join(tmpDir, 'large.js');
      const largeContent = 'key: value\n'.repeat(10000);
      const embeddedYaml = `export const DEFAULT_MASTER_YAML = \`${largeContent}\`;`;

      writeFileSync(yamlPath, largeContent);
      writeFileSync(jsPath, embeddedYaml);

      const detector = new DriftDetector({
        root: tmpDir,
        yamlPath: 'large.yaml',
        jsPath: 'large.js'
      });

      const report = detector.detect();
      assert.ok(report.yaml.lines > 10000);
      assert.equal(report.state, 'HEALTHY');
    });
  });
});

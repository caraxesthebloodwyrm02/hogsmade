/**
 * @file tests/drift-guard/integration.test.js
 * @description Integration tests — real filesystem, no mocks
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DriftGuard, createDriftGuard, DRIFT_POLICIES } from '../../core/drift-guard/index.js';

const YAML_CONTENT = `# glimpse master config
version: 1
domains:
  - name: test
    weight: 1.0
`;

const JS_CONTENT = `export const DEFAULT_MASTER_YAML = \`${YAML_CONTENT}\`;
`;

const MUTATED_YAML = `# glimpse master config
version: 2
domains:
  - name: test
    weight: 0.5
  - name: production
    weight: 1.0
extra_field: true
`;

describe('DriftGuard integration (real filesystem)', () => {
  let tmpDir;

  before(() => {
    tmpDir = join(tmpdir(), `driftguard-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detects HEALTHY when YAML and embedded match', async () => {
    writeFileSync(join(tmpDir, 'glimpse.master.yaml'), YAML_CONTENT);
    writeFileSync(join(tmpDir, 'default-master.js'), JS_CONTENT);

    const guard = createDriftGuard({
      root: tmpDir,
      logPath: join(tmpDir, '.glimpse/drift-guard/events.ndjson'),
      statePath: join(tmpDir, '.glimpse/drift-guard/state.json')
    });

    const result = await guard.guard();

    assert.equal(result.healthy, true);
    assert.equal(result.report.state, 'HEALTHY');
    assert.equal(result.report.drift.detected, false);
    assert.equal(result.decision.action, 'HEALTHY');
  });

  test('detects DRIFT when YAML is mutated', async () => {
    writeFileSync(join(tmpDir, 'glimpse.master.yaml'), MUTATED_YAML);

    const guard = createDriftGuard({
      root: tmpDir,
      logPath: join(tmpDir, '.glimpse/drift-guard/events.ndjson'),
      statePath: join(tmpDir, '.glimpse/drift-guard/state.json')
    });

    const result = await guard.guard();

    assert.equal(result.healthy, false);
    assert.equal(result.report.state, 'DRIFT_DETECTED');
    assert.equal(result.report.drift.detected, true);
    assert.notEqual(result.report.drift.severity, 'none');
  });

  test('telemetry persists state and log files', async () => {
    const logPath = join(tmpDir, '.glimpse/drift-guard/events.ndjson');
    const statePath = join(tmpDir, '.glimpse/drift-guard/state.json');

    assert.ok(existsSync(logPath), 'events.ndjson should exist');
    assert.ok(existsSync(statePath), 'state.json should exist');
  });

  test('ci strict mode throws on drift', async () => {
    const guard = createDriftGuard({
      root: tmpDir,
      logPath: join(tmpDir, '.glimpse/drift-guard/events.ndjson'),
      statePath: join(tmpDir, '.glimpse/drift-guard/state.json')
    });

    await assert.rejects(
      () => guard.ci(true),
      (err) => {
        assert.ok(err.message.includes('DRIFTGUARD_HALT'));
        return true;
      }
    );
  });

  test('health() returns false when drifted', () => {
    const guard = createDriftGuard({
      root: tmpDir,
      logPath: join(tmpDir, '.glimpse/drift-guard/events.ndjson'),
      statePath: join(tmpDir, '.glimpse/drift-guard/state.json')
    });

    assert.equal(guard.health(), false);
  });

  test('MISSING_SOURCE when files absent', async () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const guard = createDriftGuard({
      root: emptyDir,
      logPath: join(emptyDir, '.glimpse/drift-guard/events.ndjson'),
      statePath: join(emptyDir, '.glimpse/drift-guard/state.json')
    });

    const result = await guard.guard();
    assert.equal(result.report.state, 'MISSING_SOURCE');
  });
});

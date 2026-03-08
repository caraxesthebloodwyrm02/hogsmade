import test from 'node:test';
import assert from 'node:assert/strict';

import { createGateSnapshot } from '../src/hooks/useGateData.ts';

test('builds a deterministic gate snapshot with trace data embedded in the audit flow', () => {
  const snapshot = createGateSnapshot(Date.parse('2026-03-08T09:30:45.000Z'));

  assert.equal(snapshot.verifications.length, 3);
  assert.equal(snapshot.auditEvents.length, 4);
  assert.equal(snapshot.nonces[0].usedAt, '2026-03-08T08:30:45.000Z');
  assert.equal(snapshot.deployments[2].result, 'rollback');
  assert.match(snapshot.auditEvents[0].summary ?? '', /trace=gate-flow-20260308093045/);
  assert.match(snapshot.auditEvents[2].summary ?? '', /span=93045000/);
});

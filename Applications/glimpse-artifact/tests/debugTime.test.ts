import test from 'node:test';
import assert from 'node:assert/strict';

import { createDebugLogContext, formatDebugTimestamp, toUtcIsoString } from '../src/lib/debugTime.ts';

test('formats timestamps in UTC for storage and UTC+06 for debug output', () => {
  const iso = toUtcIsoString('2026-03-08T15:30:45+06:00');

  assert.equal(iso, '2026-03-08T09:30:45.000Z');
  assert.match(formatDebugTimestamp(iso), /08 Mar 2026, 15:30:45 UTC\+06:00/);
});

test('creates deterministic trace metadata for the failing flow', () => {
  const context = createDebugLogContext('gate-flow', '2026-03-08T09:30:45.000Z');

  assert.equal(context.timestampUtc, '2026-03-08T09:30:45.000Z');
  assert.equal(context.timestampLocal, '08 Mar 2026, 15:30:45 UTC+06:00');
  assert.match(context.traceId, /^gate-flow-20260308093045$/);
  assert.equal(context.spanId, '93045000');
});

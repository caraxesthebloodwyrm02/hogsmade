import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  BeatRailEntry,
  MomentumFrame,
  PromotionGateResult,
} from '../src/components/phase4/types';
import {
  BeatRailPanel,
  MomentumPanel,
  PromotionGatePanel,
} from '../src/views/EvolutionCycleView';

const beatRail: BeatRailEntry[] = [
  { beat: 'map', state: 'complete' },
  { beat: 'balance', state: 'complete' },
  { beat: 'tighten', state: 'current' },
  { beat: 'verify', state: 'pending' },
];

const momentum: MomentumFrame = {
  acceleration: 0.32,
  momentum: 0.71,
  sidewalkDrift: 0.28,
  endpointReadiness: 0.84,
  handoffCompletion: 0.66,
  integrationSuccessRate: 0.78,
  reversalRate: 0.11,
  staleWindowRatio: 0.08,
  openPriorityConditionCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function createGate(decision: PromotionGateResult['decision'], passed: boolean): PromotionGateResult {
  return {
    caseId: 'cycle-1',
    decision,
    passed,
    beat: 'verify',
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    reasons: passed ? [] : ['Promotion threshold failed.'],
    thresholds: {
      overallScore: 0.68,
      governanceScore: 0.62,
      integrationScore: 0.64,
      sidewalkDrift: 0.35,
    },
    metrics: {
      overallScore: 0.7,
      governanceScore: 0.65,
      integrationScore: 0.67,
      sidewalkDrift: passed ? 0.22 : 0.41,
      requiredEndpointCount: 2,
      completeEndpointCount: passed ? 2 : 1,
      openPriorityConditionCount: passed ? 0 : 1,
    },
  };
}

test('BeatRailPanel renders the current beat and pending verify state', () => {
  const html = renderToStaticMarkup(React.createElement(BeatRailPanel, { beatRail }));
  assert.match(html, /tighten/);
  assert.match(html, /current/);
  assert.match(html, /verify/);
  assert.match(html, /pending/);
});

test('MomentumPanel renders transport metrics and drift labels', () => {
  const html = renderToStaticMarkup(React.createElement(MomentumPanel, { momentum }));
  assert.match(html, /Acceleration/);
  assert.match(html, /Sidewalk drift/);
  assert.match(html, /Endpoint readiness/);
  assert.match(html, /Priority conditions/);
});

test('PromotionGatePanel renders blocked and promoted states', () => {
  const blocked = renderToStaticMarkup(
    React.createElement(PromotionGatePanel, { gate: createGate('hold_for_tighten', false) }),
  );
  const promoted = renderToStaticMarkup(
    React.createElement(PromotionGatePanel, { gate: createGate('allow_promotion', true) }),
  );

  assert.match(blocked, /hold_for_tighten/);
  assert.match(blocked, /Promotion threshold failed/);
  assert.match(promoted, /allow_promotion/);
  assert.match(promoted, /All promotion thresholds passed/);
});

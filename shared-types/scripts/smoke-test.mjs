#!/usr/bin/env node
/**
 * Smoke test for MCP guard system
 * Quick verification that all components load and basic operations work
 */

import { loadRuntimeConfig, validateRuntimeConfig } from '../dist/guard-config.js';
import { createLogger, createCorrelationId } from '../dist/guard-logger.js';
import {
  GuardCircuitBreaker,
  CircuitState,
  getCircuitBreaker,
  resetAllCircuitBreakers
} from '../dist/circuit-breaker.js';
import {
  guardedOperation,
  guardedAuditEmit,
  createGuardConfig,
  MITIGATION_SCOPES
} from '../dist/mcp-guard.js';

let exitCode = 0;

function success(test) {
  console.log(`✓ ${test}`);
}

function failure(test, error) {
  console.error(`✗ ${test}: ${error}`);
  exitCode = 1;
}

async function smokeTest() {
  console.log('🔍 MCP Guard Smoke Test\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: Config loading
  try {
    const config = loadRuntimeConfig('test-server');
    if (!config.enabled) throw new Error('Config should be enabled by default');
    if (!config.defaultScope) throw new Error('Config should have defaultScope');
    success('Runtime config loading');
  } catch (err) {
    failure('Runtime config loading', err.message);
  }

  // Test 2: Config validation
  try {
    const config = loadRuntimeConfig();
    const validation = validateRuntimeConfig(config);
    if (!validation.valid) throw new Error(validation.errors.join(', '));
    success('Config validation');
  } catch (err) {
    failure('Config validation', err.message);
  }

  // Test 3: Logger creation
  try {
    const logger = createLogger('test-server', 'STANDARD');
    if (!logger.debug || !logger.info || !logger.warn || !logger.error) {
      throw new Error('Logger missing required methods');
    }
    success('Logger creation');
  } catch (err) {
    failure('Logger creation', err.message);
  }

  // Test 4: Correlation ID generation
  try {
    const id1 = createCorrelationId();
    const id2 = createCorrelationId();
    if (!id1 || typeof id1 !== 'string') throw new Error('Invalid correlation ID');
    if (id1 === id2) throw new Error('Correlation IDs should be unique');
    success('Correlation ID generation');
  } catch (err) {
    failure('Correlation ID generation', err.message);
  }

  // Test 5: Circuit breaker creation
  try {
    const cb = new GuardCircuitBreaker('test');
    if (cb.getState() !== CircuitState.CLOSED) {
      throw new Error('Circuit breaker should start in CLOSED state');
    }
    success('Circuit breaker creation');
  } catch (err) {
    failure('Circuit breaker creation', err.message);
  }

  // Test 6: Circuit breaker execution (success)
  try {
    const cb = new GuardCircuitBreaker('test-success');
    const result = await cb.execute(() => Promise.resolve('test-data'));
    if (result !== 'test-data') throw new Error('Unexpected result');
    success('Circuit breaker success execution');
  } catch (err) {
    failure('Circuit breaker success execution', err.message);
  }

  // Test 7: Circuit breaker execution (failure)
  try {
    const cb = new GuardCircuitBreaker('test-fail', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenMaxCalls: 1
    });
    try {
      await cb.execute(() => Promise.reject(new Error('intentional')));
    } catch {
      // Expected
    }
    if (cb.getStats().failureCount !== 1) {
      throw new Error('Failure count should be 1');
    }
    success('Circuit breaker failure handling');
  } catch (err) {
    failure('Circuit breaker failure handling', err.message);
  }

  // Test 8: Global circuit breaker registry
  try {
    resetAllCircuitBreakers();
    const cb1 = getCircuitBreaker('shared');
    const cb2 = getCircuitBreaker('shared');
    if (cb1 !== cb2) throw new Error('Registry should return same instance');
    success('Circuit breaker registry');
  } catch (err) {
    failure('Circuit breaker registry', err.message);
  }

  // Test 9: Guarded operation success
  try {
    const logger = createLogger('test', 'STANDARD');
    const result = await guardedOperation(
      () => Promise.resolve('test-data'),
      { serverName: 'test', logger, maxRetries: 1 },
      'test-op'
    );
    if (!result.success) throw new Error('Operation should succeed');
    if (result.data !== 'test-data') throw new Error('Unexpected data');
    success('Guarded operation (success)');
  } catch (err) {
    failure('Guarded operation (success)', err.message);
  }

  // Test 10: Guarded operation failure
  try {
    const logger = createLogger('test', 'STANDARD');
    const result = await guardedOperation(
      () => Promise.reject(new Error('intentional')),
      { serverName: 'test', logger, maxRetries: 1 },
      'test-fail'
    );
    if (result.success) throw new Error('Operation should fail');
    if (!result.error) throw new Error('Should have error');
    success('Guarded operation (failure)');
  } catch (err) {
    failure('Guarded operation (failure)', err.message);
  }

  // Test 11: Guard config creation
  try {
    const logger = createLogger('test', 'STANDARD');
    const config = createGuardConfig('test', logger, 'SECURITY');
    if (!config.failClosedOnAudit) throw new Error('SECURITY scope should fail closed');
    if (!config.verifyWrites) throw new Error('SECURITY scope should verify writes');
    success('Guard config creation (SECURITY scope)');
  } catch (err) {
    failure('Guard config creation', err.message);
  }

  // Test 12: MITIGATION_SCOPES constants
  try {
    if (!MITIGATION_SCOPES.SECURITY) throw new Error('Missing SECURITY scope');
    if (!MITIGATION_SCOPES.AUDIT) throw new Error('Missing AUDIT scope');
    if (!MITIGATION_SCOPES.PERSISTENCE) throw new Error('Missing PERSISTENCE scope');
    if (!MITIGATION_SCOPES.STANDARD) throw new Error('Missing STANDARD scope');
    success('Mitigation scopes constants');
  } catch (err) {
    failure('Mitigation scopes constants', err.message);
  }

  // Test 13: Environment variable overrides
  try {
    process.env.GUARD_SCOPE = 'AUDIT';
    process.env.GUARD_VERBOSITY = '3';
    const config = loadRuntimeConfig();
    if (config.defaultScope !== 'AUDIT') throw new Error('Should use GUARD_SCOPE');
    if (config.verbosity !== 3) throw new Error('Should use GUARD_VERBOSITY');
    delete process.env.GUARD_SCOPE;
    delete process.env.GUARD_VERBOSITY;
    success('Environment variable overrides');
  } catch (err) {
    failure('Environment variable overrides', err.message);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (exitCode === 0) {
    console.log('✅ All smoke tests passed');
  } else {
    console.log('❌ Some smoke tests failed');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(exitCode);
}

smokeTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

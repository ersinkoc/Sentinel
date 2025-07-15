'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const {
  SentinelError,
  ConfigurationError,
  MonitoringError,
  DetectionError,
  AnalysisError,
  ProfilingError,
  ReportingError,
  ResourceError,
  StateError,
  SecurityError,
  PerformanceError,
  ErrorFactory,
  ErrorHandler,
  CircuitBreaker,
  RetryManager
} = require('../src/errors');

describe('Error Classes', () => {
  test('SentinelError base class', () => {
    const error = new SentinelError('Test error', 'TEST_CODE', { extra: 'data' });
    
    assert.strictEqual(error.message, 'Test error');
    assert.strictEqual(error.code, 'TEST_CODE');
    assert.deepStrictEqual(error.details, { extra: 'data' });
    assert.strictEqual(error.name, 'SentinelError');
    assert(error.timestamp);
    assert(error.stack);
    
    // Test toJSON
    const json = error.toJSON();
    assert.strictEqual(json.name, 'SentinelError');
    assert.strictEqual(json.message, 'Test error');
    assert.strictEqual(json.code, 'TEST_CODE');
    assert.deepStrictEqual(json.details, { extra: 'data' });
    assert(json.timestamp);
    assert(json.stack);
  });

  test('ConfigurationError', () => {
    const error = new ConfigurationError('Invalid config', ['field1', 'field2'], { reason: 'missing' });
    
    assert.strictEqual(error.message, 'Invalid config');
    assert.strictEqual(error.code, 'INVALID_CONFIG');
    assert.deepStrictEqual(error.invalidFields, ['field1', 'field2']);
    assert.deepStrictEqual(error.details.invalidFields, ['field1', 'field2']);
    assert.strictEqual(error.details.reason, 'missing');
    assert.strictEqual(error.name, 'ConfigurationError');
  });

  test('MonitoringError', () => {
    const error = new MonitoringError('Monitor failed', 'heap', { metric: 'usage' });
    
    assert.strictEqual(error.message, 'Monitor failed');
    assert.strictEqual(error.code, 'MONITORING_ERROR');
    assert.strictEqual(error.monitorType, 'heap');
    assert.strictEqual(error.details.monitorType, 'heap');
    assert.strictEqual(error.details.metric, 'usage');
    assert.strictEqual(error.name, 'MonitoringError');
  });

  test('DetectionError', () => {
    const error = new DetectionError('Detection failed', 'leak', { pattern: 'growth' });
    
    assert.strictEqual(error.message, 'Detection failed');
    assert.strictEqual(error.code, 'DETECTION_ERROR');
    assert.strictEqual(error.detectionType, 'leak');
    assert.strictEqual(error.name, 'DetectionError');
  });

  test('AnalysisError', () => {
    const error = new AnalysisError('Analysis failed', 'snapshot', { reason: 'timeout' });
    
    assert.strictEqual(error.message, 'Analysis failed');
    assert.strictEqual(error.code, 'ANALYSIS_ERROR');
    assert.strictEqual(error.analysisType, 'snapshot');
    assert.strictEqual(error.name, 'AnalysisError');
  });

  test('ProfilingError', () => {
    const error = new ProfilingError('Profiling failed', 'allocation', { duration: 1000 });
    
    assert.strictEqual(error.message, 'Profiling failed');
    assert.strictEqual(error.code, 'PROFILING_ERROR');
    assert.strictEqual(error.profilingType, 'allocation');
    assert.strictEqual(error.name, 'ProfilingError');
  });

  test('ReportingError', () => {
    const error = new ReportingError('Reporting failed', 'webhook', { url: 'http://example.com' });
    
    assert.strictEqual(error.message, 'Reporting failed');
    assert.strictEqual(error.code, 'REPORTING_ERROR');
    assert.strictEqual(error.reportingChannel, 'webhook');
    assert.strictEqual(error.name, 'ReportingError');
  });

  test('ResourceError', () => {
    const error = new ResourceError('Resource unavailable', 'file', '/path/to/file', { errno: -2 });
    
    assert.strictEqual(error.message, 'Resource unavailable');
    assert.strictEqual(error.code, 'RESOURCE_ERROR');
    assert.strictEqual(error.resourceType, 'file');
    assert.strictEqual(error.resourcePath, '/path/to/file');
    assert.strictEqual(error.details.errno, -2);
    assert.strictEqual(error.name, 'ResourceError');
  });

  test('StateError', () => {
    const error = new StateError('Invalid state', 'running', 'stopped', { transition: 'invalid' });
    
    assert.strictEqual(error.message, 'Invalid state');
    assert.strictEqual(error.code, 'STATE_ERROR');
    assert.strictEqual(error.currentState, 'running');
    assert.strictEqual(error.expectedState, 'stopped');
    assert.strictEqual(error.name, 'StateError');
  });

  test('SecurityError', () => {
    const error = new SecurityError('Security violation', 'permissions', { action: 'write' });
    
    assert.strictEqual(error.message, 'Security violation');
    assert.strictEqual(error.code, 'SECURITY_ERROR');
    assert.strictEqual(error.securityType, 'permissions');
    assert.strictEqual(error.name, 'SecurityError');
  });

  test('PerformanceError', () => {
    const error = new PerformanceError('Performance threshold exceeded', 'cpu', 80, 95, { unit: 'percent' });
    
    assert.strictEqual(error.message, 'Performance threshold exceeded');
    assert.strictEqual(error.code, 'PERFORMANCE_ERROR');
    assert.strictEqual(error.metric, 'cpu');
    assert.strictEqual(error.threshold, 80);
    assert.strictEqual(error.actual, 95);
    assert.strictEqual(error.details.unit, 'percent');
    assert.strictEqual(error.name, 'PerformanceError');
  });
});

describe('ErrorFactory', () => {
  test('creates correct error types', () => {
    const configError = ErrorFactory.create('configuration', 'Config error', ['field']);
    assert(configError instanceof ConfigurationError);
    assert.strictEqual(configError.message, 'Config error');
    
    const monitorError = ErrorFactory.create('monitoring', 'Monitor error', 'heap');
    assert(monitorError instanceof MonitoringError);
    
    const detectionError = ErrorFactory.create('detection', 'Detection error', 'leak');
    assert(detectionError instanceof DetectionError);
    
    const analysisError = ErrorFactory.create('analysis', 'Analysis error', 'snapshot');
    assert(analysisError instanceof AnalysisError);
    
    const profilingError = ErrorFactory.create('profiling', 'Profiling error', 'allocation');
    assert(profilingError instanceof ProfilingError);
    
    const reportingError = ErrorFactory.create('reporting', 'Reporting error', 'console');
    assert(reportingError instanceof ReportingError);
    
    const resourceError = ErrorFactory.create('resource', 'Resource error', 'file', '/path');
    assert(resourceError instanceof ResourceError);
    
    const stateError = ErrorFactory.create('state', 'State error', 'active', 'inactive');
    assert(stateError instanceof StateError);
    
    const securityError = ErrorFactory.create('security', 'Security error', 'auth');
    assert(securityError instanceof SecurityError);
    
    const performanceError = ErrorFactory.create('performance', 'Performance error', 'memory', 100, 150);
    assert(performanceError instanceof PerformanceError);
  });

  test('falls back to SentinelError for unknown types', () => {
    const error = ErrorFactory.create('unknown', 'Unknown error');
    assert(error instanceof SentinelError);
    assert(!(error instanceof ConfigurationError));
  });

  test('wraps non-Sentinel errors', () => {
    const originalError = new Error('Original error');
    const wrapped = ErrorFactory.wrap(originalError, 'monitoring', { component: 'test' });
    
    assert(wrapped instanceof MonitoringError);
    assert.strictEqual(wrapped.message, 'monitoring: Original error');
    assert.strictEqual(wrapped.details.originalError, 'Original error');
    assert.strictEqual(wrapped.details.component, 'test');
  });

  test('returns Sentinel errors unchanged when wrapping', () => {
    const sentinelError = new ConfigurationError('Config error');
    const wrapped = ErrorFactory.wrap(sentinelError, 'monitoring');
    
    assert.strictEqual(wrapped, sentinelError);
  });
});

describe('ErrorHandler', () => {
  test('handles errors with default options', () => {
    const handler = new ErrorHandler();
    const error = new Error('Test error');
    
    // Capture console.error output
    const originalConsoleError = console.error;
    let loggedData = null;
    console.error = (prefix, data) => {
      if (prefix === '[Sentinel Error]') {
        loggedData = JSON.parse(data);
      }
    };
    
    const handled = handler.handle(error, { context: 'test' });
    
    // Restore console.error
    console.error = originalConsoleError;
    
    assert(handled instanceof SentinelError);
    assert.strictEqual(handled.message, 'unknown: Test error');
    assert(loggedData);
    assert.strictEqual(handler.errorHistory.length, 1);
  });

  test('handles critical errors', () => {
    const handler = new ErrorHandler({ throwOnCritical: true });
    const error = new SecurityError('Security breach');
    
    // Disable logging for this test
    handler.options.logErrors = false;
    
    assert.throws(() => {
      handler.handle(error);
    }, SecurityError);
  });

  test('respects logging option', () => {
    const handler = new ErrorHandler({ logErrors: false });
    const error = new Error('Test error');
    
    // Capture console.error output
    const originalConsoleError = console.error;
    let logged = false;
    console.error = () => { logged = true; };
    
    handler.handle(error);
    
    // Restore console.error
    console.error = originalConsoleError;
    
    assert.strictEqual(logged, false);
  });

  test('maintains error history with max size', () => {
    const handler = new ErrorHandler({ maxStackSize: 3, logErrors: false });
    
    // Add 5 errors
    for (let i = 0; i < 5; i++) {
      handler.handle(new Error(`Error ${i}`));
    }
    
    assert.strictEqual(handler.errorHistory.length, 3);
    assert.strictEqual(handler.errorHistory[0].error.message, 'unknown: Error 4');
    assert.strictEqual(handler.errorHistory[2].error.message, 'unknown: Error 2');
  });

  test('gets error statistics', () => {
    const handler = new ErrorHandler({ logErrors: false });
    
    handler.handle(new ConfigurationError('Config 1'));
    handler.handle(new ConfigurationError('Config 2'));
    handler.handle(new MonitoringError('Monitor 1'));
    
    const stats = handler.getErrorStats();
    assert.strictEqual(stats.ConfigurationError, 2);
    assert.strictEqual(stats.MonitoringError, 1);
  });

  test('clears error history', () => {
    const handler = new ErrorHandler({ logErrors: false });
    
    handler.handle(new Error('Test'));
    assert.strictEqual(handler.errorHistory.length, 1);
    
    handler.clearHistory();
    assert.strictEqual(handler.errorHistory.length, 0);
  });

  test('identifies critical errors correctly', () => {
    const handler = new ErrorHandler();
    
    const criticalError1 = new SentinelError('Test', 'HEAP_SNAPSHOT_FAILED');
    const criticalError2 = new SecurityError('Security issue');
    const criticalError3 = new ResourceError('Memory exhausted', 'memory');
    const nonCriticalError = new MonitoringError('Minor issue');
    
    assert.strictEqual(handler.isCritical(criticalError1), true);
    assert.strictEqual(handler.isCritical(criticalError2), true);
    assert.strictEqual(handler.isCritical(criticalError3), true);
    assert.strictEqual(handler.isCritical(nonCriticalError), false);
  });
});

describe('CircuitBreaker', () => {
  test('allows operations when closed', async () => {
    const breaker = new CircuitBreaker();
    
    const result = await breaker.execute(async () => 'success');
    assert.strictEqual(result, 'success');
    assert.strictEqual(breaker.state, 'CLOSED');
  });

  test('opens after failure threshold', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Failed');
        });
      } catch {
        // Expected
      }
    }
    
    assert.strictEqual(breaker.state, 'OPEN');
    assert(breaker.nextAttempt);
  });

  test('blocks operations when open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
    
    // Trigger open state
    try {
      await breaker.execute(async () => {
        throw new Error('Failed');
      });
    } catch {
      // Expected
    }
    
    // Should block
    await assert.rejects(
      async () => breaker.execute(async () => 'success'),
      StateError
    );
  });

  test('transitions to half-open after timeout', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100 });
    
    // Trigger open state
    try {
      await breaker.execute(async () => {
        throw new Error('Failed');
      });
    } catch {
      // Expected
    }
    
    assert.strictEqual(breaker.state, 'OPEN');
    
    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should transition to half-open and succeed
    const result = await breaker.execute(async () => 'success');
    assert.strictEqual(result, 'success');
    assert.strictEqual(breaker.state, 'CLOSED');
  });

  test('removes old failures outside monitor window', async () => {
    const breaker = new CircuitBreaker({ 
      failureThreshold: 5, 
      monitorWindow: 100 
    });
    
    // Add 2 failures
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Failed');
        });
      } catch {
        // Expected
      }
    }
    
    assert.strictEqual(breaker.failures.length, 2);
    
    // Wait for monitor window to pass
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Add another failure - old ones should be removed
    try {
      await breaker.execute(async () => {
        throw new Error('Failed');
      });
    } catch {
      // Expected
    }
    
    assert.strictEqual(breaker.failures.length, 1);
    assert.strictEqual(breaker.state, 'CLOSED'); // Still closed due to threshold
  });

  test('getState returns current state info', () => {
    const breaker = new CircuitBreaker();
    
    const state = breaker.getState();
    assert.strictEqual(state.state, 'CLOSED');
    assert.strictEqual(state.failures, 0);
    assert.strictEqual(state.lastFailure, null);
    assert.strictEqual(state.nextAttempt, null);
  });

  test('reset clears all state', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    
    // Trigger failure
    try {
      await breaker.execute(async () => {
        throw new Error('Failed');
      });
    } catch {
      // Expected
    }
    
    assert.strictEqual(breaker.state, 'OPEN');
    
    breaker.reset();
    
    assert.strictEqual(breaker.state, 'CLOSED');
    assert.strictEqual(breaker.failures.length, 0);
    assert.strictEqual(breaker.lastFailure, null);
    assert.strictEqual(breaker.nextAttempt, null);
  });
});

describe('RetryManager', () => {
  test('succeeds on first attempt', async () => {
    const manager = new RetryManager();
    let attempts = 0;
    
    const result = await manager.execute(async () => {
      attempts++;
      return 'success';
    });
    
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 1);
  });

  test('retries on failure', async () => {
    const manager = new RetryManager({ baseDelay: 10 });
    let attempts = 0;
    
    const result = await manager.execute(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('NETWORK_ERROR: Connection failed');
      }
      return 'success';
    });
    
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  test('respects max retries', async () => {
    const manager = new RetryManager({ maxRetries: 2, baseDelay: 10 });
    let attempts = 0;
    
    await assert.rejects(
      async () => manager.execute(async () => {
        attempts++;
        throw new Error('NETWORK_ERROR: Connection failed');
      }),
      /Connection failed/
    );
    
    assert.strictEqual(attempts, 3); // Initial + 2 retries
  });

  test('does not retry non-retryable errors', async () => {
    const manager = new RetryManager();
    let attempts = 0;
    
    await assert.rejects(
      async () => manager.execute(async () => {
        attempts++;
        throw new ConfigurationError('Invalid config');
      }),
      ConfigurationError
    );
    
    assert.strictEqual(attempts, 1);
  });

  test('identifies retryable errors', () => {
    const manager = new RetryManager();
    
    // Retryable Sentinel errors
    const networkError = new SentinelError('Network failed', 'NETWORK_ERROR');
    const timeoutError = new SentinelError('Timeout', 'TIMEOUT_ERROR');
    const tempError = new SentinelError('Temp unavailable', 'RESOURCE_TEMPORARILY_UNAVAILABLE');
    
    assert.strictEqual(manager.isRetryable(networkError), true);
    assert.strictEqual(manager.isRetryable(timeoutError), true);
    assert.strictEqual(manager.isRetryable(tempError), true);
    
    // Retryable by message pattern
    const connectionError = new Error('Connection refused');
    const networkPatternError = new Error('Network unreachable');
    const temporaryError = new Error('Resource temporarily unavailable');
    
    assert.strictEqual(manager.isRetryable(connectionError), true);
    assert.strictEqual(manager.isRetryable(networkPatternError), true);
    assert.strictEqual(manager.isRetryable(temporaryError), true);
    
    // Non-retryable
    const configError = new ConfigurationError('Invalid config');
    const genericError = new Error('Something went wrong');
    
    assert.strictEqual(manager.isRetryable(configError), false);
    assert.strictEqual(manager.isRetryable(genericError), false);
  });

  test('calculates exponential backoff correctly', () => {
    const manager = new RetryManager({
      baseDelay: 100,
      backoffFactor: 2,
      maxDelay: 1000
    });
    
    assert.strictEqual(manager.calculateDelay(0), 100);
    assert.strictEqual(manager.calculateDelay(1), 200);
    assert.strictEqual(manager.calculateDelay(2), 400);
    assert.strictEqual(manager.calculateDelay(3), 800);
    assert.strictEqual(manager.calculateDelay(4), 1000); // Capped at maxDelay
    assert.strictEqual(manager.calculateDelay(5), 1000); // Still capped
  });

  test('custom retryable errors', async () => {
    const manager = new RetryManager({
      retryableErrors: ['CUSTOM_ERROR'],
      baseDelay: 10
    });
    
    let attempts = 0;
    
    await assert.rejects(
      async () => manager.execute(async () => {
        attempts++;
        throw new SentinelError('Custom error', 'CUSTOM_ERROR');
      }),
      SentinelError
    );
    
    assert.strictEqual(attempts, 4); // Initial + 3 retries
  });

  test('sleep delays execution', async () => {
    const manager = new RetryManager();
    const start = Date.now();
    
    await manager.sleep(50);
    
    const elapsed = Date.now() - start;
    assert(elapsed >= 45); // Allow some margin
    assert(elapsed < 100); // But not too much
  });
});

module.exports = async function runErrorTests() {
  console.log('  ⚠️  Running error handling tests...');
};
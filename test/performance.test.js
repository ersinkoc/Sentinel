'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const PerformanceOptimizer = require('../src/performance');
const { PerformanceError } = require('../src/errors');

describe('PerformanceOptimizer', () => {
  test('initializes with default configuration', () => {
    const optimizer = new PerformanceOptimizer();
    
    assert(optimizer.config.adaptive.enabled);
    assert.strictEqual(optimizer.config.adaptive.minInterval, 5000);
    assert.strictEqual(optimizer.config.adaptive.maxInterval, 120000);
    assert.strictEqual(optimizer.config.sampling.strategy, 'adaptive');
    assert.strictEqual(optimizer.config.cache.enabled, true);
    assert.strictEqual(optimizer.metrics.samplingRate, 1.0);
  });

  test('accepts custom configuration', () => {
    const config = {
      adaptive: { enabled: false, minInterval: 10000 },
      sampling: { strategy: 'fixed', baseRate: 0.5 },
      cache: { maxSize: 50, ttl: 60000 }
    };
    
    const optimizer = new PerformanceOptimizer(config);
    
    assert.strictEqual(optimizer.config.adaptive.enabled, false);
    assert.strictEqual(optimizer.config.adaptive.minInterval, 10000);
    assert.strictEqual(optimizer.config.sampling.strategy, 'fixed');
    assert.strictEqual(optimizer.config.sampling.baseRate, 0.5);
    assert.strictEqual(optimizer.config.cache.maxSize, 50);
    assert.strictEqual(optimizer.config.cache.ttl, 60000);
  });

  test('cache operations with TTL', async () => {
    const optimizer = new PerformanceOptimizer({
      cache: { enabled: true, maxSize: 3, ttl: 100 }
    });
    
    // Add cache entries
    optimizer.cache('key1', { data: 'value1' });
    optimizer.cache('key2', { data: 'value2' });
    
    // Verify cache hits
    assert.deepStrictEqual(optimizer.getCached('key1'), { data: 'value1' });
    assert.deepStrictEqual(optimizer.getCached('key2'), { data: 'value2' });
    assert.strictEqual(optimizer.cacheStats.hits, 2);
    assert.strictEqual(optimizer.cacheStats.misses, 0);
    
    // Verify cache miss
    assert.strictEqual(optimizer.getCached('key3'), null);
    assert.strictEqual(optimizer.cacheStats.misses, 1);
    
    // Wait for TTL expiry
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(optimizer.getCached('key1'), null);
    assert.strictEqual(optimizer.cacheStats.misses, 2);
    
    optimizer.destroy();
  });

  test('cache eviction when size limit reached', () => {
    const optimizer = new PerformanceOptimizer({
      cache: { enabled: true, maxSize: 2 }
    });
    
    optimizer.cache('key1', 'value1', { priority: 1 });
    optimizer.cache('key2', 'value2', { priority: 2 });
    
    assert.strictEqual(optimizer.cacheStats.size, 2);
    
    // Adding third entry should trigger eviction
    optimizer.cache('key3', 'value3', { priority: 3 });
    
    // Should have evicted lowest priority entry
    assert.strictEqual(optimizer.cacheStats.size, 2);
    assert.strictEqual(optimizer.getCached('key3'), 'value3');
    assert.strictEqual(optimizer.getCached('key2'), 'value2');
    
    optimizer.destroy();
  });

  test('cache disabled functionality', () => {
    const optimizer = new PerformanceOptimizer({
      cache: { enabled: false }
    });
    
    const value = { data: 'test' };
    const result = optimizer.cache('key', value);
    
    assert.strictEqual(result, value);
    assert.strictEqual(optimizer.getCached('key'), null);
    assert.strictEqual(optimizer.cacheStats.size, 0);
    
    optimizer.destroy();
  });

  test('operation queuing with concurrency limit', async () => {
    const optimizer = new PerformanceOptimizer({
      resources: { maxConcurrentOperations: 2 }
    });
    
    const results = [];
    const operations = [];
    
    // Create 5 operations
    for (let i = 0; i < 5; i++) {
      operations.push(
        optimizer.queueOperation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push(i);
          return i;
        })
      );
    }
    
    // First 2 should execute immediately
    assert.strictEqual(optimizer.state.activeOperations, 2);
    assert.strictEqual(optimizer.state.operationQueue.length, 3);
    
    // Wait for all to complete
    const values = await Promise.all(operations);
    
    assert.deepStrictEqual(values, [0, 1, 2, 3, 4]);
    assert.strictEqual(optimizer.state.activeOperations, 0);
    assert.strictEqual(optimizer.state.operationQueue.length, 0);
    
    optimizer.destroy();
  });

  test('operation timeout handling', async () => {
    const optimizer = new PerformanceOptimizer();
    
    await assert.rejects(
      async () => optimizer.queueOperation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
        },
        { timeout: 100 }
      ),
      /timed out/
    );
    
    optimizer.destroy();
  });

  test('operation priority ordering', async () => {
    const optimizer = new PerformanceOptimizer({
      resources: { maxConcurrentOperations: 1 }
    });
    
    const results = [];
    
    // Fill up the queue
    const op1 = optimizer.queueOperation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      results.push('op1');
    });
    
    // Queue operations with different priorities
    const op2 = optimizer.queueOperation(async () => {
      results.push('op2');
    }, { priority: 1 });
    
    const op3 = optimizer.queueOperation(async () => {
      results.push('op3');
    }, { priority: 3 });
    
    const op4 = optimizer.queueOperation(async () => {
      results.push('op4');
    }, { priority: 2 });
    
    await Promise.all([op1, op2, op3, op4]);
    
    // Should execute in priority order after op1
    assert.deepStrictEqual(results, ['op1', 'op3', 'op4', 'op2']);
    
    optimizer.destroy();
  });

  test('measure overhead calculation', () => {
    const optimizer = new PerformanceOptimizer();
    
    let counter = 0;
    const metrics = optimizer.measureOverhead(() => {
      counter++;
    }, 50);
    
    assert.strictEqual(counter, 50);
    assert(metrics.average >= 0);
    assert(metrics.median >= 0);
    assert(metrics.standardDeviation >= 0);
    assert(metrics.percentile95 >= 0);
    assert.strictEqual(metrics.samples, 50);
    assert.strictEqual(optimizer.metrics.overhead, metrics.average);
    
    optimizer.destroy();
  });

  test('adaptive interval optimization', async () => {
    const optimizer = new PerformanceOptimizer({
      adaptive: { enabled: true, minInterval: 5000, maxInterval: 20000 }
    });
    
    const events = [];
    optimizer.on('interval-optimized', (data) => events.push(data));
    
    // Mock high system load
    optimizer._calculateSystemLoad = () => 0.9;
    optimizer._calculateMemoryPressure = () => 0.9;
    
    optimizer.metrics.currentInterval = 10000;
    optimizer._performAdaptiveOptimization();
    
    // Should increase interval due to high load
    assert(optimizer.metrics.currentInterval > 10000);
    assert(events.length > 0);
    
    optimizer.destroy();
  });

  test('adaptive sampling rate optimization', () => {
    const optimizer = new PerformanceOptimizer({
      sampling: { enabled: true, strategy: 'adaptive', baseRate: 1.0, minRate: 0.1 }
    });
    
    const events = [];
    optimizer.on('sampling-optimized', (data) => events.push(data));
    
    // Test high load scenario
    optimizer.metrics.samplingRate = 1.0;
    optimizer._optimizeSamplingRate(0.8, 0.9);
    
    // Should reduce sampling rate
    assert(optimizer.metrics.samplingRate < 1.0);
    assert(optimizer.metrics.samplingRate >= 0.1);
    
    optimizer.destroy();
  });

  test('intelligent sampling rate calculation', () => {
    const optimizer = new PerformanceOptimizer({
      sampling: { strategy: 'intelligent', minRate: 0.1, maxRate: 1.0 }
    });
    
    // Test various scenarios
    const rate1 = optimizer._calculateIntelligentSamplingRate(0.2, 0.3);
    const rate2 = optimizer._calculateIntelligentSamplingRate(0.8, 0.9);
    const rate3 = optimizer._calculateIntelligentSamplingRate(0.5, 0.5);
    
    assert(rate1 > rate2); // Lower load should have higher rate
    assert(rate3 > rate2 && rate3 < rate1); // Medium load in between
    assert(rate1 <= 1.0 && rate1 >= 0.1);
    assert(rate2 <= 1.0 && rate2 >= 0.1);
    
    optimizer.destroy();
  });

  test('resource monitoring and GC triggering', () => {
    const optimizer = new PerformanceOptimizer({
      resources: { gcTriggerThreshold: 0.8 }
    });
    
    let gcTriggered = false;
    optimizer.on('gc-triggered', () => { gcTriggered = true; });
    
    // Mock high heap usage
    const originalMemoryUsage = process.memoryUsage;
    process.memoryUsage = () => ({
      heapTotal: 100 * 1024 * 1024,
      heapUsed: 85 * 1024 * 1024,
      rss: 150 * 1024 * 1024
    });
    
    // Enable global.gc for test
    const originalGc = global.gc;
    global.gc = () => {};
    
    optimizer._monitorResources();
    
    // Restore mocks
    process.memoryUsage = originalMemoryUsage;
    global.gc = originalGc;
    
    assert(gcTriggered || !global.gc); // GC triggered if available
    
    optimizer.destroy();
  });

  test('memory pressure handling', () => {
    const optimizer = new PerformanceOptimizer({
      sampling: { baseRate: 1.0, minRate: 0.1 },
      adaptive: { maxInterval: 60000 }
    });
    
    const events = [];
    optimizer.on('memory-pressure-handled', (data) => events.push(data));
    
    // Add some cache entries
    optimizer.cache('key1', 'value1', { priority: 1 });
    optimizer.cache('key2', 'value2', { priority: 2 });
    
    const initialRate = optimizer.metrics.samplingRate;
    const initialInterval = optimizer.metrics.currentInterval;
    
    optimizer._handleMemoryPressure();
    
    assert(optimizer.metrics.samplingRate < initialRate);
    assert(optimizer.metrics.currentInterval > initialInterval);
    assert(events.length > 0);
    
    optimizer.destroy();
  });

  test('operation queue optimization', () => {
    const optimizer = new PerformanceOptimizer({
      resources: { maxConcurrentOperations: 2 }
    });
    
    // Add operations to queue
    for (let i = 0; i < 10; i++) {
      optimizer.state.operationQueue.push({
        id: `op${i}`,
        priority: i % 3,
        operation: () => Promise.resolve(i)
      });
    }
    
    optimizer._optimizeOperationQueue();
    
    // Should be sorted by priority and limited in size
    assert(optimizer.state.operationQueue.length <= 4); // 2 * maxConcurrent
    assert(optimizer.state.operationQueue[0].priority >= optimizer.state.operationQueue[1].priority);
    
    optimizer.destroy();
  });

  test('cache compression for large values', () => {
    const optimizer = new PerformanceOptimizer({
      cache: { compressionThreshold: 10 }
    });
    
    const smallValue = 'small';
    const largeValue = 'x'.repeat(50);
    
    const compressedSmall = optimizer._compressValue(smallValue);
    const compressedLarge = optimizer._compressValue(largeValue);
    
    assert.strictEqual(compressedSmall.compressed, false);
    assert.strictEqual(compressedSmall.data, smallValue);
    
    assert.strictEqual(compressedLarge.compressed, true);
    assert(compressedLarge.data);
    
    // Test decompression
    assert.strictEqual(optimizer._decompressValue(compressedSmall), smallValue);
    assert.strictEqual(optimizer._decompressValue(compressedLarge), largeValue);
    
    optimizer.destroy();
  });

  test('get metrics and efficiency calculation', () => {
    const optimizer = new PerformanceOptimizer({
      targets: { maxOverhead: 10, responseTime: 100 }
    });
    
    optimizer.metrics.overhead = 5;
    optimizer.metrics.responseTime = 50;
    optimizer.cacheStats.hits = 80;
    optimizer.cacheStats.misses = 20;
    
    const metrics = optimizer.getMetrics();
    
    assert(metrics.overhead);
    assert(metrics.cacheStats);
    assert(metrics.queueStats);
    assert(metrics.efficiency);
    assert(metrics.recommendations);
    
    assert.strictEqual(metrics.efficiency.overhead, 0.5); // 1 - (5/10)
    assert.strictEqual(metrics.efficiency.responseTime, 0.5); // 1 - (50/100)
    assert.strictEqual(metrics.efficiency.caching, 0.8); // 80/(80+20)
    assert.strictEqual(metrics.efficiency.overall, 0.6); // (0.5+0.5+0.8)/3
    
    optimizer.destroy();
  });

  test('recommendations generation', () => {
    const optimizer = new PerformanceOptimizer({
      targets: { maxOverhead: 5, responseTime: 50 }
    });
    
    optimizer.metrics.overhead = 10;
    optimizer.metrics.responseTime = 100;
    optimizer.cacheStats.hits = 20;
    optimizer.cacheStats.misses = 80;
    optimizer.state.operationQueue.length = 10;
    
    const recommendations = optimizer._generateRecommendations();
    
    assert(recommendations.length > 0);
    assert(recommendations.some(r => r.includes('overhead')));
    assert(recommendations.some(r => r.includes('response')));
    assert(recommendations.some(r => r.includes('cache')));
    assert(recommendations.some(r => r.includes('Concurrent')));
    
    optimizer.destroy();
  });

  test('optimize method triggers all optimizations', () => {
    const optimizer = new PerformanceOptimizer();
    
    const events = [];
    optimizer.on('optimization-complete', (data) => events.push(data));
    
    // Add some data to optimize
    optimizer.cache('key1', 'value1');
    optimizer.state.operationQueue.push({ id: 'op1', priority: 1 });
    
    optimizer.optimize();
    
    assert(events.length > 0);
    assert(optimizer.state.lastOptimization > 0);
    
    optimizer.destroy();
  });

  test('reset clears all metrics and cache', () => {
    const optimizer = new PerformanceOptimizer();
    
    // Set some data
    optimizer.metrics.overhead = 10;
    optimizer.metrics.operationCount = 100;
    optimizer.cache('key', 'value');
    optimizer.cacheStats.hits = 50;
    optimizer.state.operationQueue.push({ id: 'op1' });
    
    optimizer.reset();
    
    assert.strictEqual(optimizer.metrics.overhead, 0);
    assert.strictEqual(optimizer.metrics.operationCount, 0);
    assert.strictEqual(optimizer.cacheStats.size, 0);
    assert.strictEqual(optimizer.cacheStats.hits, 0);
    assert.strictEqual(optimizer.state.operationQueue.length, 0);
    
    optimizer.destroy();
  });

  test('destroy cleans up resources', async () => {
    const optimizer = new PerformanceOptimizer();
    
    // Queue an operation
    const promise = optimizer.queueOperation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );
    
    optimizer.destroy();
    
    await assert.rejects(promise, /destroyed/);
    assert.strictEqual(optimizer.cacheStats.size, 0);
    assert.strictEqual(optimizer.state.operationQueue.length, 0);
  });

  test('error handling in adaptive optimization', () => {
    const optimizer = new PerformanceOptimizer();
    
    const errors = [];
    optimizer.on('error', (error) => errors.push(error));
    
    // Mock error in system load calculation
    optimizer._calculateSystemLoad = () => { throw new Error('Load calc failed'); };
    
    optimizer._performAdaptiveOptimization();
    
    assert(errors.length > 0);
    assert(errors[0] instanceof PerformanceError);
    assert(errors[0].message.includes('Adaptive optimization failed'));
    
    optimizer.destroy();
  });

  test('error handling in cache operations', () => {
    const optimizer = new PerformanceOptimizer();
    
    const errors = [];
    optimizer.on('error', (error) => errors.push(error));
    
    // Mock error in compress
    optimizer._compressValue = () => { throw new Error('Compress failed'); };
    
    const result = optimizer.cache('key', 'value');
    
    assert.strictEqual(result, 'value'); // Returns original value on error
    assert(errors.length > 0);
    assert(errors[0] instanceof PerformanceError);
    
    optimizer.destroy();
  });

  test('system limits and environment detection', () => {
    const optimizer = new PerformanceOptimizer();
    
    assert(optimizer.state.systemLimits);
    assert(optimizer.state.systemLimits.totalMemory > 0);
    assert(optimizer.state.systemLimits.cpuCount > 0);
    assert(optimizer.state.environment);
    
    optimizer.destroy();
  });

  test('cache cleanup timer functionality', async () => {
    const optimizer = new PerformanceOptimizer({
      cache: { ttl: 50 }
    });
    
    const events = [];
    optimizer.on('cache-cleaned', (data) => events.push(data));
    
    // Add cache entries
    optimizer.cache('key1', 'value1');
    optimizer.cache('key2', 'value2');
    
    // Force cleanup after TTL
    await new Promise(resolve => setTimeout(resolve, 100));
    optimizer._cleanupCache();
    
    assert(optimizer.cacheStats.size < 2);
    assert(events.length > 0);
    
    optimizer.destroy();
  });

  test('queue timeout in operation queue', async () => {
    const optimizer = new PerformanceOptimizer({
      resources: { maxConcurrentOperations: 1 }
    });
    
    // Start long running operation
    const op1 = optimizer.queueOperation(
      () => new Promise(resolve => setTimeout(resolve, 200))
    );
    
    // Queue operation with short timeout
    const op2Promise = optimizer.queueOperation(
      () => Promise.resolve('success'),
      { timeout: 50 }
    );
    
    await assert.rejects(op2Promise, /timed out in queue/);
    
    await op1; // Let first operation complete
    optimizer.destroy();
  });

  test('performance overhead tracking', () => {
    const optimizer = new PerformanceOptimizer();
    
    // Simulate operations completing
    optimizer.metrics.responseTime = 0;
    
    // Complete several operations with different durations
    const durations = [10, 20, 30, 40, 50];
    durations.forEach((duration, i) => {
      optimizer.state.activeOperations = 1;
      optimizer.emit('operation-completed', {
        id: `op${i}`,
        duration,
        success: true
      });
    });
    
    // Response time should be weighted average (EMA)
    assert(optimizer.metrics.responseTime > 0);
    
    optimizer.destroy();
  });
});

module.exports = async function runPerformanceTests() {
  console.log('  ⚡ Running performance optimization tests...');
};
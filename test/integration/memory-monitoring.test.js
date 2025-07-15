'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { TestUtils, TestAssertions, PerformanceTestHelper } = require('../setup');
const Sentinel = require('../../index');

describe('Memory Monitoring Integration Tests', () => {
  let sentinel;

  test('should detect real memory leaks', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 500 },
      detection: { enabled: true, sensitivity: 'high' },
      reporting: { console: false, file: null }
    });

    await sentinel.start();

    // Create a controlled memory leak
    const leakArray = [];
    const createLeak = () => {
      for (let i = 0; i < 1000; i++) {
        leakArray.push(new Array(1000).fill(`leak-${i}`));
      }
    };

    // Monitor for leak detection
    const leakPromise = TestUtils.expectEvent(sentinel, 'leak', 10000);

    // Create gradual memory leak
    const leakInterval = setInterval(createLeak, 100);

    try {
      const leakEvent = await leakPromise;
      clearInterval(leakInterval);

      assert.ok(leakEvent, 'Leak event should be emitted');
      assert.ok(leakEvent.probability > 0.5, 'Leak probability should be significant');
      TestAssertions.isValidLeakDetection(leakEvent);
    } finally {
      clearInterval(leakInterval);
      await sentinel.stop();
    }
  });

  test('should monitor GC events accurately', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 200, gc: true },
      reporting: { console: false }
    });

    await sentinel.start();

    // Capture GC events
    const gcEvents = [];
    sentinel.on('gc', (event) => gcEvents.push(event));

    // Force memory allocation to trigger GC
    for (let i = 0; i < 100; i++) {
      // const largeArray = new Array(10000).fill(`data-${i}`);
      await TestUtils.delay(10);
    }

    // Force GC if available
    if (global.gc) global.gc();

    await TestUtils.delay(1000);

    assert.ok(gcEvents.length > 0, 'Should capture GC events');
    
    for (const event of gcEvents) {
      TestAssertions.isValidGCEvent(event);
    }

    await sentinel.stop();
  });

  test('should handle high-frequency monitoring', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 50 }, // Very frequent
      detection: { enabled: false },
      reporting: { console: false }
    });

    const metrics = [];
    sentinel.on('metrics', (metric) => metrics.push(metric));

    await sentinel.start();
    await TestUtils.delay(1000);
    await sentinel.stop();

    assert.ok(metrics.length >= 15, `Should collect many metrics (got ${metrics.length})`);
    
    // Verify metrics are valid
    for (const metric of metrics.slice(0, 5)) {
      TestAssertions.isValidMemoryUsage(metric);
    }
  });

  test('should adapt monitoring interval based on load', async () => {
    sentinel = new Sentinel({
      monitoring: { 
        enabled: true, 
        interval: 1000,
        adaptiveInterval: true,
        minInterval: 200,
        maxInterval: 2000
      },
      performance: { adaptive: true },
      reporting: { console: false }
    });

    await sentinel.start();

    // Create high load scenario
    const highLoad = async () => {
      for (let i = 0; i < 1000; i++) {
        new Array(1000).fill(i);
      }
    };

    // Monitor interval changes
    const intervals = [];
    // const originalInterval = sentinel.monitor.config.interval;
    
    // Simulate load and monitor
    for (let i = 0; i < 10; i++) {
      await highLoad();
      intervals.push(sentinel.monitor.config.interval);
      await TestUtils.delay(300);
    }

    await sentinel.stop();

    // Should have some interval variation
    const uniqueIntervals = [...new Set(intervals)];
    assert.ok(uniqueIntervals.length > 1, 'Monitoring interval should adapt to load');
  });

  test('should measure monitoring overhead accurately', async () => {
    // Benchmark without monitoring
    const baselineResult = await PerformanceTestHelper.benchmark(
      () => TestUtils.createMemoryLeak(100),
      50
    );

    // Benchmark with monitoring
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      reporting: { console: false }
    });

    await sentinel.start();

    const monitoredResult = await PerformanceTestHelper.benchmark(
      () => TestUtils.createMemoryLeak(100),
      50
    );

    await sentinel.stop();

    // Calculate overhead
    const timeOverhead = ((monitoredResult.avgTime - baselineResult.avgTime) / baselineResult.avgTime) * 100;
    const memoryOverhead = monitoredResult.avgMemory - baselineResult.avgMemory;

    console.log(`Monitoring overhead: ${timeOverhead.toFixed(2)}% time, ${(memoryOverhead / 1024).toFixed(2)} KB memory`);

    // Assert reasonable overhead
    assert.ok(timeOverhead < 10, `Time overhead should be <10% (got ${timeOverhead.toFixed(2)}%)`);
    assert.ok(memoryOverhead < 1024 * 1024, `Memory overhead should be <1MB (got ${memoryOverhead} bytes)`);
  });

  test('should handle concurrent monitoring operations', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      detection: { enabled: true },
      reporting: { console: false }
    });

    await sentinel.start();

    // Run concurrent operations
    const operations = [
      () => sentinel.getMetrics(),
      () => sentinel.getLeaks(),
      () => sentinel.getHealth(),
      () => sentinel.analyze(),
      () => TestUtils.createMemoryLeak(50)
    ];

    const results = await Promise.all(
      operations.map(op => PerformanceTestHelper.loadTest(op, 5, 2000))
    );

    await sentinel.stop();

    // All operations should complete successfully
    for (const result of results) {
      assert.ok(result.errorRate < 0.1, `Error rate should be <10% (got ${(result.errorRate * 100).toFixed(2)}%)`);
      assert.ok(result.totalRequests > 0, 'Should have completed requests');
    }
  });

  test('should maintain accuracy under memory pressure', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 200 },
      detection: { enabled: true, sensitivity: 'high' },
      reporting: { console: false }
    });

    await sentinel.start();

    const beforeMetrics = sentinel.getMetrics();
    
    // Create memory pressure
    const memoryHogs = [];
    for (let i = 0; i < 50; i++) {
      memoryHogs.push(new Array(100000).fill(`pressure-${i}`));
    }

    await TestUtils.delay(1000);

    const afterMetrics = sentinel.getMetrics();

    // Clean up memory
    memoryHogs.length = 0;
    if (global.gc) global.gc();

    await sentinel.stop();

    // Verify metrics reflect memory pressure
    assert.ok(afterMetrics.heapUsed > beforeMetrics.heapUsed, 'Should detect increased memory usage');
    assert.ok(afterMetrics.heapTotal >= afterMetrics.heapUsed, 'Heap total should be >= heap used');
    
    TestAssertions.isValidMemoryUsage(beforeMetrics);
    TestAssertions.isValidMemoryUsage(afterMetrics);
  });

  test('should recover from monitoring errors gracefully', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      errorHandling: { exitOnUnhandled: false },
      reporting: { console: false }
    });

    let errorCount = 0;
    sentinel.on('error', () => errorCount++);

    await sentinel.start();

    // Simulate monitoring error by corrupting internal state
    const originalCollect = sentinel.monitor._collectMetrics;
    let errorInjected = false;

    sentinel.monitor._collectMetrics = function() {
      if (!errorInjected) {
        errorInjected = true;
        throw new Error('Simulated monitoring error');
      }
      return originalCollect.call(this);
    };

    await TestUtils.delay(500);

    // Restore original function
    sentinel.monitor._collectMetrics = originalCollect;

    await TestUtils.delay(500);

    await sentinel.stop();

    // Should have recovered from error
    assert.ok(errorCount > 0, 'Should have captured monitoring error');
    assert.ok(sentinel.isRunning === false, 'Should have stopped cleanly');
  });
});
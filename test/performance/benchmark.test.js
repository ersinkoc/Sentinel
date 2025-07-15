'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { PerformanceTestHelper, TestUtils } = require('../setup');
const Sentinel = require('../../index');

describe('Performance Benchmark Tests', () => {
  let sentinel;

  test('should meet performance benchmarks for basic operations', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 1000 },
      reporting: { console: false }
    });

    await sentinel.start();

    // Benchmark basic operations
    const benchmarks = {
      getMetrics: await PerformanceTestHelper.benchmark(() => sentinel.getMetrics(), 1000),
      getLeaks: await PerformanceTestHelper.benchmark(() => sentinel.getLeaks(), 1000),
      getHealth: await PerformanceTestHelper.benchmark(() => sentinel.getHealth(), 1000)
    };

    await sentinel.stop();

    // Performance assertions
    assert.ok(benchmarks.getMetrics.avgTime < 1, `getMetrics should be <1ms (got ${benchmarks.getMetrics.avgTime.toFixed(3)}ms)`);
    assert.ok(benchmarks.getLeaks.avgTime < 2, `getLeaks should be <2ms (got ${benchmarks.getLeaks.avgTime.toFixed(3)}ms)`);
    assert.ok(benchmarks.getHealth.avgTime < 1, `getHealth should be <1ms (got ${benchmarks.getHealth.avgTime.toFixed(3)}ms)`);

    console.log('Performance benchmarks:');
    console.log(`  getMetrics: ${benchmarks.getMetrics.avgTime.toFixed(3)}ms avg`);
    console.log(`  getLeaks: ${benchmarks.getLeaks.avgTime.toFixed(3)}ms avg`);
    console.log(`  getHealth: ${benchmarks.getHealth.avgTime.toFixed(3)}ms avg`);
  });

  test('should handle high throughput scenarios', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      performance: { throttling: { enabled: false } },
      reporting: { console: false }
    });

    await sentinel.start();

    // High throughput test
    const results = await PerformanceTestHelper.loadTest(
      () => sentinel.getMetrics(),
      50, // 50 concurrent requests
      5000 // 5 seconds
    );

    await sentinel.stop();

    console.log('High throughput results:');
    console.log(`  Total requests: ${results.totalRequests}`);
    console.log(`  Requests/sec: ${results.requestsPerSecond.toFixed(2)}`);
    console.log(`  Error rate: ${(results.errorRate * 100).toFixed(2)}%`);
    console.log(`  Avg response time: ${results.avgResponseTime.toFixed(3)}ms`);

    // Performance assertions
    assert.ok(results.requestsPerSecond > 1000, `Should handle >1000 req/sec (got ${results.requestsPerSecond.toFixed(2)})`);
    assert.ok(results.errorRate < 0.01, `Error rate should be <1% (got ${(results.errorRate * 100).toFixed(2)}%)`);
    assert.ok(results.avgResponseTime < 10, `Avg response time should be <10ms (got ${results.avgResponseTime.toFixed(3)}ms)`);
  });

  test('should maintain performance under memory pressure', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 200 },
      reporting: { console: false }
    });

    await sentinel.start();

    // Baseline performance
    const baseline = await PerformanceTestHelper.benchmark(() => sentinel.getMetrics(), 100);

    // Create memory pressure
    const memoryHog = [];
    for (let i = 0; i < 1000; i++) {
      memoryHog.push(new Array(10000).fill(`pressure-${i}`));
    }

    // Performance under pressure
    const underPressure = await PerformanceTestHelper.benchmark(() => sentinel.getMetrics(), 100);

    // Cleanup
    memoryHog.length = 0;
    if (global.gc) global.gc();

    await sentinel.stop();

    const degradation = ((underPressure.avgTime - baseline.avgTime) / baseline.avgTime) * 100;

    console.log('Performance under memory pressure:');
    console.log(`  Baseline: ${baseline.avgTime.toFixed(3)}ms`);
    console.log(`  Under pressure: ${underPressure.avgTime.toFixed(3)}ms`);
    console.log(`  Degradation: ${degradation.toFixed(2)}%`);

    // Should maintain reasonable performance
    assert.ok(degradation < 50, `Performance degradation should be <50% (got ${degradation.toFixed(2)}%)`);
  });

  test('should scale monitoring frequency efficiently', async () => {
    const intervals = [100, 500, 1000, 5000];
    const results = {};

    for (const interval of intervals) {
      sentinel = new Sentinel({
        monitoring: { enabled: true, interval },
        reporting: { console: false }
      });

      await sentinel.start();

      // Measure overhead for each interval
      const result = await PerformanceTestHelper.benchmark(
        () => TestUtils.createMemoryLeak(10),
        200
      );

      results[interval] = result;

      await sentinel.stop();
    }

    console.log('Monitoring frequency scaling:');
    for (const [interval, result] of Object.entries(results)) {
      console.log(`  ${interval}ms interval: ${result.avgTime.toFixed(3)}ms avg, ${(result.avgMemory / 1024).toFixed(2)} KB`);
    }

    // Verify that shorter intervals don't cause excessive overhead
    const overhead100 = results[100].avgTime;
    const overhead5000 = results[5000].avgTime;
    const overheadRatio = overhead100 / overhead5000;

    assert.ok(overheadRatio < 2, `100ms interval should not be >2x slower than 5000ms (ratio: ${overheadRatio.toFixed(2)})`);
  });

  test('should optimize memory usage over time', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      performance: { 
        adaptive: true,
        caching: { enabled: true, ttl: 1000 }
      },
      reporting: { console: false }
    });

    await sentinel.start();

    const memorySnapshots = [];

    // Take memory snapshots over time
    for (let i = 0; i < 10; i++) {
      // Generate some activity
      for (let j = 0; j < 100; j++) {
        sentinel.getMetrics();
      }

      memorySnapshots.push(process.memoryUsage().heapUsed);
      await TestUtils.delay(200);
    }

    await sentinel.stop();

    // Analyze memory trend
    const firstHalf = memorySnapshots.slice(0, 5);
    const secondHalf = memorySnapshots.slice(5);

    const firstHalfAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

    const memoryGrowth = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

    console.log('Memory optimization over time:');
    console.log(`  First half avg: ${(firstHalfAvg / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Second half avg: ${(secondHalfAvg / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Growth rate: ${memoryGrowth.toFixed(2)}%`);

    // Memory should not grow excessively
    assert.ok(memoryGrowth < 20, `Memory growth should be <20% (got ${memoryGrowth.toFixed(2)}%)`);
  });

  test('should handle rapid start/stop cycles efficiently', async () => {
    const cycles = 20;
    const startTimes = [];
    const stopTimes = [];

    for (let i = 0; i < cycles; i++) {
      sentinel = new Sentinel({
        monitoring: { enabled: true, interval: 1000 },
        reporting: { console: false }
      });

      // Measure start time
      const startTime = process.hrtime.bigint();
      await sentinel.start();
      const startEnd = process.hrtime.bigint();
      startTimes.push(Number(startEnd - startTime) / 1000000);

      // Measure stop time
      const stopTime = process.hrtime.bigint();
      await sentinel.stop();
      const stopEnd = process.hrtime.bigint();
      stopTimes.push(Number(stopEnd - stopTime) / 1000000);
    }

    const avgStartTime = startTimes.reduce((a, b) => a + b) / startTimes.length;
    const avgStopTime = stopTimes.reduce((a, b) => a + b) / stopTimes.length;

    console.log('Start/stop cycle performance:');
    console.log(`  Average start time: ${avgStartTime.toFixed(3)}ms`);
    console.log(`  Average stop time: ${avgStopTime.toFixed(3)}ms`);

    // Should start and stop quickly
    assert.ok(avgStartTime < 10, `Average start time should be <10ms (got ${avgStartTime.toFixed(3)}ms)`);
    assert.ok(avgStopTime < 5, `Average stop time should be <5ms (got ${avgStopTime.toFixed(3)}ms)`);
  });

  test('should maintain consistent performance across multiple instances', async () => {
    const instanceCount = 5;
    const instances = [];
    const benchmarks = [];

    // Create multiple instances
    for (let i = 0; i < instanceCount; i++) {
      const instance = new Sentinel({
        monitoring: { enabled: true, interval: 500 },
        reporting: { console: false }
      });
      
      await instance.start();
      instances.push(instance);
    }

    // Benchmark each instance
    for (const instance of instances) {
      const benchmark = await PerformanceTestHelper.benchmark(
        () => instance.getMetrics(),
        100
      );
      benchmarks.push(benchmark);
    }

    // Clean up instances
    for (const instance of instances) {
      await instance.stop();
    }

    // Analyze consistency
    const avgTimes = benchmarks.map(b => b.avgTime);
    const minTime = Math.min(...avgTimes);
    const maxTime = Math.max(...avgTimes);
    const variance = ((maxTime - minTime) / minTime) * 100;

    console.log('Multi-instance performance consistency:');
    console.log(`  Times: ${avgTimes.map(t => t.toFixed(3)).join(', ')} ms`);
    console.log(`  Variance: ${variance.toFixed(2)}%`);

    // Performance should be consistent across instances
    assert.ok(variance < 30, `Performance variance should be <30% (got ${variance.toFixed(2)}%)`);
    assert.ok(maxTime < 2, `All instances should be <2ms (max: ${maxTime.toFixed(3)}ms)`);
  });
});
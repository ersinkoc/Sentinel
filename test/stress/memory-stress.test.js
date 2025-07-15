'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { TestUtils, TestAssertions, PerformanceTestHelper } = require('../setup');
const Sentinel = require('../../index');

describe('Memory Stress Tests', () => {
  let sentinel;

  test('should survive extreme memory allocation patterns', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      detection: { enabled: true, sensitivity: 'high' },
      threshold: { heap: 0.95 }, // Very high threshold for stress test
      reporting: { console: false }
    });

    await sentinel.start();

    const allocations = [];
    let allocationCount = 0;
    const maxAllocations = 1000;

    try {
      // Extreme allocation pattern
      while (allocationCount < maxAllocations && process.memoryUsage().heapUsed < 100 * 1024 * 1024) {
        // Random allocation sizes
        const size = Math.floor(Math.random() * 10000) + 1000;
        const allocation = new Array(size).fill(`stress-${allocationCount}`);
        allocations.push(allocation);
        
        allocationCount++;
        
        // Occasionally free some memory
        if (allocationCount % 100 === 0) {
          allocations.splice(0, 50); // Remove first 50 allocations
          
          // Force GC occasionally
          if (global.gc && allocationCount % 200 === 0) {
            global.gc();
          }
        }
        
        // Brief pause to let monitoring work
        if (allocationCount % 50 === 0) {
          await TestUtils.delay(10);
        }
      }

      // Sentinel should still be responsive
      const metrics = sentinel.getMetrics();
      const health = sentinel.getHealth();

      TestAssertions.isValidMemoryUsage(metrics);
      assert.ok(health, 'Health check should return data');
      assert.ok(sentinel.isRunning, 'Sentinel should still be running');

      console.log(`Survived ${allocationCount} extreme allocations`);

    } finally {
      // Cleanup
      allocations.length = 0;
      if (global.gc) global.gc();
      await sentinel.stop();
    }
  });

  test('should handle rapid memory growth and shrinkage', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 50 },
      detection: { enabled: true },
      reporting: { console: false }
    });

    await sentinel.start();

    const cycles = 10;
    const growthSize = 50000;
    
    for (let cycle = 0; cycle < cycles; cycle++) {
      // Growth phase
      const growthData = [];
      for (let i = 0; i < growthSize; i++) {
        growthData.push(new Array(100).fill(`growth-${cycle}-${i}`));
      }
      
      await TestUtils.delay(100);
      
      // Shrinkage phase
      growthData.length = 0;
      if (global.gc) global.gc();
      
      await TestUtils.delay(100);
      
      // Verify sentinel is still responsive
      const metrics = sentinel.getMetrics();
      TestAssertions.isValidMemoryUsage(metrics);
    }

    const finalHealth = sentinel.getHealth();
    assert.ok(finalHealth.status === 'healthy' || finalHealth.status === 'warning', 
      'Sentinel should be healthy or warning after stress test');

    await sentinel.stop();
  });

  test('should maintain accuracy during memory fragmentation', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      detection: { enabled: true },
      reporting: { console: false }
    });

    await sentinel.start();

    // Create fragmented memory pattern
    const fragments = [];
    const fragmentCount = 10000;

    // Allocate many small fragments
    for (let i = 0; i < fragmentCount; i++) {
      const size = Math.floor(Math.random() * 100) + 10;
      fragments.push(new Array(size).fill(`fragment-${i}`));
      
      // Randomly deallocate some fragments
      if (i % 100 === 0 && fragments.length > 50) {
        // Remove random fragments to create holes
        for (let j = 0; j < 25; j++) {
          const randomIndex = Math.floor(Math.random() * fragments.length);
          fragments.splice(randomIndex, 1);
        }
      }
    }

    // Let monitoring run for a while
    await TestUtils.delay(1000);

    // Verify monitoring accuracy
    const metrics = sentinel.getMetrics();
    const memUsage = process.memoryUsage();

    // Metrics should be reasonably close to actual memory usage
    const heapDiff = Math.abs(metrics.heapUsed - memUsage.heapUsed);
    const rssDiff = Math.abs(metrics.rss - memUsage.rss);

    assert.ok(heapDiff < memUsage.heapUsed * 0.1, 
      `Heap measurement should be within 10% (diff: ${heapDiff} bytes)`);
    assert.ok(rssDiff < memUsage.rss * 0.1, 
      `RSS measurement should be within 10% (diff: ${rssDiff} bytes)`);

    // Cleanup
    fragments.length = 0;
    if (global.gc) global.gc();
    await sentinel.stop();
  });

  test('should handle memory leak simulation', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 200 },
      detection: { 
        enabled: true, 
        sensitivity: 'high',
        thresholds: { confidence: 0.6 }
      },
      reporting: { console: false }
    });

    await sentinel.start();

    let leakDetected = false;
    sentinel.on('leak', () => {
      leakDetected = true;
    });

    // Simulate gradual memory leak
    const leakContainer = [];
    const leakInterval = setInterval(() => {
      // Add data that won't be cleaned up
      for (let i = 0; i < 1000; i++) {
        leakContainer.push({
          id: `leak-${Date.now()}-${i}`,
          data: new Array(100).fill(`leaked-data-${i}`),
          refs: [] // Circular references
        });
      }
      
      // Create some circular references
      const recent = leakContainer.slice(-100);
      recent.forEach((item, index) => {
        item.refs.push(recent[(index + 1) % recent.length]);
      });
      
    }, 100);

    // Wait for leak detection (with timeout)
    const timeout = 15000; // 15 seconds
    const startTime = Date.now();
    
    while (!leakDetected && (Date.now() - startTime) < timeout) {
      await TestUtils.delay(500);
    }

    clearInterval(leakInterval);

    // Verify leak was detected
    assert.ok(leakDetected, 'Memory leak should have been detected');

    const leaks = sentinel.getLeaks();
    assert.ok(leaks.length > 0, 'Should have recorded leak information');

    // Verify leak data
    const recentLeak = leaks[leaks.length - 1];
    TestAssertions.isValidLeakDetection(recentLeak);

    // Cleanup
    leakContainer.length = 0;
    if (global.gc) global.gc();
    await sentinel.stop();
  });

  test('should survive concurrent memory operations', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 100 },
      performance: { throttling: { enabled: false } },
      reporting: { console: false }
    });

    await sentinel.start();

    const concurrentOperations = 20;
    const operationDuration = 5000; // 5 seconds
    
    const workers = [];

    // Worker 1: Constant allocation/deallocation
    workers.push(async () => {
      const startTime = Date.now();
      const memory = [];
      
      while (Date.now() - startTime < operationDuration) {
        // Allocate
        for (let i = 0; i < 100; i++) {
          memory.push(new Array(1000).fill(`worker1-${i}`));
        }
        
        // Deallocate half
        memory.splice(0, 50);
        
        await TestUtils.delay(10);
      }
      
      memory.length = 0;
    });

    // Worker 2: Spike allocations
    workers.push(async () => {
      const startTime = Date.now();
      
      while (Date.now() - startTime < operationDuration) {
        const spike = [];
        
        // Create spike
        for (let i = 0; i < 5000; i++) {
          spike.push(new Array(200).fill(`spike-${i}`));
        }
        
        await TestUtils.delay(200);
        
        // Clear spike
        spike.length = 0;
        if (global.gc) global.gc();
        
        await TestUtils.delay(300);
      }
    });

    // Worker 3: Gradual growth
    workers.push(async () => {
      const startTime = Date.now();
      const growth = [];
      
      while (Date.now() - startTime < operationDuration) {
        growth.push(new Array(500).fill(`growth-${Date.now()}`));
        await TestUtils.delay(50);
      }
      
      growth.length = 0;
    });

    // Worker 4: Random patterns
    workers.push(async () => {
      const startTime = Date.now();
      const random = [];
      
      while (Date.now() - startTime < operationDuration) {
        const action = Math.random();
        
        if (action < 0.6) {
          // Allocate
          const size = Math.floor(Math.random() * 2000) + 100;
          random.push(new Array(size).fill(`random-${Date.now()}`));
        } else if (random.length > 0) {
          // Deallocate
          const count = Math.min(Math.floor(Math.random() * 100), random.length);
          random.splice(0, count);
        }
        
        await TestUtils.delay(Math.random() * 50);
      }
      
      random.length = 0;
    });

    // Run all workers concurrently
    await Promise.all(workers);

    // Verify sentinel survived and is responsive
    const finalMetrics = sentinel.getMetrics();
    const finalHealth = sentinel.getHealth();

    TestAssertions.isValidMemoryUsage(finalMetrics);
    assert.ok(finalHealth, 'Should return health data after stress test');
    assert.ok(sentinel.isRunning, 'Sentinel should still be running');

    await sentinel.stop();
  });

  test('should handle extremely high memory usage', async () => {
    sentinel = new Sentinel({
      monitoring: { enabled: true, interval: 200 },
      threshold: { heap: 0.98 }, // Very high threshold
      reporting: { console: false }
    });

    await sentinel.start();

    const allocations = [];
    const targetMemory = 50 * 1024 * 1024; // 50MB target
    let currentMemory = 0;

    try {
      // Allocate until we reach target or system limit
      while (currentMemory < targetMemory && process.memoryUsage().heapUsed < 200 * 1024 * 1024) {
        const chunk = new Array(10000).fill(`highmem-${allocations.length}`);
        allocations.push(chunk);
        currentMemory = process.memoryUsage().heapUsed;
        
        // Check sentinel responsiveness periodically
        if (allocations.length % 100 === 0) {
          const metrics = sentinel.getMetrics();
          TestAssertions.isValidMemoryUsage(metrics);
          await TestUtils.delay(10);
        }
      }

      console.log(`Reached ${(currentMemory / 1024 / 1024).toFixed(2)} MB memory usage`);

      // Verify sentinel is still functional at high memory usage
      const metrics = sentinel.getMetrics();
      const health = sentinel.getHealth();

      assert.ok(metrics.heapUsed > 30 * 1024 * 1024, 'Should be using significant memory');
      TestAssertions.isValidMemoryUsage(metrics);
      assert.ok(health, 'Should return health data at high memory usage');

    } finally {
      // Cleanup
      allocations.length = 0;
      if (global.gc) global.gc();
      await sentinel.stop();
    }
  });
});
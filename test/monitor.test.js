'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const Monitor = require('../src/monitor');

describe('Monitor', () => {
  let monitor;
  
  test('should create Monitor instance', () => {
    const config = { interval: 1000 };
    monitor = new Monitor(config);
    
    assert.ok(monitor instanceof Monitor);
    assert.strictEqual(monitor.config.interval, 1000);
    assert.ok(Array.isArray(monitor.metrics.heap));
    assert.ok(Array.isArray(monitor.metrics.gc));
  });
  
  test('should collect metrics', () => {
    monitor = new Monitor({ interval: 1000 });
    
    const metric = monitor.collect();
    
    assert.ok(typeof metric === 'object');
    assert.ok(typeof metric.timestamp === 'number');
    assert.ok(typeof metric.heap === 'object');
    assert.ok(typeof metric.cpu === 'object');
    assert.ok(typeof metric.memory === 'object');
    assert.ok(typeof metric.system === 'object');
    
    // Check heap properties
    assert.ok(typeof metric.heap.used === 'number');
    assert.ok(typeof metric.heap.total === 'number');
    assert.ok(typeof metric.heap.limit === 'number');
    assert.ok(Array.isArray(metric.heap.spaces));
    
    // Check CPU properties
    assert.ok(typeof metric.cpu.user === 'number');
    assert.ok(typeof metric.cpu.system === 'number');
    assert.ok(typeof metric.cpu.percent === 'number');
    
    // Check memory properties
    assert.ok(typeof metric.memory.rss === 'number');
    assert.ok(typeof metric.memory.heapTotal === 'number');
    assert.ok(typeof metric.memory.heapUsed === 'number');
    
    // Check system properties
    assert.ok(typeof metric.system.platform === 'string');
    assert.ok(typeof metric.system.totalMemory === 'number');
    assert.ok(typeof metric.system.freeMemory === 'number');
  });
  
  test('should emit metrics events', (t, done) => {
    monitor = new Monitor({ interval: 1000 });
    
    monitor.on('metrics', (metric) => {
      assert.ok(typeof metric === 'object');
      assert.ok(typeof metric.timestamp === 'number');
      done();
    });
    
    monitor.collect();
  });
  
  test('should start and stop monitoring', () => {
    monitor = new Monitor({ interval: 1000 });
    
    // Should not throw
    monitor.start();
    monitor.stop();
  });
  
  test('should get metrics history', () => {
    monitor = new Monitor({ interval: 1000 });
    
    // Collect some metrics
    monitor.collect();
    monitor.collect();
    
    const metrics = monitor.getMetrics();
    
    assert.ok(typeof metrics === 'object');
    assert.ok(Array.isArray(metrics.heap));
    assert.ok(Array.isArray(metrics.gc));
    assert.ok(metrics.heap.length <= 30); // Should keep last 30 samples
    
    if (metrics.summary) {
      assert.ok(typeof metrics.summary.avgHeapUsed === 'number');
      assert.ok(typeof metrics.summary.maxHeapUsed === 'number');
      assert.ok(typeof metrics.summary.uptime === 'number');
    }
  });
  
  test('should reset metrics', () => {
    monitor = new Monitor({ interval: 1000 });
    
    // Collect some metrics
    monitor.collect();
    monitor.collect();
    
    assert.ok(monitor.metrics.heap.length > 0);
    
    monitor.reset();
    
    assert.strictEqual(monitor.metrics.heap.length, 0);
    assert.strictEqual(monitor.metrics.gc.length, 0);
  });
  
  test('should configure monitor', () => {
    monitor = new Monitor({ interval: 1000 });
    
    const newConfig = { interval: 5000, debug: true };
    monitor.configure(newConfig);
    
    assert.strictEqual(monitor.config.interval, 5000);
    assert.strictEqual(monitor.config.debug, true);
  });
  
  test('should trim metrics to prevent memory growth', () => {
    monitor = new Monitor({ interval: 1000 });
    
    // Collect many metrics to test trimming
    for (let i = 0; i < 100; i++) {
      monitor.collect();
    }
    
    const metrics = monitor.getMetrics();
    assert.ok(metrics.heap.length <= 30); // Should be trimmed to 30
  });
  
  test('should handle heap spaces data', () => {
    monitor = new Monitor({ interval: 1000 });
    
    const metric = monitor.collect();
    
    assert.ok(Array.isArray(metric.heap.spaces));
    
    if (metric.heap.spaces.length > 0) {
      const space = metric.heap.spaces[0];
      assert.ok(typeof space.name === 'string');
      assert.ok(typeof space.size === 'number');
      assert.ok(typeof space.used === 'number');
    }
  });
  
  test('should calculate growth rate', () => {
    monitor = new Monitor({ interval: 1000 });
    
    // Test with sample values
    const values = [100, 110, 120, 130];
    const growthRate = monitor._calculateGrowthRate(values);
    
    assert.ok(typeof growthRate === 'number');
    assert.ok(growthRate > 0); // Should show positive growth
  });
  
  test('should handle GC type mapping', () => {
    monitor = new Monitor({ interval: 1000 });
    
    assert.strictEqual(monitor._getGCType(1), 'scavenge');
    assert.strictEqual(monitor._getGCType(2), 'mark-sweep-compact');
    assert.strictEqual(monitor._getGCType(999), 'unknown');
  });
  
  test('should calculate CPU percentage safely', () => {
    monitor = new Monitor({ interval: 1000 });
    
    const cpuUsage = { user: 1000, system: 500 };
    const percent = monitor._calculateCpuPercent(cpuUsage);
    
    assert.ok(typeof percent === 'number');
    assert.ok(percent >= 0);
    assert.ok(percent <= 100);
  });
  
  // Clean up
  test('cleanup', () => {
    if (monitor) {
      monitor.stop();
    }
  });
});

module.exports = () => {
  console.log('✓ Monitor tests');
};
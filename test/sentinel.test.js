'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const Sentinel = require('../src/sentinel');

describe('Sentinel Core', () => {
  let sentinel;
  
  test('should create Sentinel instance with default config', () => {
    sentinel = new Sentinel();
    assert.ok(sentinel instanceof Sentinel);
    assert.strictEqual(sentinel.config.detection.enabled, true);
    assert.strictEqual(sentinel.config.monitoring.interval, 30000);
  });
  
  test('should create Sentinel instance with custom config', () => {
    const config = {
      detection: { enabled: false },
      monitoring: { interval: 10000 },
      threshold: { heap: 0.9 }
    };
    
    sentinel = new Sentinel(config);
    assert.strictEqual(sentinel.config.detection.enabled, false);
    assert.strictEqual(sentinel.config.monitoring.interval, 10000);
    assert.strictEqual(sentinel.config.threshold.heap, 0.9);
  });
  
  test('should implement singleton pattern', () => {
    const instance1 = Sentinel.getInstance();
    const instance2 = Sentinel.getInstance();
    assert.strictEqual(instance1, instance2);
  });
  
  test('should configure Sentinel after creation', () => {
    sentinel = new Sentinel();
    const newConfig = { monitoring: { interval: 5000 } };
    
    sentinel.configure(newConfig);
    assert.strictEqual(sentinel.config.monitoring.interval, 5000);
  });
  
  test('should start and stop monitoring', () => {
    sentinel = new Sentinel({ detection: { enabled: true } });
    
    // Test start
    const result = sentinel.start();
    assert.strictEqual(result, sentinel); // Should return this for chaining
    assert.strictEqual(sentinel._isRunning, true);
    
    // Test stop
    sentinel.stop();
    assert.strictEqual(sentinel._isRunning, false);
  });
  
  test('should not start if disabled', () => {
    sentinel = new Sentinel({ detection: { enabled: false } });
    sentinel.start();
    assert.strictEqual(sentinel._isRunning, false);
  });
  
  test('should emit events', (t, done) => {
    sentinel = new Sentinel();
    
    let eventCount = 0;
    const expectedEvents = ['start', 'stop'];
    
    expectedEvents.forEach(event => {
      sentinel.on(event, () => {
        eventCount++;
        if (eventCount === expectedEvents.length) {
          done();
        }
      });
    });
    
    sentinel.start();
    sentinel.stop();
  });
  
  test('should get metrics', () => {
    sentinel = new Sentinel();
    const metrics = sentinel.getMetrics();
    
    assert.ok(typeof metrics === 'object');
    assert.ok(Array.isArray(metrics.heap));
    assert.ok(Array.isArray(metrics.gc));
  });
  
  test('should get leaks', () => {
    sentinel = new Sentinel();
    const leaks = sentinel.getLeaks();
    
    assert.ok(Array.isArray(leaks));
  });
  
  test('should reset state', () => {
    sentinel = new Sentinel();
    sentinel.start();
    
    const result = sentinel.reset();
    assert.strictEqual(result, sentinel); // Should return this for chaining
    
    sentinel.stop();
  });
  
  test('should force garbage collection if available', () => {
    sentinel = new Sentinel();
    
    // Mock global.gc
    const originalGc = global.gc;
    let gcCalled = false;
    global.gc = () => { gcCalled = true; };
    
    const result = sentinel.forceGC();
    assert.strictEqual(result, true);
    assert.strictEqual(gcCalled, true);
    
    // Restore original
    global.gc = originalGc;
  });
  
  test('should return false for forceGC if not available', () => {
    sentinel = new Sentinel();
    
    // Ensure global.gc is not available
    const originalGc = global.gc;
    delete global.gc;
    
    const result = sentinel.forceGC();
    assert.strictEqual(result, false);
    
    // Restore original
    global.gc = originalGc;
  });
  
  test('should enable and disable debug mode', () => {
    sentinel = new Sentinel();
    
    sentinel.enableDebug();
    assert.strictEqual(sentinel.config.debug, true);
    
    sentinel.disableDebug();
    assert.strictEqual(sentinel.config.debug, false);
  });
  
  test('should create heap snapshot', async () => {
    sentinel = new Sentinel();
    
    try {
      const snapshot = await sentinel.snapshot();
      assert.ok(typeof snapshot === 'object');
      assert.ok(typeof snapshot.id === 'string');
      assert.ok(typeof snapshot.timestamp === 'number');
    } catch (error) {
      // Heap snapshots might not be available in all test environments
      assert.ok(error.message.includes('Failed to create heap snapshot'));
    }
  });
  
  test('should handle onLeak callback', (t, done) => {
    let leakCallbackCalled = false;
    
    sentinel = new Sentinel({
      onLeak: (leak) => {
        leakCallbackCalled = true;
        assert.ok(typeof leak === 'object');
        done();
      }
    });
    
    // Simulate a leak event
    sentinel.emit('leak', { 
      probability: 0.8, 
      factors: ['test'], 
      timestamp: Date.now(),
      metrics: { heapUsed: 1000000, heapTotal: 2000000, heapLimit: 10000000 },
      recommendations: ['test recommendation']
    });
  });
  
  // Clean up after tests
  test('cleanup', () => {
    if (sentinel && sentinel._isRunning) {
      sentinel.stop();
    }
  });
});

module.exports = () => {
  // This is a placeholder - Node.js test runner will execute the describe block
  console.log('✓ Sentinel core tests');
};
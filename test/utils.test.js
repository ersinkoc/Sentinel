'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  validateConfig,
  mergeConfig,
  formatBytes,
  formatDuration,
  debounce,
  throttle,
  CircularBuffer,
  RateLimiter,
  parseSize,
  isPromise,
  sleep
} = require('../src/utils');

describe('Utils', () => {
  
  test('validateConfig should validate valid configuration', () => {
    const validConfig = {
      interval: 30000,
      threshold: { heap: 0.8, growth: 0.1 },
      detection: { sensitivity: 'medium' }
    };
    
    assert.doesNotThrow(() => validateConfig(validConfig));
  });
  
  test('validateConfig should throw for invalid configuration', () => {
    const invalidConfigs = [
      { interval: -1 },
      { interval: 'invalid' },
      { threshold: { heap: 2 } },
      { threshold: { heap: -1 } },
      { threshold: { growth: -1 } },
      { detection: { sensitivity: 'invalid' } }
    ];
    
    invalidConfigs.forEach(config => {
      assert.throws(() => validateConfig(config));
    });
  });
  
  test('mergeConfig should merge configurations correctly', () => {
    const defaultConfig = {
      detection: { enabled: true },
      monitoring: { interval: 30000 },
      threshold: { heap: 0.8, growth: 0.1 },
      nested: { a: 1, b: 2 }
    };
    
    const userConfig = {
      monitoring: { interval: 60000 },
      threshold: { heap: 0.9 },
      nested: { b: 3, c: 4 }
    };
    
    const merged = mergeConfig(defaultConfig, userConfig);
    
    assert.strictEqual(merged.detection.enabled, true);
    assert.strictEqual(merged.monitoring.interval, 60000);
    assert.strictEqual(merged.threshold.heap, 0.9);
    assert.strictEqual(merged.threshold.growth, 0.1);
    assert.strictEqual(merged.nested.a, 1);
    assert.strictEqual(merged.nested.b, 3);
    assert.strictEqual(merged.nested.c, 4);
  });
  
  test('formatBytes should format bytes correctly', () => {
    assert.strictEqual(formatBytes(0), '0.00 B');
    assert.strictEqual(formatBytes(1023), '1023.00 B');
    assert.strictEqual(formatBytes(1024), '1.00 KB');
    assert.strictEqual(formatBytes(1024 * 1024), '1.00 MB');
    assert.strictEqual(formatBytes(1024 * 1024 * 1024), '1.00 GB');
    assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 1024), '1.00 TB');
  });
  
  test('formatDuration should format durations correctly', () => {
    assert.strictEqual(formatDuration(500), '500ms');
    assert.strictEqual(formatDuration(1000), '1s');
    assert.strictEqual(formatDuration(60000), '1m 0s');
    assert.strictEqual(formatDuration(3661000), '1h 1m 1s');
  });
  
  test('debounce should debounce function calls', (t, done) => {
    let callCount = 0;
    const fn = () => callCount++;
    const debouncedFn = debounce(fn, 50);
    
    // Call multiple times quickly
    debouncedFn();
    debouncedFn();
    debouncedFn();
    
    // Should not have been called yet
    assert.strictEqual(callCount, 0);
    
    setTimeout(() => {
      // Should have been called once after delay
      assert.strictEqual(callCount, 1);
      done();
    }, 100);
  });
  
  test('throttle should throttle function calls', (t, done) => {
    let callCount = 0;
    const fn = () => callCount++;
    const throttledFn = throttle(fn, 100);
    
    // Call immediately
    throttledFn();
    assert.strictEqual(callCount, 1);
    
    // Call again immediately - should be throttled
    throttledFn();
    assert.strictEqual(callCount, 1);
    
    setTimeout(() => {
      // Should allow another call after throttle period
      throttledFn();
      assert.strictEqual(callCount, 2);
      done();
    }, 150);
  });
  
  test('CircularBuffer should work correctly', () => {
    const buffer = new CircularBuffer(3);
    
    assert.strictEqual(buffer.length, 0);
    
    buffer.push(1);
    buffer.push(2);
    assert.strictEqual(buffer.length, 2);
    assert.deepStrictEqual(buffer.toArray(), [1, 2]);
    
    buffer.push(3);
    buffer.push(4); // Should wrap around
    assert.strictEqual(buffer.length, 3);
    assert.deepStrictEqual(buffer.toArray(), [2, 3, 4]);
    
    buffer.clear();
    assert.strictEqual(buffer.length, 0);
    assert.deepStrictEqual(buffer.toArray(), []);
  });
  
  test('RateLimiter should limit requests correctly', () => {
    const limiter = new RateLimiter(2, 1000); // 2 requests per second
    
    assert.strictEqual(limiter.canMakeRequest(), true);
    assert.strictEqual(limiter.canMakeRequest(), true);
    assert.strictEqual(limiter.canMakeRequest(), false); // Third request should be denied
    
    limiter.reset();
    assert.strictEqual(limiter.canMakeRequest(), true);
  });
  
  test('parseSize should parse size strings correctly', () => {
    assert.strictEqual(parseSize('100'), 100);
    assert.strictEqual(parseSize('1KB'), 1024);
    assert.strictEqual(parseSize('1MB'), 1024 * 1024);
    assert.strictEqual(parseSize('1GB'), 1024 * 1024 * 1024);
    assert.strictEqual(parseSize('1.5MB'), 1.5 * 1024 * 1024);
    
    assert.throws(() => parseSize('invalid'));
  });
  
  test('isPromise should detect promises correctly', () => {
    assert.strictEqual(isPromise(Promise.resolve()), true);
    assert.strictEqual(isPromise(new Promise(() => {})), true);
    assert.strictEqual(isPromise({ then: () => {} }), true);
    assert.strictEqual(isPromise({}), false);
    assert.strictEqual(isPromise(null), false);
    assert.strictEqual(isPromise('string'), false);
  });
  
  test('sleep should return a promise that resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    const end = Date.now();
    
    assert.ok(end - start >= 45); // Allow for some timing variance
    assert.ok(end - start < 100); // But not too much
  });
  
  test('CircularBuffer should handle edge cases', () => {
    const buffer = new CircularBuffer(1);
    
    buffer.push('a');
    assert.deepStrictEqual(buffer.toArray(), ['a']);
    
    buffer.push('b');
    assert.deepStrictEqual(buffer.toArray(), ['b']);
    assert.strictEqual(buffer.length, 1);
  });
  
  test('debounce should work with context', (t, done) => {
    const obj = {
      value: 0,
      increment() { this.value++; }
    };
    
    const debouncedIncrement = debounce(obj.increment, 50);
    
    debouncedIncrement.call(obj);
    debouncedIncrement.call(obj);
    
    setTimeout(() => {
      assert.strictEqual(obj.value, 1);
      done();
    }, 100);
  });
  
  test('throttle should work with context', (t, done) => {
    const obj = {
      value: 0,
      increment() { this.value++; }
    };
    
    const throttledIncrement = throttle(obj.increment, 50);
    
    throttledIncrement.call(obj);
    assert.strictEqual(obj.value, 1);
    
    throttledIncrement.call(obj);
    assert.strictEqual(obj.value, 1); // Should be throttled
    
    setTimeout(() => {
      throttledIncrement.call(obj);
      assert.strictEqual(obj.value, 2);
      done();
    }, 100);
  });
  
  test('RateLimiter should clean up old requests', () => {
    const limiter = new RateLimiter(3, 50); // 3 requests per 50ms
    
    // Make requests
    assert.strictEqual(limiter.canMakeRequest(), true);
    assert.strictEqual(limiter.canMakeRequest(), true);
    assert.strictEqual(limiter.canMakeRequest(), true);
    assert.strictEqual(limiter.canMakeRequest(), false);
    
    // Wait for time window to pass
    setTimeout(() => {
      assert.strictEqual(limiter.canMakeRequest(), true);
    }, 100);
  });
  
  test('mergeConfig should handle arrays correctly', () => {
    const defaultConfig = {
      array: [1, 2, 3],
      other: 'default'
    };
    
    const userConfig = {
      array: [4, 5],
      other: 'user'
    };
    
    const merged = mergeConfig(defaultConfig, userConfig);
    
    assert.deepStrictEqual(merged.array, [4, 5]);
    assert.strictEqual(merged.other, 'user');
  });
});

module.exports = () => {
  console.log('✓ Utils tests');
};
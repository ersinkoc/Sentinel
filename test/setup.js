'use strict';

/**
 * Test Setup and Configuration
 * Global test environment setup, utilities, and helpers
 */

const { getConfigManager } = require('../lib/config-manager');
const { getLogger } = require('../lib/logger');
const { getErrorHandler } = require('../lib/error-handler');

// Global test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retries: 2,
  parallel: false,
  coverage: false,
  cleanup: true
};

// Test utilities
class TestUtils {
  static async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static mockFunction(fn) {
    const calls = [];
    const mockFn = (...args) => {
      calls.push(args);
      return fn ? fn(...args) : undefined;
    };
    mockFn.calls = calls;
    mockFn.callCount = () => calls.length;
    mockFn.lastCall = () => calls[calls.length - 1];
    mockFn.reset = () => calls.length = 0;
    return mockFn;
  }

  static createMemoryLeak(size = 1000) {
    const leak = [];
    for (let i = 0; i < size; i++) {
      leak.push(new Array(1000).fill(`leak-${i}`));
    }
    return leak;
  }

  static async measureMemory(fn) {
    const before = process.memoryUsage();
    await fn();
    const after = process.memoryUsage();
    
    return {
      heapUsed: after.heapUsed - before.heapUsed,
      heapTotal: after.heapTotal - before.heapTotal,
      rss: after.rss - before.rss,
      external: after.external - before.external
    };
  }

  static async measureTime(fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    
    return {
      result,
      duration: Number(end - start) / 1000000 // Convert to milliseconds
    };
  }

  static generateConfig(overrides = {}) {
    return {
      monitoring: { enabled: true, interval: 1000 },
      detection: { enabled: false },
      reporting: { console: false, file: null },
      ...overrides
    };
  }

  static async withTimeout(promise, timeout = 5000) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    );
    
    return Promise.race([promise, timeoutPromise]);
  }

  static async captureEvents(emitter, eventName, count = 1) {
    const events = [];
    
    return new Promise((resolve) => {
      const handler = (data) => {
        events.push(data);
        if (events.length >= count) {
          emitter.removeListener(eventName, handler);
          resolve(events);
        }
      };
      
      emitter.on(eventName, handler);
    });
  }

  static createTempFile(content = '', extension = '.tmp') {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const filename = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filepath = path.join(os.tmpdir(), filename);
    
    fs.writeFileSync(filepath, content);
    
    return {
      path: filepath,
      cleanup: () => {
        try {
          fs.unlinkSync(filepath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  }

  static async expectEvent(emitter, eventName, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        emitter.removeListener(eventName, handler);
        reject(new Error(`Event '${eventName}' not emitted within ${timeout}ms`));
      }, timeout);

      const handler = (data) => {
        clearTimeout(timer);
        emitter.removeListener(eventName, handler);
        resolve(data);
      };

      emitter.once(eventName, handler);
    });
  }

  static async expectNoEvent(emitter, eventName, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        emitter.removeListener(eventName, handler);
        resolve();
      }, timeout);

      const handler = (data) => {
        clearTimeout(timer);
        emitter.removeListener(eventName, handler);
        reject(new Error(`Unexpected event '${eventName}' emitted`));
      };

      emitter.once(eventName, handler);
    });
  }
}

// Test environment setup
class TestEnvironment {
  constructor() {
    this.configManager = null;
    this.logger = null;
    this.errorHandler = null;
    this.cleanupTasks = [];
  }

  async setup() {
    // Initialize test configuration
    this.configManager = getConfigManager({ environment: 'test' });
    await this.configManager.load();

    // Setup test logger (silent)
    this.logger = getLogger({
      level: 'error',
      console: false,
      file: null
    });

    // Setup test error handler (non-exiting)
    this.errorHandler = getErrorHandler({
      exitOnUnhandled: false,
      logErrors: false
    });

    // Suppress console output during tests
    this._suppressConsole();
  }

  async teardown() {
    // Run cleanup tasks
    for (const task of this.cleanupTasks.reverse()) {
      try {
        await task();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }

    // Restore console
    this._restoreConsole();

    // Close logger
    if (this.logger) {
      await this.logger.close();
    }

    // Clear require cache for fresh starts
    this._clearRequireCache();
  }

  addCleanupTask(task) {
    this.cleanupTasks.push(task);
  }

  _suppressConsole() {
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug
    };

    // Replace with no-op functions
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.info = () => {};
    console.debug = () => {};
  }

  _restoreConsole() {
    if (this.originalConsole) {
      Object.assign(console, this.originalConsole);
    }
  }

  _clearRequireCache() {
    // Clear cache for all Sentinel modules
    const sentinelModules = Object.keys(require.cache).filter(path => 
      path.includes('Sentinel') && !path.includes('node_modules')
    );

    for (const modulePath of sentinelModules) {
      delete require.cache[modulePath];
    }
  }
}

// Global test environment
const testEnv = new TestEnvironment();

// Test lifecycle hooks
global.before = async function() {
  await testEnv.setup();
};

global.after = async function() {
  await testEnv.teardown();
};

// Enhanced assertion functions
class TestAssertions {
  static isValidMemoryUsage(usage) {
    return usage && 
           typeof usage.heapUsed === 'number' &&
           typeof usage.heapTotal === 'number' &&
           typeof usage.rss === 'number' &&
           usage.heapUsed >= 0 &&
           usage.heapTotal >= usage.heapUsed;
  }

  static isValidTimestamp(timestamp) {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && 
           date.getTime() > Date.now() - 60000 && // Not older than 1 minute
           date.getTime() <= Date.now() + 1000;   // Not more than 1 second in future
  }

  static isValidGCEvent(event) {
    return event &&
           typeof event.type === 'string' &&
           typeof event.duration === 'number' &&
           typeof event.timestamp === 'string' &&
           event.duration >= 0 &&
           this.isValidTimestamp(event.timestamp);
  }

  static isValidLeakDetection(leak) {
    return leak &&
           typeof leak.probability === 'number' &&
           typeof leak.confidence === 'number' &&
           typeof leak.timestamp === 'string' &&
           leak.probability >= 0 && leak.probability <= 1 &&
           leak.confidence >= 0 && leak.confidence <= 1 &&
           this.isValidTimestamp(leak.timestamp);
  }

  static async assertMemoryIncrease(fn, minIncrease = 1000) {
    const before = process.memoryUsage().heapUsed;
    await fn();
    const after = process.memoryUsage().heapUsed;
    const increase = after - before;
    
    if (increase < minIncrease) {
      throw new Error(`Expected memory increase of at least ${minIncrease} bytes, got ${increase}`);
    }
    
    return increase;
  }

  static async assertNoMemoryLeak(fn, maxIncrease = 10000, iterations = 5) {
    // Force GC before test
    if (global.gc) global.gc();
    
    const before = process.memoryUsage().heapUsed;
    
    // Run function multiple times
    for (let i = 0; i < iterations; i++) {
      await fn();
      if (global.gc) global.gc();
    }
    
    const after = process.memoryUsage().heapUsed;
    const increase = after - before;
    
    if (increase > maxIncrease) {
      throw new Error(`Memory leak detected: ${increase} bytes increase after ${iterations} iterations`);
    }
    
    return increase;
  }

  static assertConfigValid(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }
    
    // Check required sections
    const requiredSections = ['monitoring', 'threshold', 'detection', 'reporting'];
    for (const section of requiredSections) {
      if (!config[section]) {
        throw new Error(`Config missing required section: ${section}`);
      }
    }
  }

  static assertEventEmitted(events, eventName) {
    const found = events.some(event => event.type === eventName || event.name === eventName);
    if (!found) {
      throw new Error(`Expected event '${eventName}' was not emitted`);
    }
  }
}

// Performance test helpers
class PerformanceTestHelper {
  static async benchmark(fn, iterations = 100) {
    const times = [];
    const memoryDeltas = [];
    
    for (let i = 0; i < iterations; i++) {
      const beforeMemory = process.memoryUsage().heapUsed;
      const start = process.hrtime.bigint();
      
      await fn();
      
      const end = process.hrtime.bigint();
      const afterMemory = process.memoryUsage().heapUsed;
      
      times.push(Number(end - start) / 1000000); // Convert to milliseconds
      memoryDeltas.push(afterMemory - beforeMemory);
    }
    
    return {
      avgTime: times.reduce((a, b) => a + b) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      avgMemory: memoryDeltas.reduce((a, b) => a + b) / memoryDeltas.length,
      iterations
    };
  }

  static async loadTest(fn, concurrent = 10, duration = 5000) {
    const startTime = Date.now();
    const results = [];
    const errors = [];
    
    const workers = [];
    
    for (let i = 0; i < concurrent; i++) {
      workers.push(this._loadTestWorker(fn, startTime, duration, results, errors));
    }
    
    await Promise.all(workers);
    
    return {
      totalRequests: results.length,
      totalErrors: errors.length,
      avgResponseTime: results.length > 0 ? results.reduce((a, b) => a + b) / results.length : 0,
      errorRate: errors.length / (results.length + errors.length),
      requestsPerSecond: (results.length + errors.length) / (duration / 1000)
    };
  }

  static async _loadTestWorker(fn, startTime, duration, results, errors) {
    while (Date.now() - startTime < duration) {
      try {
        const start = process.hrtime.bigint();
        await fn();
        const end = process.hrtime.bigint();
        results.push(Number(end - start) / 1000000);
      } catch (error) {
        errors.push(error);
      }
    }
  }
}

// Export utilities
module.exports = {
  TestUtils,
  TestEnvironment,
  TestAssertions,
  PerformanceTestHelper,
  TEST_CONFIG,
  testEnv
};
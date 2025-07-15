'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

// Import actual adapter modules for testing
const { ExpressAdapter, FrameworkDetector } = require('../packages/adapters');

// Mock framework detection and adapters
const MockFrameworkDetector = class {
  static detect() {
    return ['express', 'fastify'];
  }
  
  static createAdapter(framework, options = {}) {
    switch (framework) {
    case 'express':
      return new MockExpressAdapter(options);
    case 'fastify':
      return new MockFastifyAdapter(options);
    default:
      throw new Error(`Unsupported framework: ${framework}`);
    }
  }
  
  static autoDetectAndCreate(options = {}) {
    const frameworks = this.detect();
    if (frameworks.length === 0) return null;
    return this.createAdapter(frameworks[0], options);
  }
};

const MockExpressAdapter = class {
  constructor(options = {}) {
    this.options = {
      trackRoutes: true,
      trackMiddleware: true,
      excludePaths: ['/health', '/ping'],
      ...options
    };
    this.routeMetrics = new Map();
    this.middlewareMetrics = new Map();
  }
  
  middleware() {
    const self = this;
    return function sentinelMiddleware(req, res, next) {
      const startTime = Date.now();
      const route = `${req.method} ${req.path || req.url}`;
      
      if (self.options.excludePaths.includes(req.path || req.url)) {
        return next();
      }
      
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        self._updateRouteMetrics(route, {
          duration,
          statusCode: res.statusCode || 200,
          memoryDelta: { heapUsed: 1024 * 100 } // Mock 100KB
        });
        
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }
  
  wrapApp(app) {
    if (!app || typeof app.use !== 'function') {
      throw new Error('Invalid Express app provided');
    }
    app.use(this.middleware());
    return app;
  }
  
  _updateRouteMetrics(route, metrics) {
    if (!this.routeMetrics.has(route)) {
      this.routeMetrics.set(route, {
        requests: 0,
        totalDuration: 0,
        totalMemoryDelta: 0,
        errors: 0
      });
    }
    
    const routeData = this.routeMetrics.get(route);
    routeData.requests++;
    routeData.totalDuration += metrics.duration;
    routeData.totalMemoryDelta += metrics.memoryDelta.heapUsed;
    
    if (metrics.statusCode >= 400) {
      routeData.errors++;
    }
  }
  
  getRouteMetrics() {
    const routes = [];
    for (const [route, metrics] of this.routeMetrics) {
      routes.push({
        route,
        requests: metrics.requests,
        avgDuration: metrics.totalDuration / metrics.requests,
        avgMemoryDelta: metrics.totalMemoryDelta / metrics.requests,
        errorRate: (metrics.errors / metrics.requests) * 100
      });
    }
    return routes;
  }
  
  getMiddlewareMetrics() {
    return [];
  }
  
  reset() {
    this.routeMetrics.clear();
    this.middlewareMetrics.clear();
  }
};

const MockFastifyAdapter = class {
  constructor(options = {}) {
    this.options = {
      trackRoutes: true,
      trackHooks: true,
      excludePaths: ['/health', '/ping'],
      ...options
    };
    this.routeMetrics = new Map();
    this.hookMetrics = new Map();
  }
  
  plugin(fastify, options, done) {
    const self = this;
    
    fastify.addHook('onRequest', async function(request, _reply) {
      request.sentinelStart = {
        time: Date.now(),
        memory: { heapUsed: 1024 * 1024 }
      };
    });
    
    fastify.addHook('onSend', async function(request, reply, payload) {
      if (!request.sentinelStart) return payload;
      
      const route = `${request.method} ${request.routerPath || request.url}`;
      const duration = Date.now() - request.sentinelStart.time;
      
      if (!self.options.excludePaths.includes(request.url)) {
        self._updateRouteMetrics(route, {
          duration,
          statusCode: reply.statusCode,
          memoryDelta: { heapUsed: 1024 * 50 } // Mock 50KB
        });
      }
      
      return payload;
    });
    
    done();
  }
  
  wrapApp(fastify) {
    if (!fastify || typeof fastify.register !== 'function') {
      throw new Error('Invalid Fastify instance provided');
    }
    fastify.register(this.plugin.bind(this), this.options);
    return fastify;
  }
  
  _updateRouteMetrics(route, metrics) {
    if (!this.routeMetrics.has(route)) {
      this.routeMetrics.set(route, {
        requests: 0,
        totalDuration: 0,
        totalMemoryDelta: 0,
        errors: 0
      });
    }
    
    const routeData = this.routeMetrics.get(route);
    routeData.requests++;
    routeData.totalDuration += metrics.duration;
    routeData.totalMemoryDelta += metrics.memoryDelta.heapUsed;
    
    if (metrics.statusCode >= 400) {
      routeData.errors++;
    }
  }
  
  getRouteMetrics() {
    const routes = [];
    for (const [route, metrics] of this.routeMetrics) {
      routes.push({
        route,
        requests: metrics.requests,
        avgDuration: metrics.totalDuration / metrics.requests,
        avgMemoryDelta: metrics.totalMemoryDelta / metrics.requests,
        errorRate: (metrics.errors / metrics.requests) * 100
      });
    }
    return routes;
  }
  
  getHookMetrics() {
    return [];
  }
  
  reset() {
    this.routeMetrics.clear();
    this.hookMetrics.clear();
  }
};

describe('Framework Adapters', () => {
  
  // Test actual FrameworkDetector
  describe('Real FrameworkDetector', () => {
    test('should detect available frameworks', () => {
      const frameworks = FrameworkDetector.detect();
      assert.ok(Array.isArray(frameworks));
      // Express should be detected since we installed it
      assert.ok(frameworks.includes('express'));
    });
    
    test('should create Express adapter', () => {
      const adapter = FrameworkDetector.createAdapter('express');
      assert.ok(adapter instanceof ExpressAdapter);
    });
    
    test('should throw for unknown frameworks', () => {
      assert.throws(() => {
        FrameworkDetector.createAdapter('unknown-framework');
      }, /Unknown framework/);
    });
    
    test('should auto-detect and create adapter', () => {
      const adapter = FrameworkDetector.autoDetectAndCreate();
      assert.ok(adapter instanceof ExpressAdapter);
    });
  });

  // Test actual ExpressAdapter
  describe('Real ExpressAdapter', () => {
    test('should create adapter with default options', () => {
      const adapter = new ExpressAdapter();
      assert.ok(adapter);
      assert.strictEqual(adapter.options.autoStart, true);
      assert.strictEqual(adapter.options.trackRoutes, true);
    });
    
    test('should create adapter with custom options', () => {
      const adapter = new ExpressAdapter({
        trackRoutes: false,
        trackMiddleware: true
      });
      assert.strictEqual(adapter.options.trackRoutes, false);
      assert.strictEqual(adapter.options.trackMiddleware, true);
    });
    
    test('should provide middleware function', () => {
      const adapter = new ExpressAdapter();
      const middleware = adapter.middleware();
      assert.strictEqual(typeof middleware, 'function');
      assert.strictEqual(middleware.length, 3); // req, res, next
    });
    
    test('should wrap Express app', () => {
      const adapter = new ExpressAdapter();
      const mockApp = {
        use: function(middleware) {
          this._middleware = middleware;
        },
        listen: function(...args) {
          const callback = args[args.length - 1];
          if (typeof callback === 'function') {
            process.nextTick(callback);
          }
          return { close: () => {} };
        }
      };
      
      const wrappedApp = adapter.wrapApp(mockApp);
      assert.strictEqual(wrappedApp, mockApp);
      assert.strictEqual(typeof mockApp._middleware, 'function');
    });
    
    test('should throw error for invalid app', () => {
      const adapter = new ExpressAdapter();
      assert.throws(() => {
        adapter.wrapApp(null);
      }, /Invalid Express application/);
      
      assert.throws(() => {
        adapter.wrapApp({});
      }, /Invalid Express application/);
    });
    
    test('should track route metrics', () => {
      const adapter = new ExpressAdapter();
      
      // Simulate route metrics
      adapter._recordRouteMetric({
        route: '/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        memoryDelta: 1024,
        timestamp: Date.now()
      });
      
      const metrics = adapter.getRouteMetrics();
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].route, 'GET /test');
      assert.strictEqual(metrics[0].requests, 1);
    });
    
    test('should reset metrics', () => {
      const adapter = new ExpressAdapter();
      
      adapter._recordRouteMetric({
        route: '/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        memoryDelta: 1024,
        timestamp: Date.now()
      });
      
      assert.strictEqual(adapter.getRouteMetrics().length, 1);
      
      adapter.reset();
      assert.strictEqual(adapter.getRouteMetrics().length, 0);
    });
  });
  
  // Keep existing mock tests for compatibility
  test('FrameworkDetector should detect frameworks', () => {
    const frameworks = MockFrameworkDetector.detect();
    assert.ok(Array.isArray(frameworks));
    assert.ok(frameworks.includes('express'));
    assert.ok(frameworks.includes('fastify'));
  });
  
  test('FrameworkDetector should create adapters', () => {
    const expressAdapter = MockFrameworkDetector.createAdapter('express');
    assert.ok(expressAdapter instanceof MockExpressAdapter);
    
    const fastifyAdapter = MockFrameworkDetector.createAdapter('fastify');
    assert.ok(fastifyAdapter instanceof MockFastifyAdapter);
  });
  
  test('FrameworkDetector should throw for unsupported framework', () => {
    assert.throws(() => {
      MockFrameworkDetector.createAdapter('unsupported');
    }, /Unsupported framework/);
  });
  
  test('FrameworkDetector should auto-detect and create adapter', () => {
    const adapter = MockFrameworkDetector.autoDetectAndCreate();
    assert.ok(adapter instanceof MockExpressAdapter); // First detected framework
  });
  
  describe('Express Adapter', () => {
    let adapter;
    
    test('should create Express adapter with options', () => {
      const options = {
        trackRoutes: false,
        excludePaths: ['/custom']
      };
      
      adapter = new MockExpressAdapter(options);
      assert.strictEqual(adapter.options.trackRoutes, false);
      assert.ok(adapter.options.excludePaths.includes('/custom'));
    });
    
    test('should create middleware function', () => {
      adapter = new MockExpressAdapter();
      const middleware = adapter.middleware();
      
      assert.ok(typeof middleware === 'function');
      assert.strictEqual(middleware.length, 3); // req, res, next
    });
    
    test('should wrap Express app', () => {
      adapter = new MockExpressAdapter();
      
      const mockApp = {
        use: function(middleware) {
          this.middleware = middleware;
        }
      };
      
      const wrappedApp = adapter.wrapApp(mockApp);
      assert.strictEqual(wrappedApp, mockApp);
      assert.ok(typeof mockApp.middleware === 'function');
    });
    
    test('should throw error for invalid app', () => {
      adapter = new MockExpressAdapter();
      
      assert.throws(() => {
        adapter.wrapApp({});
      }, /Invalid Express app/);
    });
    
    test('should track route metrics', () => {
      adapter = new MockExpressAdapter();
      const middleware = adapter.middleware();
      
      // Mock request/response
      const req = { method: 'GET', path: '/test' };
      const res = {
        statusCode: 200,
        end: function() {}
      };
      
      // Simulate middleware execution
      middleware(req, res, () => {
        // Simulate response end
        res.end();
      });
      
      const metrics = adapter.getRouteMetrics();
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].route, 'GET /test');
      assert.strictEqual(metrics[0].requests, 1);
    });
    
    test('should exclude certain paths', () => {
      adapter = new MockExpressAdapter();
      const middleware = adapter.middleware();
      
      const req = { method: 'GET', path: '/health' };
      const res = { end: function() {} };
      
      middleware(req, res, () => {});
      res.end();
      
      const metrics = adapter.getRouteMetrics();
      assert.strictEqual(metrics.length, 0); // Should be excluded
    });
    
    test('should reset metrics', () => {
      adapter = new MockExpressAdapter();
      adapter._updateRouteMetrics('GET /test', {
        duration: 100,
        statusCode: 200,
        memoryDelta: { heapUsed: 1024 }
      });
      
      assert.strictEqual(adapter.getRouteMetrics().length, 1);
      
      adapter.reset();
      assert.strictEqual(adapter.getRouteMetrics().length, 0);
    });
  });
  
  describe('Fastify Adapter', () => {
    let adapter;
    
    test('should create Fastify adapter with options', () => {
      const options = {
        trackHooks: false,
        excludePaths: ['/custom']
      };
      
      adapter = new MockFastifyAdapter(options);
      assert.strictEqual(adapter.options.trackHooks, false);
      assert.ok(adapter.options.excludePaths.includes('/custom'));
    });
    
    test('should create plugin function', () => {
      adapter = new MockFastifyAdapter();
      
      assert.ok(typeof adapter.plugin === 'function');
      assert.strictEqual(adapter.plugin.length, 3); // fastify, options, done
    });
    
    test('should wrap Fastify app', () => {
      adapter = new MockFastifyAdapter();
      
      const mockFastify = {
        register: function(plugin, options) {
          this.plugin = plugin;
          this.pluginOptions = options;
        }
      };
      
      const wrappedFastify = adapter.wrapApp(mockFastify);
      assert.strictEqual(wrappedFastify, mockFastify);
      assert.ok(typeof mockFastify.plugin === 'function');
    });
    
    test('should throw error for invalid fastify instance', () => {
      adapter = new MockFastifyAdapter();
      
      assert.throws(() => {
        adapter.wrapApp({});
      }, /Invalid Fastify instance/);
    });
    
    test('should track route metrics via plugin', (t, done) => {
      adapter = new MockFastifyAdapter();
      
      const mockFastify = {
        hooks: [],
        addHook: function(name, fn) {
          this.hooks.push({ name, fn });
        }
      };
      
      adapter.plugin(mockFastify, {}, () => {
        // Plugin registered successfully
        assert.strictEqual(mockFastify.hooks.length, 2); // onRequest, onSend
        done();
      });
    });
    
    test('should get route metrics', () => {
      adapter = new MockFastifyAdapter();
      
      adapter._updateRouteMetrics('GET /test', {
        duration: 150,
        statusCode: 200,
        memoryDelta: { heapUsed: 2048 }
      });
      
      const metrics = adapter.getRouteMetrics();
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].route, 'GET /test');
      assert.strictEqual(metrics[0].requests, 1);
      assert.strictEqual(metrics[0].avgDuration, 150);
      assert.strictEqual(metrics[0].avgMemoryDelta, 2048);
    });
    
    test('should track errors in routes', () => {
      adapter = new MockFastifyAdapter();
      
      adapter._updateRouteMetrics('GET /error', {
        duration: 100,
        statusCode: 500,
        memoryDelta: { heapUsed: 1024 }
      });
      
      const metrics = adapter.getRouteMetrics();
      assert.strictEqual(metrics[0].errorRate, 100); // 100% error rate
    });
    
    test('should get hook metrics', () => {
      adapter = new MockFastifyAdapter();
      const metrics = adapter.getHookMetrics();
      
      assert.ok(Array.isArray(metrics));
    });
    
    test('should reset all metrics', () => {
      adapter = new MockFastifyAdapter();
      
      adapter._updateRouteMetrics('GET /test', {
        duration: 100,
        statusCode: 200,
        memoryDelta: { heapUsed: 1024 }
      });
      
      assert.strictEqual(adapter.getRouteMetrics().length, 1);
      
      adapter.reset();
      assert.strictEqual(adapter.getRouteMetrics().length, 0);
    });
  });
  
  test('should handle multiple route requests', () => {
    const adapter = new MockExpressAdapter();
    
    // Simulate multiple requests to the same route
    for (let i = 0; i < 3; i++) {
      adapter._updateRouteMetrics('GET /api/users', {
        duration: 100 + i * 10,
        statusCode: 200,
        memoryDelta: { heapUsed: 1024 * (i + 1) }
      });
    }
    
    const metrics = adapter.getRouteMetrics();
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].requests, 3);
    assert.strictEqual(metrics[0].avgDuration, 110); // (100 + 110 + 120) / 3
    assert.strictEqual(metrics[0].avgMemoryDelta, 2048); // (1024 + 2048 + 3072) / 3
  });
  
  test('should calculate error rates correctly', () => {
    const adapter = new MockExpressAdapter();
    
    // Add successful requests
    adapter._updateRouteMetrics('GET /api/data', {
      duration: 100,
      statusCode: 200,
      memoryDelta: { heapUsed: 1024 }
    });
    
    adapter._updateRouteMetrics('GET /api/data', {
      duration: 110,
      statusCode: 200,
      memoryDelta: { heapUsed: 1024 }
    });
    
    // Add error request
    adapter._updateRouteMetrics('GET /api/data', {
      duration: 200,
      statusCode: 500,
      memoryDelta: { heapUsed: 1024 }
    });
    
    const metrics = adapter.getRouteMetrics();
    assert.strictEqual(metrics[0].requests, 3);
    assert.strictEqual(Math.round(metrics[0].errorRate), 33); // 1/3 * 100 = 33%
  });
});

module.exports = () => {
  console.log('✓ Framework adapters tests');
};
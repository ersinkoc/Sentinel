'use strict';

const EventEmitter = require('events');

/**
 * Fastify Adapter for Sentinel Memory Monitoring
 * Provides middleware and hooks for Fastify applications
 */
class FastifyAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: config.enabled !== false,
      trackRoutes: config.trackRoutes !== false,
      trackHooks: config.trackHooks !== false,
      trackMemoryPerRequest: config.trackMemoryPerRequest !== false,
      excludeRoutes: config.excludeRoutes || [],
      maxRouteMetrics: config.maxRouteMetrics || 100,
      ...config
    };
    
    this.routeMetrics = new Map();
    this.hookMetrics = new Map();
    this.stats = {
      totalRequests: 0,
      totalMemoryDelta: 0,
      averageMemoryDelta: 0,
      maxMemoryDelta: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Register Fastify plugin
   * @param {Object} fastify - Fastify instance
   * @param {Object} options - Plugin options
   * @param {Function} done - Callback function
   */
  plugin(fastify, options, done) {
    const mergedConfig = { ...this.config, ...options };
    
    if (!mergedConfig.enabled) {
      return done();
    }
    
    // Add monitoring hooks
    this._addHooks(fastify, mergedConfig);
    
    // Add routes for metrics
    this._addMetricsRoutes(fastify);
    
    done();
  }
  
  /**
   * Wrap Fastify app with monitoring
   * @param {Object} fastify - Fastify instance
   * @returns {Object} Wrapped Fastify instance
   */
  wrapApp(fastify) {
    // Register as a plugin
    fastify.register((instance, opts, done) => {
      this.plugin(instance, this.config, done);
    });
    
    return fastify;
  }
  
  /**
   * Add monitoring hooks to Fastify
   * @private
   */
  _addHooks(fastify, config) {
    // Pre-handler hook to capture initial memory
    fastify.addHook('preHandler', async (request, _reply) => {
      if (!this._shouldTrackRoute(request.url)) {
        return;
      }
      
      request.sentinelStartTime = Date.now();
      
      if (config.trackMemoryPerRequest) {
        request.sentinelStartMemory = process.memoryUsage();
      }
    });
    
    // On-response hook to record metrics
    fastify.addHook('onResponse', async (request, reply) => {
      if (!this._shouldTrackRoute(request.url)) {
        return;
      }
      
      const endTime = Date.now();
      const duration = endTime - (request.sentinelStartTime || endTime);
      
      let memoryDelta = 0;
      if (config.trackMemoryPerRequest && request.sentinelStartMemory) {
        const endMemory = process.memoryUsage();
        memoryDelta = endMemory.heapUsed - request.sentinelStartMemory.heapUsed;
      }
      
      this._recordRouteMetric({
        method: request.method,
        route: this._extractRoute(request),
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        memoryDelta,
        timestamp: endTime
      });
    });
    
    // Error hook to track errors
    fastify.addHook('onError', async (request, reply, error) => {
      this._recordError({
        method: request.method,
        route: this._extractRoute(request),
        url: request.url,
        error: error.message,
        timestamp: Date.now()
      });
    });
    
    // Track hook performance if enabled
    if (config.trackHooks) {
      this._trackHookPerformance(fastify);
    }
  }
  
  /**
   * Track hook performance
   * @private
   */
  _trackHookPerformance(fastify) {
    const originalAddHook = fastify.addHook;
    
    fastify.addHook = (name, fn) => {
      const wrappedFn = async (...args) => {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        try {
          const result = await fn(...args);
          
          const duration = Date.now() - startTime;
          const endMemory = process.memoryUsage();
          const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
          
          this._recordHookMetric({
            hookName: name,
            duration,
            memoryDelta,
            success: true,
            timestamp: Date.now()
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          this._recordHookMetric({
            hookName: name,
            duration,
            memoryDelta: 0,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
          
          throw error;
        }
      };
      
      return originalAddHook.call(fastify, name, wrappedFn);
    };
  }
  
  /**
   * Add metrics routes
   * @private
   */
  _addMetricsRoutes(fastify) {
    // Route metrics endpoint
    fastify.get('/sentinel/metrics', async (_request, _reply) => {
      return {
        routes: this.getRouteMetrics(),
        hooks: this.getHookMetrics(),
        stats: this.getStats(),
        timestamp: Date.now()
      };
    });
    
    // Health check endpoint
    fastify.get('/sentinel/health', async (_request, _reply) => {
      return {
        status: 'healthy',
        uptime: Date.now() - this.stats.startTime,
        memory: process.memoryUsage(),
        timestamp: Date.now()
      };
    });
  }
  
  /**
   * Extract route pattern from request
   * @private
   */
  _extractRoute(request) {
    // Try to get route pattern from Fastify context
    if (request.routerPath) {
      return request.routerPath;
    }
    
    if (request.routeOptions && request.routeOptions.url) {
      return request.routeOptions.url;
    }
    
    // Fallback to URL pathname
    return request.url.split('?')[0];
  }
  
  /**
   * Check if route should be tracked
   * @private
   */
  _shouldTrackRoute(url) {
    if (!this.config.trackRoutes) {
      return false;
    }
    
    // Skip excluded routes
    for (const excludePattern of this.config.excludeRoutes) {
      if (typeof excludePattern === 'string' && url.includes(excludePattern)) {
        return false;
      }
      if (excludePattern instanceof RegExp && excludePattern.test(url)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Record route metric
   * @private
   */
  _recordRouteMetric(metric) {
    const routeKey = `${metric.method} ${metric.route}`;
    
    if (!this.routeMetrics.has(routeKey)) {
      this.routeMetrics.set(routeKey, {
        route: routeKey,
        method: metric.method,
        path: metric.route,
        requests: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        totalMemoryDelta: 0,
        avgMemoryDelta: 0,
        maxMemoryDelta: 0,
        errorCount: 0,
        errorRate: 0,
        lastAccess: null,
        statusCodes: new Map()
      });
    }
    
    const routeMetric = this.routeMetrics.get(routeKey);
    
    // Update route metrics
    routeMetric.requests++;
    routeMetric.totalDuration += metric.duration;
    routeMetric.avgDuration = routeMetric.totalDuration / routeMetric.requests;
    routeMetric.maxDuration = Math.max(routeMetric.maxDuration, metric.duration);
    routeMetric.minDuration = Math.min(routeMetric.minDuration, metric.duration);
    
    if (metric.memoryDelta) {
      routeMetric.totalMemoryDelta += metric.memoryDelta;
      routeMetric.avgMemoryDelta = routeMetric.totalMemoryDelta / routeMetric.requests;
      routeMetric.maxMemoryDelta = Math.max(routeMetric.maxMemoryDelta, metric.memoryDelta);
    }
    
    routeMetric.lastAccess = new Date(metric.timestamp).toISOString();
    
    // Track status codes
    const statusCode = metric.statusCode.toString();
    routeMetric.statusCodes.set(statusCode, (routeMetric.statusCodes.get(statusCode) || 0) + 1);
    
    // Update error rate
    if (metric.statusCode >= 400) {
      routeMetric.errorCount++;
    }
    routeMetric.errorRate = (routeMetric.errorCount / routeMetric.requests) * 100;
    
    // Update global stats
    this.stats.totalRequests++;
    this.stats.totalMemoryDelta += metric.memoryDelta || 0;
    this.stats.averageMemoryDelta = this.stats.totalMemoryDelta / this.stats.totalRequests;
    this.stats.maxMemoryDelta = Math.max(this.stats.maxMemoryDelta, metric.memoryDelta || 0);
    
    // Emit event
    this.emit('route-metric', metric);
    
    // Cleanup old metrics if necessary
    this._cleanupOldMetrics();
  }
  
  /**
   * Record hook metric
   * @private
   */
  _recordHookMetric(metric) {
    if (!this.hookMetrics.has(metric.hookName)) {
      this.hookMetrics.set(metric.hookName, {
        name: metric.hookName,
        calls: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        totalMemoryDelta: 0,
        avgMemoryDelta: 0,
        errorCount: 0,
        errorRate: 0,
        lastCall: null
      });
    }
    
    const hookMetric = this.hookMetrics.get(metric.hookName);
    
    hookMetric.calls++;
    hookMetric.totalDuration += metric.duration;
    hookMetric.avgDuration = hookMetric.totalDuration / hookMetric.calls;
    hookMetric.maxDuration = Math.max(hookMetric.maxDuration, metric.duration);
    
    if (metric.memoryDelta) {
      hookMetric.totalMemoryDelta += metric.memoryDelta;
      hookMetric.avgMemoryDelta = hookMetric.totalMemoryDelta / hookMetric.calls;
    }
    
    if (!metric.success) {
      hookMetric.errorCount++;
    }
    hookMetric.errorRate = (hookMetric.errorCount / hookMetric.calls) * 100;
    
    hookMetric.lastCall = new Date(metric.timestamp).toISOString();
    
    this.emit('hook-metric', metric);
  }
  
  /**
   * Record error
   * @private
   */
  _recordError(error) {
    this.emit('error-metric', error);
  }
  
  /**
   * Cleanup old metrics
   * @private
   */
  _cleanupOldMetrics() {
    if (this.routeMetrics.size > this.config.maxRouteMetrics) {
      // Remove least recently accessed routes
      const sortedRoutes = Array.from(this.routeMetrics.entries())
        .sort((a, b) => new Date(a[1].lastAccess) - new Date(b[1].lastAccess));
      
      const toRemove = sortedRoutes.slice(0, sortedRoutes.length - this.config.maxRouteMetrics);
      toRemove.forEach(([key]) => this.routeMetrics.delete(key));
    }
  }
  
  /**
   * Get route metrics
   * @returns {Array} Route metrics
   */
  getRouteMetrics() {
    return Array.from(this.routeMetrics.values()).map(metric => ({
      ...metric,
      statusCodes: Object.fromEntries(metric.statusCodes)
    }));
  }
  
  /**
   * Get hook metrics
   * @returns {Array} Hook metrics
   */
  getHookMetrics() {
    return Array.from(this.hookMetrics.values());
  }
  
  /**
   * Get adapter statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      routeCount: this.routeMetrics.size,
      hookCount: this.hookMetrics.size
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.routeMetrics.clear();
    this.hookMetrics.clear();
    this.stats = {
      totalRequests: 0,
      totalMemoryDelta: 0,
      averageMemoryDelta: 0,
      maxMemoryDelta: 0,
      startTime: Date.now()
    };
    
    this.emit('metrics-reset');
  }
}

module.exports = FastifyAdapter;
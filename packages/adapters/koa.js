'use strict';

const EventEmitter = require('events');

/**
 * Koa Adapter for Sentinel Memory Monitoring
 * Provides middleware for Koa applications
 */
class KoaAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: config.enabled !== false,
      trackRoutes: config.trackRoutes !== false,
      trackMemoryPerRequest: config.trackMemoryPerRequest !== false,
      excludeRoutes: config.excludeRoutes || [],
      maxRouteMetrics: config.maxRouteMetrics || 100,
      trackMiddleware: config.trackMiddleware !== false,
      ...config
    };
    
    this.routeMetrics = new Map();
    this.middlewareMetrics = new Map();
    this.stats = {
      totalRequests: 0,
      totalMemoryDelta: 0,
      averageMemoryDelta: 0,
      maxMemoryDelta: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Create Koa middleware
   * @returns {Function} Koa middleware function
   */
  middleware() {
    if (!this.config.enabled) {
      return async (ctx, next) => await next();
    }
    
    return async (ctx, next) => {
      if (!this._shouldTrackRoute(ctx.path)) {
        return await next();
      }
      
      const startTime = Date.now();
      let startMemory;
      
      if (this.config.trackMemoryPerRequest) {
        startMemory = process.memoryUsage();
      }
      
      // Store start data in context
      ctx.sentinel = {
        startTime,
        startMemory
      };
      
      try {
        await next();
        
        // Record successful request
        this._recordMetric(ctx, startTime, startMemory, null);
        
      } catch (error) {
        // Record error
        this._recordMetric(ctx, startTime, startMemory, error);
        throw error;
      }
    };
  }
  
  /**
   * Wrap Koa app with monitoring
   * @param {Object} app - Koa application instance
   * @returns {Object} Wrapped Koa app
   */
  wrapApp(app) {
    // Add monitoring middleware at the beginning
    app.use(this.middleware());
    
    // Add metrics routes
    this._addMetricsRoutes(app);
    
    // Wrap middleware if tracking is enabled
    if (this.config.trackMiddleware) {
      this._wrapMiddleware(app);
    }
    
    return app;
  }
  
  /**
   * Add metrics routes to Koa app
   * @private
   */
  _addMetricsRoutes(app) {
    // Simple router-like functionality for metrics endpoints
    app.use(async (ctx, next) => {
      if (ctx.path === '/sentinel/metrics' && ctx.method === 'GET') {
        ctx.body = {
          routes: this.getRouteMetrics(),
          middleware: this.getMiddlewareMetrics(),
          stats: this.getStats(),
          timestamp: Date.now()
        };
        ctx.type = 'application/json';
        return;
      }
      
      if (ctx.path === '/sentinel/health' && ctx.method === 'GET') {
        ctx.body = {
          status: 'healthy',
          uptime: Date.now() - this.stats.startTime,
          memory: process.memoryUsage(),
          timestamp: Date.now()
        };
        ctx.type = 'application/json';
        return;
      }
      
      await next();
    });
  }
  
  /**
   * Wrap middleware for performance tracking
   * @private
   */
  _wrapMiddleware(app) {
    const originalUse = app.use;
    
    app.use = (middleware) => {
      const middlewareName = middleware.name || 'anonymous';
      
      const wrappedMiddleware = async (ctx, next) => {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        try {
          const result = await middleware.call(this, ctx, next);
          
          const duration = Date.now() - startTime;
          const endMemory = process.memoryUsage();
          const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
          
          this._recordMiddlewareMetric({
            name: middlewareName,
            duration,
            memoryDelta,
            success: true,
            timestamp: Date.now()
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          this._recordMiddlewareMetric({
            name: middlewareName,
            duration,
            memoryDelta: 0,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
          
          throw error;
        }
      };
      
      // Preserve middleware name
      Object.defineProperty(wrappedMiddleware, 'name', {
        value: middlewareName,
        configurable: true
      });
      
      return originalUse.call(app, wrappedMiddleware);
    };
  }
  
  /**
   * Extract route from Koa context
   * @private
   */
  _extractRoute(ctx) {
    // Try to get route from router if available
    if (ctx._matchedRoute) {
      return ctx._matchedRoute;
    }
    
    if (ctx.routePath) {
      return ctx.routePath;
    }
    
    // Fallback to pathname
    return ctx.path;
  }
  
  /**
   * Check if route should be tracked
   * @private
   */
  _shouldTrackRoute(path) {
    if (!this.config.trackRoutes) {
      return false;
    }
    
    // Skip excluded routes
    for (const excludePattern of this.config.excludeRoutes) {
      if (typeof excludePattern === 'string' && path.includes(excludePattern)) {
        return false;
      }
      if (excludePattern instanceof RegExp && excludePattern.test(path)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Record request metric
   * @private
   */
  _recordMetric(ctx, startTime, startMemory, error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    let memoryDelta = 0;
    if (startMemory && this.config.trackMemoryPerRequest) {
      const endMemory = process.memoryUsage();
      memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    }
    
    const route = this._extractRoute(ctx);
    const routeKey = `${ctx.method} ${route}`;
    
    // Initialize route metric if not exists
    if (!this.routeMetrics.has(routeKey)) {
      this.routeMetrics.set(routeKey, {
        route: routeKey,
        method: ctx.method,
        path: route,
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
    
    // Update metrics
    routeMetric.requests++;
    routeMetric.totalDuration += duration;
    routeMetric.avgDuration = routeMetric.totalDuration / routeMetric.requests;
    routeMetric.maxDuration = Math.max(routeMetric.maxDuration, duration);
    routeMetric.minDuration = Math.min(routeMetric.minDuration, duration);
    
    if (memoryDelta) {
      routeMetric.totalMemoryDelta += memoryDelta;
      routeMetric.avgMemoryDelta = routeMetric.totalMemoryDelta / routeMetric.requests;
      routeMetric.maxMemoryDelta = Math.max(routeMetric.maxMemoryDelta, memoryDelta);
    }
    
    routeMetric.lastAccess = new Date(endTime).toISOString();
    
    // Track status codes
    const statusCode = ctx.status.toString();
    routeMetric.statusCodes.set(statusCode, (routeMetric.statusCodes.get(statusCode) || 0) + 1);
    
    // Update error metrics
    if (error || ctx.status >= 400) {
      routeMetric.errorCount++;
    }
    routeMetric.errorRate = (routeMetric.errorCount / routeMetric.requests) * 100;
    
    // Update global stats
    this.stats.totalRequests++;
    this.stats.totalMemoryDelta += memoryDelta;
    this.stats.averageMemoryDelta = this.stats.totalMemoryDelta / this.stats.totalRequests;
    this.stats.maxMemoryDelta = Math.max(this.stats.maxMemoryDelta, memoryDelta);
    
    // Emit event
    this.emit('route-metric', {
      method: ctx.method,
      route,
      path: ctx.path,
      statusCode: ctx.status,
      duration,
      memoryDelta,
      error: error ? error.message : null,
      timestamp: endTime
    });
    
    // Cleanup old metrics if necessary
    this._cleanupOldMetrics();
  }
  
  /**
   * Record middleware metric
   * @private
   */
  _recordMiddlewareMetric(metric) {
    if (!this.middlewareMetrics.has(metric.name)) {
      this.middlewareMetrics.set(metric.name, {
        name: metric.name,
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
    
    const middlewareMetric = this.middlewareMetrics.get(metric.name);
    
    middlewareMetric.calls++;
    middlewareMetric.totalDuration += metric.duration;
    middlewareMetric.avgDuration = middlewareMetric.totalDuration / middlewareMetric.calls;
    middlewareMetric.maxDuration = Math.max(middlewareMetric.maxDuration, metric.duration);
    
    if (metric.memoryDelta) {
      middlewareMetric.totalMemoryDelta += metric.memoryDelta;
      middlewareMetric.avgMemoryDelta = middlewareMetric.totalMemoryDelta / middlewareMetric.calls;
    }
    
    if (!metric.success) {
      middlewareMetric.errorCount++;
    }
    middlewareMetric.errorRate = (middlewareMetric.errorCount / middlewareMetric.calls) * 100;
    
    middlewareMetric.lastCall = new Date(metric.timestamp).toISOString();
    
    this.emit('middleware-metric', metric);
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
   * Get middleware metrics
   * @returns {Array} Middleware metrics
   */
  getMiddlewareMetrics() {
    return Array.from(this.middlewareMetrics.values());
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
      middlewareCount: this.middlewareMetrics.size
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.routeMetrics.clear();
    this.middlewareMetrics.clear();
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

module.exports = KoaAdapter;
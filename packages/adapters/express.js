'use strict';

/**
 * Express.js Adapter for Sentinel
 * Provides middleware and application wrapping for Express applications
 */

const Sentinel = require('../../index');

class ExpressAdapter {
  constructor(options = {}) {
    this.options = {
      autoStart: true,
      trackRoutes: true,
      trackMiddleware: false,
      ...options
    };
    
    this.sentinel = options.sentinel || Sentinel.getInstance();
    this.metrics = new Map();
    
    if (this.options.autoStart && !this.sentinel.isRunning) {
      this.sentinel.start();
    }
  }
  
  /**
   * Create Express middleware for memory monitoring
   * @returns {Function} Express middleware function
   */
  middleware() {
    return (req, res, next) => {
      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();
      
      // Track request start
      // const _requestId = `${req.method}:${req.path}:${Date.now()}`;
      
      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(...args) {
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        
        const duration = Number(endTime - startTime) / 1e6; // Convert to milliseconds
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
        
        // Record route metrics
        if (this.options.trackRoutes) {
          this._recordRouteMetric({
            route: req.route?.path || req.path,
            method: req.method,
            statusCode: res.statusCode,
            duration,
            memoryDelta,
            timestamp: Date.now()
          });
        }
        
        // Call original end
        originalEnd.apply(this, args);
      }.bind(this);
      
      next();
    };
  }
  
  /**
   * Wrap an Express application with monitoring
   * @param {object} app - Express application instance
   * @returns {object} Wrapped application
   */
  wrapApp(app) {
    if (!app || typeof app.use !== 'function') {
      throw new Error('Invalid Express application provided');
    }
    
    // Add monitoring middleware as early as possible
    app.use(this.middleware());
    
    // Override app.listen to add shutdown handlers
    const originalListen = app.listen;
    app.listen = function(...args) {
      const server = originalListen.apply(this, args);
      
      // Add graceful shutdown handling
      this._addShutdownHandlers(server);
      
      return server;
    }.bind(this);
    
    return app;
  }
  
  /**
   * Get route-specific metrics
   * @returns {Array} Array of route metrics
   */
  getRouteMetrics() {
    return Array.from(this.metrics.entries()).map(([route, data]) => ({
      route,
      requests: data.count,
      avgDuration: data.totalDuration / data.count,
      avgMemoryDelta: data.totalMemoryDelta / data.count,
      maxMemoryDelta: data.maxMemoryDelta,
      errorRate: data.errors / data.count,
      lastAccess: new Date(data.lastAccess).toISOString()
    }));
  }
  
  /**
   * Reset collected metrics
   */
  reset() {
    this.metrics.clear();
  }
  
  /**
   * Record metrics for a route
   * @private
   */
  _recordRouteMetric(metric) {
    const routeKey = `${metric.method} ${metric.route}`;
    
    if (!this.metrics.has(routeKey)) {
      this.metrics.set(routeKey, {
        count: 0,
        totalDuration: 0,
        totalMemoryDelta: 0,
        maxMemoryDelta: 0,
        errors: 0,
        lastAccess: 0
      });
    }
    
    const data = this.metrics.get(routeKey);
    data.count++;
    data.totalDuration += metric.duration;
    data.totalMemoryDelta += metric.memoryDelta;
    data.maxMemoryDelta = Math.max(data.maxMemoryDelta, metric.memoryDelta);
    data.lastAccess = metric.timestamp;
    
    if (metric.statusCode >= 400) {
      data.errors++;
    }
  }
  
  /**
   * Add graceful shutdown handlers
   * @private
   */
  _addShutdownHandlers(server) {
    const shutdown = () => {
      console.log('Shutting down Express server gracefully...');
      
      if (this.sentinel) {
        this.sentinel.stop();
      }
      
      server.close(() => {
        console.log('Express server closed');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.log('Force closing Express server');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

module.exports = ExpressAdapter;
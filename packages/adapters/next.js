'use strict';

const EventEmitter = require('events');

/**
 * Next.js Adapter for Sentinel Memory Monitoring
 * Provides middleware and SSR function wrapping for Next.js applications
 */
class NextAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: config.enabled !== false,
      trackPages: config.trackPages !== false,
      trackAPI: config.trackAPI !== false,
      trackSSR: config.trackSSR !== false,
      trackMemoryPerRequest: config.trackMemoryPerRequest !== false,
      excludeRoutes: config.excludeRoutes || ['/api/sentinel'],
      maxRouteMetrics: config.maxRouteMetrics || 100,
      ...config
    };
    
    this.pageMetrics = new Map();
    this.apiMetrics = new Map();
    this.ssrMetrics = new Map();
    this.stats = {
      totalRequests: 0,
      totalPages: 0,
      totalAPI: 0,
      totalSSR: 0,
      totalMemoryDelta: 0,
      averageMemoryDelta: 0,
      maxMemoryDelta: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Create Next.js middleware
   * @returns {Function} Next.js middleware function
   */
  middleware() {
    if (!this.config.enabled) {
      return (req, res, next) => next();
    }
    
    return (req, res, next) => {
      if (!this._shouldTrackRoute(req.url)) {
        return next();
      }
      
      const startTime = Date.now();
      let startMemory;
      
      if (this.config.trackMemoryPerRequest) {
        startMemory = process.memoryUsage();
      }
      
      // Store start data in request
      req.sentinel = {
        startTime,
        startMemory
      };
      
      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = (...args) => {
        this._recordRequestMetric(req, res, startTime, startMemory);
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }
  
  /**
   * Wrap Next.js app with monitoring
   * @param {Object} app - Next.js app instance
   * @returns {Object} Wrapped Next.js app
   */
  wrapApp(app) {
    // For Next.js, we typically work with the request handler
    const originalHandler = app.getRequestHandler();
    
    app.getRequestHandler = () => {
      return async (req, res) => {
        if (!this._shouldTrackRoute(req.url)) {
          return originalHandler(req, res);
        }
        
        const startTime = Date.now();
        let startMemory;
        
        if (this.config.trackMemoryPerRequest) {
          startMemory = process.memoryUsage();
        }
        
        try {
          await originalHandler(req, res);
          this._recordRequestMetric(req, res, startTime, startMemory);
        } catch (error) {
          this._recordRequestMetric(req, res, startTime, startMemory, error);
          throw error;
        }
      };
    };
    
    return app;
  }
  
  /**
   * Create Next.js plugin configuration
   * @returns {Function} Next.js config plugin
   */
  createPlugin() {
    return (nextConfig = {}) => {
      return {
        ...nextConfig,
        webpack: (config, options) => {
          // Add Sentinel webpack plugin if needed
          if (typeof nextConfig.webpack === 'function') {
            config = nextConfig.webpack(config, options);
          }
          
          return config;
        },
        
        // Add custom server setup
        experimental: {
          ...nextConfig.experimental,
          instrumentationHook: true
        }
      };
    };
  }
  
  /**
   * Wrap SSR functions (getServerSideProps, getStaticProps, etc.)
   * @param {Function} fn - The SSR function to wrap
   * @param {string} functionName - Name of the function
   * @param {string} pageName - Name of the page/component
   * @returns {Function} Wrapped function
   */
  wrapSSRFunction(fn, functionName, pageName) {
    if (!this.config.enabled || !this.config.trackSSR) {
      return fn;
    }
    
    return async (...args) => {
      const startTime = Date.now();
      const startMemory = this.config.trackMemoryPerRequest ? process.memoryUsage() : null;
      
      try {
        const result = await fn(...args);
        
        const duration = Date.now() - startTime;
        let memoryDelta = 0;
        
        if (startMemory) {
          const endMemory = process.memoryUsage();
          memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
        }
        
        this._recordSSRMetric({
          functionName,
          pageName,
          duration,
          memoryDelta,
          success: true,
          timestamp: Date.now()
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        this._recordSSRMetric({
          functionName,
          pageName,
          duration,
          memoryDelta: 0,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
        
        throw error;
      }
    };
  }
  
  /**
   * Record request metric
   * @private
   */
  _recordRequestMetric(req, res, startTime, startMemory, error = null) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    let memoryDelta = 0;
    if (startMemory && this.config.trackMemoryPerRequest) {
      const endMemory = process.memoryUsage();
      memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    }
    
    const isAPI = req.url.startsWith('/api/');
    const route = this._extractRoute(req.url);
    const routeKey = `${req.method} ${route}`;
    
    // Determine which metrics to update
    const metricsMap = isAPI ? this.apiMetrics : this.pageMetrics;
    const statsKey = isAPI ? 'totalAPI' : 'totalPages';
    
    // Initialize metric if not exists
    if (!metricsMap.has(routeKey)) {
      metricsMap.set(routeKey, {
        route: routeKey,
        method: req.method,
        path: route,
        type: isAPI ? 'api' : 'page',
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
    
    const metric = metricsMap.get(routeKey);
    
    // Update metrics
    metric.requests++;
    metric.totalDuration += duration;
    metric.avgDuration = metric.totalDuration / metric.requests;
    metric.maxDuration = Math.max(metric.maxDuration, duration);
    metric.minDuration = Math.min(metric.minDuration, duration);
    
    if (memoryDelta) {
      metric.totalMemoryDelta += memoryDelta;
      metric.avgMemoryDelta = metric.totalMemoryDelta / metric.requests;
      metric.maxMemoryDelta = Math.max(metric.maxMemoryDelta, memoryDelta);
    }
    
    metric.lastAccess = new Date(endTime).toISOString();
    
    // Track status codes
    const statusCode = res.statusCode.toString();
    metric.statusCodes.set(statusCode, (metric.statusCodes.get(statusCode) || 0) + 1);
    
    // Update error metrics
    if (error || res.statusCode >= 400) {
      metric.errorCount++;
    }
    metric.errorRate = (metric.errorCount / metric.requests) * 100;
    
    // Update global stats
    this.stats.totalRequests++;
    this.stats[statsKey]++;
    this.stats.totalMemoryDelta += memoryDelta;
    this.stats.averageMemoryDelta = this.stats.totalMemoryDelta / this.stats.totalRequests;
    this.stats.maxMemoryDelta = Math.max(this.stats.maxMemoryDelta, memoryDelta);
    
    // Emit event
    this.emit(isAPI ? 'api-metric' : 'page-metric', {
      method: req.method,
      route,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      memoryDelta,
      error: error ? error.message : null,
      timestamp: endTime
    });
    
    // Cleanup old metrics if necessary
    this._cleanupOldMetrics();
  }
  
  /**
   * Record SSR metric
   * @private
   */
  _recordSSRMetric(metric) {
    const key = `${metric.functionName}:${metric.pageName}`;
    
    if (!this.ssrMetrics.has(key)) {
      this.ssrMetrics.set(key, {
        function: metric.functionName,
        page: metric.pageName,
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
    
    const ssrMetric = this.ssrMetrics.get(key);
    
    ssrMetric.calls++;
    ssrMetric.totalDuration += metric.duration;
    ssrMetric.avgDuration = ssrMetric.totalDuration / ssrMetric.calls;
    ssrMetric.maxDuration = Math.max(ssrMetric.maxDuration, metric.duration);
    
    if (metric.memoryDelta) {
      ssrMetric.totalMemoryDelta += metric.memoryDelta;
      ssrMetric.avgMemoryDelta = ssrMetric.totalMemoryDelta / ssrMetric.calls;
    }
    
    if (!metric.success) {
      ssrMetric.errorCount++;
    }
    ssrMetric.errorRate = (ssrMetric.errorCount / ssrMetric.calls) * 100;
    
    ssrMetric.lastCall = new Date(metric.timestamp).toISOString();
    
    this.stats.totalSSR++;
    
    this.emit('ssr-metric', metric);
  }
  
  /**
   * Extract route from URL
   * @private
   */
  _extractRoute(url) {
    // Remove query parameters
    const pathname = url.split('?')[0];
    
    // Convert dynamic routes to patterns
    // /api/users/[id] -> /api/users/:id
    // /posts/[...slug] -> /posts/*
    return pathname
      .replace(/\[\.\.\.(.+?)\]/g, '*')  // catch-all routes
      .replace(/\[(.+?)\]/g, ':$1');     // dynamic routes
  }
  
  /**
   * Check if route should be tracked
   * @private
   */
  _shouldTrackRoute(url) {
    // Skip excluded routes
    for (const excludePattern of this.config.excludeRoutes) {
      if (typeof excludePattern === 'string' && url.includes(excludePattern)) {
        return false;
      }
      if (excludePattern instanceof RegExp && excludePattern.test(url)) {
        return false;
      }
    }
    
    const isAPI = url.startsWith('/api/');
    
    if (isAPI && !this.config.trackAPI) {
      return false;
    }
    
    if (!isAPI && !this.config.trackPages) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Cleanup old metrics
   * @private
   */
  _cleanupOldMetrics() {
    const cleanup = (metricsMap) => {
      if (metricsMap.size > this.config.maxRouteMetrics) {
        const sortedRoutes = Array.from(metricsMap.entries())
          .sort((a, b) => new Date(a[1].lastAccess) - new Date(b[1].lastAccess));
        
        const toRemove = sortedRoutes.slice(0, sortedRoutes.length - this.config.maxRouteMetrics);
        toRemove.forEach(([key]) => metricsMap.delete(key));
      }
    };
    
    cleanup(this.pageMetrics);
    cleanup(this.apiMetrics);
  }
  
  /**
   * Get page metrics
   * @returns {Array} Page metrics
   */
  getPageMetrics() {
    return Array.from(this.pageMetrics.values()).map(metric => ({
      ...metric,
      statusCodes: Object.fromEntries(metric.statusCodes)
    }));
  }
  
  /**
   * Get API metrics
   * @returns {Array} API metrics
   */
  getAPIMetrics() {
    return Array.from(this.apiMetrics.values()).map(metric => ({
      ...metric,
      statusCodes: Object.fromEntries(metric.statusCodes)
    }));
  }
  
  /**
   * Get SSR metrics
   * @returns {Array} SSR metrics
   */
  getSSRMetrics() {
    return Array.from(this.ssrMetrics.values());
  }
  
  /**
   * Get adapter statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      pageCount: this.pageMetrics.size,
      apiCount: this.apiMetrics.size,
      ssrCount: this.ssrMetrics.size
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.pageMetrics.clear();
    this.apiMetrics.clear();
    this.ssrMetrics.clear();
    this.stats = {
      totalRequests: 0,
      totalPages: 0,
      totalAPI: 0,
      totalSSR: 0,
      totalMemoryDelta: 0,
      averageMemoryDelta: 0,
      maxMemoryDelta: 0,
      startTime: Date.now()
    };
    
    this.emit('metrics-reset');
  }
}

module.exports = NextAdapter;
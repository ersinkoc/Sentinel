'use strict';

const EventEmitter = require('events');
const { 
  clampNumber, 
  createSafeTimer, 
  withTimeout,
  getSystemLimits,
  detectEnvironment 
} = require('./utils');
const { PerformanceError, MonitoringError } = require('./errors');

/**
 * Performance optimization engine for Sentinel
 * Provides adaptive monitoring, intelligent sampling, and resource management
 */
class PerformanceOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Adaptive monitoring settings
      adaptive: {
        enabled: config.adaptive?.enabled !== false,
        minInterval: config.adaptive?.minInterval || 5000,
        maxInterval: config.adaptive?.maxInterval || 120000,
        loadThreshold: config.adaptive?.loadThreshold || 0.8,
        memoryThreshold: config.adaptive?.memoryThreshold || 0.85
      },
      
      // Sampling optimization
      sampling: {
        enabled: config.sampling?.enabled !== false,
        strategy: config.sampling?.strategy || 'adaptive', // 'fixed', 'adaptive', 'intelligent'
        baseRate: config.sampling?.baseRate || 1.0, // 100% sampling by default
        minRate: config.sampling?.minRate || 0.1, // 10% minimum
        maxRate: config.sampling?.maxRate || 1.0 // 100% maximum
      },
      
      // Resource management
      resources: {
        maxMemoryUsage: config.resources?.maxMemoryUsage || 0.95, // 95% of available
        maxCpuUsage: config.resources?.maxCpuUsage || 0.8, // 80% CPU
        gcTriggerThreshold: config.resources?.gcTriggerThreshold || 0.9, // 90% heap
        snapshotPoolSize: config.resources?.snapshotPoolSize || 3,
        maxConcurrentOperations: config.resources?.maxConcurrentOperations || 5
      },
      
      // Cache optimization
      cache: {
        enabled: config.cache?.enabled !== false,
        maxSize: config.cache?.maxSize || 100,
        ttl: config.cache?.ttl || 300000, // 5 minutes
        compressionThreshold: config.cache?.compressionThreshold || 1024 // 1KB
      },
      
      // Performance targets
      targets: {
        maxOverhead: config.targets?.maxOverhead || 0.01, // 1% max overhead
        responseTime: config.targets?.responseTime || 100, // 100ms max response
        throughput: config.targets?.throughput || 1000 // operations per second
      }
    };
    
    this.metrics = {
      overhead: 0,
      samplingRate: this.config.sampling.baseRate,
      currentInterval: config.interval || 60000,
      operationCount: 0,
      responseTime: 0,
      memoryPressure: 0,
      cpuPressure: 0
    };
    
    this.state = {
      isOptimizing: false,
      lastOptimization: Date.now(),
      operationQueue: [],
      activeOperations: 0,
      systemLimits: getSystemLimits(),
      environment: detectEnvironment()
    };
    
    this._cache = new Map();
    this._cacheStats = { hits: 0, misses: 0, size: 0 };
    
    this._setupOptimizationTimers();
    this._setupEventListeners();
  }
  
  get cacheStats() {
    return this._cacheStats;
  }
  
  _setupOptimizationTimers() {
    // Adaptive interval adjustment
    this.adaptiveTimer = createSafeTimer(() => {
      this._performAdaptiveOptimization();
    }, 10000); // Check every 10 seconds
    
    // Cache cleanup
    this._cacheTimer = createSafeTimer(() => {
      this._cleanupCache();
    }, 60000); // Cleanup every minute
    
    // Resource monitoring
    this.resourceTimer = createSafeTimer(() => {
      this._monitorResources();
    }, 5000); // Monitor every 5 seconds
  }
  
  _setupEventListeners() {
    // Listen for operation completion events
    this.on('operation-completed', (data) => {
      if (data.duration) {
        this.metrics.responseTime = (this.metrics.responseTime * 0.9) + (data.duration * 0.1); // EMA
      }
    });
  }
  
  /**
   * Optimize monitoring interval based on system conditions
   */
  _performAdaptiveOptimization() {
    if (!this.config.adaptive.enabled) return;
    
    try {
      const systemLoad = this._calculateSystemLoad();
      const memoryPressure = this._calculateMemoryPressure();
      const cpuPressure = this._calculateCpuPressure();
      
      // Calculate optimal interval
      let newInterval = this.metrics.currentInterval;
      
      if (systemLoad > this.config.adaptive.loadThreshold || 
          memoryPressure > this.config.adaptive.memoryThreshold) {
        // Increase interval to reduce overhead
        newInterval = Math.min(
          newInterval * 1.5,
          this.config.adaptive.maxInterval
        );
      } else if (systemLoad < 0.3 && memoryPressure < 0.5) {
        // Decrease interval for better monitoring
        newInterval = Math.max(
          newInterval * 0.8,
          this.config.adaptive.minInterval
        );
      }
      
      if (newInterval !== this.metrics.currentInterval) {
        this.metrics.currentInterval = newInterval;
        this.emit('interval-optimized', {
          oldInterval: this.metrics.currentInterval,
          newInterval: newInterval,
          systemLoad,
          memoryPressure,
          cpuPressure
        });
      }
      
      // Optimize sampling rate
      this._optimizeSamplingRate(systemLoad, memoryPressure);
      
      this.metrics.memoryPressure = memoryPressure;
      this.metrics.cpuPressure = cpuPressure;
      
    } catch (error) {
      this.emit('error', new PerformanceError(
        `Adaptive optimization failed: ${error.message}`,
        'adaptive-optimization',
        this.config.adaptive,
        error.message
      ));
    }
  }
  
  _optimizeSamplingRate(systemLoad, memoryPressure) {
    if (!this.config.sampling.enabled) return;
    
    let newRate = this.metrics.samplingRate;
    
    switch (this.config.sampling.strategy) {
    case 'adaptive':
      // Reduce sampling under load
      if (systemLoad > 0.7 || memoryPressure > 0.8) {
        newRate = Math.max(newRate * 0.7, this.config.sampling.minRate);
      } else if (systemLoad < 0.3 && memoryPressure < 0.4) {
        newRate = Math.min(newRate * 1.2, this.config.sampling.maxRate);
      }
      break;
        
    case 'intelligent':
      // Use ML-like approach based on historical data
      newRate = this._calculateIntelligentSamplingRate(systemLoad, memoryPressure);
      break;
        
    case 'fixed':
    default:
      newRate = this.config.sampling.baseRate;
      break;
    }
    
    newRate = clampNumber(newRate, this.config.sampling.minRate, this.config.sampling.maxRate);
    
    if (Math.abs(newRate - this.metrics.samplingRate) > 0.05) {
      this.metrics.samplingRate = newRate;
      this.emit('sampling-optimized', {
        oldRate: this.metrics.samplingRate,
        newRate: newRate,
        strategy: this.config.sampling.strategy
      });
    }
  }
  
  _calculateIntelligentSamplingRate(systemLoad, memoryPressure) {
    // Simple heuristic-based approach (could be replaced with actual ML)
    const loadFactor = 1 - systemLoad;
    const memoryFactor = 1 - memoryPressure;
    const overheadFactor = Math.max(0, 1 - (this.metrics.overhead / this.config.targets.maxOverhead));
    
    const rate = (loadFactor * 0.4 + memoryFactor * 0.4 + overheadFactor * 0.2);
    
    return clampNumber(rate, this.config.sampling.minRate, this.config.sampling.maxRate);
  }
  
  /**
   * Monitor system resources and trigger optimizations
   */
  _monitorResources() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = this.state.systemLimits.totalMemory;
      
      // Check memory pressure
      const heapUsage = memUsage.heapUsed / memUsage.heapTotal;
      const systemMemUsage = memUsage.rss / totalMem;
      
      if (heapUsage > this.config.resources.gcTriggerThreshold) {
        this._triggerGarbageCollection();
      }
      
      if (systemMemUsage > this.config.resources.maxMemoryUsage) {
        this._handleMemoryPressure();
      }
      
      // Monitor operation queue
      if (this.state.operationQueue.length > this.config.resources.maxConcurrentOperations * 2) {
        this._optimizeOperationQueue();
      }
      
    } catch (error) {
      this.emit('error', new MonitoringError(
        `Resource monitoring failed: ${error.message}`,
        'resource-monitoring'
      ));
    }
  }
  
  _triggerGarbageCollection() {
    if (global.gc) {
      const beforeMem = process.memoryUsage().heapUsed;
      const startTime = process.hrtime.bigint();
      
      global.gc();
      
      const afterMem = process.memoryUsage().heapUsed;
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      this.emit('gc-triggered', {
        memoryFreed: beforeMem - afterMem,
        duration,
        trigger: 'performance-optimizer'
      });
    }
  }
  
  _handleMemoryPressure() {
    // Clear caches
    this._clearLowPriorityCache();
    
    // Reduce sampling rate
    this.metrics.samplingRate = Math.max(
      this.metrics.samplingRate * 0.5,
      this.config.sampling.minRate
    );
    
    // Increase monitoring interval
    this.metrics.currentInterval = Math.min(
      this.metrics.currentInterval * 2,
      this.config.adaptive.maxInterval
    );
    
    this.emit('memory-pressure-handled', {
      action: 'cache-cleared-sampling-reduced',
      newSamplingRate: this.metrics.samplingRate,
      newInterval: this.metrics.currentInterval
    });
  }
  
  _optimizeOperationQueue() {
    // Sort operations by priority
    this.state.operationQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Remove low-priority operations if queue is too large
    const maxQueueSize = this.config.resources.maxConcurrentOperations * 2;
    if (this.state.operationQueue.length > maxQueueSize) {
      const removed = this.state.operationQueue.splice(maxQueueSize);
      this.emit('operations-dropped', { count: removed.length });
    }
  }
  
  /**
   * Smart caching with compression and TTL
   */
  cache(key, value, options = {}) {
    if (!this.config.cache.enabled) return value;
    
    try {
      const ttl = options.ttl || this.config.cache.ttl;
      const priority = options.priority || 1;
      
      // Check cache size limit
      if (this._cache.size >= this.config.cache.maxSize) {
        this._evictLowPriorityEntries();
      }
      
      const entry = {
        value: this._compressValue(value),
        timestamp: Date.now(),
        ttl,
        priority,
        accessCount: 0
      };
      
      this._cache.set(key, entry);
      this._cacheStats.size = this._cache.size;
      
      return value;
    } catch (error) {
      this.emit('error', new PerformanceError(
        `Cache operation failed: ${error.message}`,
        'cache',
        { key, error: error.message }
      ));
      return value;
    }
  }
  
  getCached(key) {
    if (!this.config.cache.enabled) return null;
    
    const entry = this._cache.get(key);
    if (!entry) {
      this._cacheStats.misses++;
      return null;
    }
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this._cache.delete(key);
      this._cacheStats.misses++;
      return null;
    }
    
    entry.accessCount++;
    this._cacheStats.hits++;
    
    return this._decompressValue(entry.value);
  }
  
  _compressValue(value) {
    const serialized = JSON.stringify(value);
    
    if (serialized.length > this.config.cache.compressionThreshold) {
      // Simple compression (could use zlib for real compression)
      return {
        compressed: true,
        data: serialized // In real implementation, use compression
      };
    }
    
    return { compressed: false, data: value };
  }
  
  _decompressValue(compressed) {
    if (compressed.compressed) {
      // In real implementation, decompress here
      return JSON.parse(compressed.data);
    }
    return compressed.data;
  }
  
  _evictLowPriorityEntries() {
    const entries = Array.from(this._cache.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        // Sort by priority (desc) then by access count (desc) then by age (asc)
        if (a.priority !== b.priority) return b.priority - a.priority;
        if (a.accessCount !== b.accessCount) return b.accessCount - a.accessCount;
        return a.timestamp - b.timestamp;
      });
    
    // Remove bottom 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = entries.length - toRemove; i < entries.length; i++) {
      this._cache.delete(entries[i].key);
    }
  }
  
  _cleanupCache() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, entry] of this._cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired.push(key);
      }
    }
    
    expired.forEach(key => this._cache.delete(key));
    this._cacheStats.size = this._cache.size;
    
    if (expired.length > 0) {
      this.emit('cache-cleaned', { expiredCount: expired.length });
    }
  }
  
  _clearLowPriorityCache() {
    let cleared = 0;
    
    for (const [key, entry] of this._cache.entries()) {
      if (entry.priority < 2) { // Clear low priority entries
        this._cache.delete(key);
        cleared++;
      }
    }
    
    this._cacheStats.size = this._cache.size;
    return cleared;
  }
  
  /**
   * Operation throttling and queuing
   */
  async queueOperation(operation, options = {}) {
    const priority = options.priority || 1;
    const timeout = options.timeout || 30000;
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.state.activeOperations >= this.config.resources.maxConcurrentOperations) {
      // Queue the operation
      return new Promise((resolve, reject) => {
        this.state.operationQueue.push({
          id: operationId,
          operation,
          priority,
          timeout,
          resolve,
          reject,
          queuedAt: Date.now()
        });
      });
    }
    
    return this._executeOperation(operation, operationId, timeout);
  }
  
  async _executeOperation(operation, operationId, timeout) {
    this.state.activeOperations++;
    const startTime = process.hrtime.bigint();
    
    try {
      const result = await withTimeout(operation(), timeout, `Operation ${operationId} timed out`);
      
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.metrics.responseTime = (this.metrics.responseTime * 0.9) + (duration * 0.1); // EMA
      this.metrics.operationCount++;
      
      this.emit('operation-completed', {
        id: operationId,
        duration,
        success: true
      });
      
      return result;
      
    } catch (error) {
      this.emit('operation-failed', {
        id: operationId,
        error: error.message
      });
      throw error;
      
    } finally {
      this.state.activeOperations--;
      this._processOperationQueue();
    }
  }
  
  _processOperationQueue() {
    while (this.state.operationQueue.length > 0 && 
           this.state.activeOperations < this.config.resources.maxConcurrentOperations) {
      
      // Sort by priority before processing
      this.state.operationQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const queued = this.state.operationQueue.shift();
      const queueTime = Date.now() - queued.queuedAt;
      
      if (queueTime > queued.timeout) {
        queued.reject(new Error(`Operation ${queued.id} timed out in queue`));
        continue;
      }
      
      this._executeOperation(queued.operation, queued.id, queued.timeout - queueTime)
        .then(queued.resolve)
        .catch(queued.reject);
    }
  }
  
  /**
   * Performance monitoring and metrics
   */
  measureOverhead(operation, iterations = 100) {
    const measurements = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      operation();
      const end = process.hrtime.bigint();
      measurements.push(Number(end - start) / 1000000); // Convert to milliseconds
    }
    
    const avg = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
    const variance = measurements.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / measurements.length;
    const stdDev = Math.sqrt(variance);
    
    this.metrics.overhead = avg;
    
    return {
      average: avg,
      median: measurements.sort((a, b) => a - b)[Math.floor(measurements.length / 2)],
      standardDeviation: stdDev,
      percentile95: measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)],
      samples: measurements.length
    };
  }
  
  _calculateSystemLoad() {
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    // Simple CPU load calculation
    const totalCpuTime = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    return Math.min(totalCpuTime / uptime / this.state.systemLimits.cpuCount, 1);
  }
  
  _calculateMemoryPressure() {
    const memUsage = process.memoryUsage();
    return memUsage.rss / this.state.systemLimits.totalMemory;
  }
  
  _calculateCpuPressure() {
    // This is a simplified calculation
    return this._calculateSystemLoad();
  }
  
  /**
   * Get current performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheStats: { ...this._cacheStats },
      queueStats: {
        length: this.state.operationQueue.length,
        activeOperations: this.state.activeOperations
      },
      efficiency: this._calculateEfficiency(),
      recommendations: this._generateRecommendations()
    };
  }
  
  _calculateEfficiency() {
    const overheadEfficiency = Math.max(0, 1 - (this.metrics.overhead / this.config.targets.maxOverhead));
    const responseEfficiency = Math.max(0, 1 - (this.metrics.responseTime / this.config.targets.responseTime));
    const cacheHitRate = this._cacheStats.hits / (this._cacheStats.hits + this._cacheStats.misses) || 0;
    
    return {
      overall: (overheadEfficiency + responseEfficiency + cacheHitRate) / 3,
      overhead: overheadEfficiency,
      responseTime: responseEfficiency,
      caching: cacheHitRate
    };
  }
  
  _generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.overhead > this.config.targets.maxOverhead) {
      recommendations.push('Consider increasing monitoring interval to reduce overhead');
    }
    
    if (this.metrics.responseTime > this.config.targets.responseTime) {
      recommendations.push('Consider enabling caching or reducing operation complexity');
    }
    
    const cacheHitRate = this._cacheStats.hits / (this._cacheStats.hits + this._cacheStats.misses) || 0;
    if (cacheHitRate < 0.5) {
      recommendations.push('Consider increasing cache size or TTL for better hit rate');
    }
    
    if (this.state.operationQueue.length > 5) {
      recommendations.push('Consider increasing maxConcurrentOperations or optimizing operations');
    }
    
    return recommendations;
  }
  
  /**
   * Apply performance optimizations
   */
  optimize() {
    this.state.isOptimizing = true;
    
    try {
      // Force adaptive optimization
      this._performAdaptiveOptimization();
      
      // Cleanup resources
      this._cleanupCache();
      this._optimizeOperationQueue();
      
      // Trigger GC if needed
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
        this._triggerGarbageCollection();
      }
      
      this.state.lastOptimization = Date.now();
      this.emit('optimization-complete', this.getMetrics());
      
    } finally {
      this.state.isOptimizing = false;
    }
  }
  
  /**
   * Reset performance metrics and optimizations
   */
  reset() {
    this.metrics = {
      overhead: 0,
      samplingRate: this.config.sampling.baseRate,
      currentInterval: this.config.interval || 60000,
      operationCount: 0,
      responseTime: 0,
      memoryPressure: 0,
      cpuPressure: 0
    };
    
    this._cache.clear();
    this._cacheStats = { hits: 0, misses: 0, size: 0 };
    this.state.operationQueue = [];
    
    this.emit('performance-reset');
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.adaptiveTimer) this.adaptiveTimer.clear();
    if (this._cacheTimer) this._cacheTimer.clear();
    if (this.resourceTimer) this.resourceTimer.clear();
    
    this._cache.clear();
    this.state.operationQueue.forEach(op => {
      op.reject(new Error('Performance optimizer destroyed'));
    });
    this.state.operationQueue = [];
    
    this.removeAllListeners();
  }
}

module.exports = PerformanceOptimizer;
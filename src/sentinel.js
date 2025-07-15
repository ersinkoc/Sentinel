'use strict';

const EventEmitter = require('events');
const Monitor = require('./monitor');
const Detector = require('./detector');
const Analyzer = require('./analyzer');
const Profiler = require('./profiler');
const Reporter = require('./reporter');
const PerformanceOptimizer = require('./performance');
const MemoryStreamer = require('./streaming');
const AlertManager = require('./alerting');
const MemoryHotspots = require('./hotspots');
const { validateConfig, mergeConfig } = require('./utils');
const { 
  SentinelError, 
  StateError, 
  ConfigurationError,
  ErrorHandler,
  CircuitBreaker,
  RetryManager 
} = require('./errors');

const DEFAULT_CONFIG = {
  monitoring: {
    interval: 30000, // 30 seconds
    detailed: false,
    gc: true,
    processes: true
  },
  threshold: {
    heap: 0.8, // 80% of heap limit
    growth: 0.1, // 10% growth rate
    gcFrequency: 10 // GCs per minute
  },
  detection: {
    enabled: true,
    sensitivity: 'medium', // low, medium, high
    patterns: ['all'], // event-listeners, timers, promises, closures, arrays, maps
    baseline: {
      duration: 60000, // 1 minute
      samples: 10
    }
  },
  reporting: {
    console: true,
    file: null,
    webhook: null
  },
  
  // Streaming configuration
  streaming: {
    enabled: false,
    port: 3001,
    host: 'localhost',
    channels: ['memory', 'alerts', 'hotspots']
  },
  
  // Alerting configuration
  alerting: {
    enabled: true,
    throttling: { enabled: true, maxAlertsPerWindow: 10 },
    escalation: { enabled: true },
    channels: {
      console: { type: 'console', minLevel: 'warning' }
    }
  },
  
  // Hotspots configuration
  hotspots: {
    enabled: false,
    sampleInterval: 10000,
    retentionPeriod: 3600000
  }
};

class Sentinel extends EventEmitter {
  constructor(config = {}) {
    super();
    
    try {
      // Normalize legacy configuration
      const normalizedConfig = this._normalizeLegacyConfig(config);
      
      // Validate configuration first
      this.config = mergeConfig(DEFAULT_CONFIG, normalizedConfig);
      validateConfig(this.config);
      
      // Initialize error handling
      this.errorHandler = new ErrorHandler({
        logErrors: this.config.errorHandling?.logErrors !== false,
        throwOnCritical: this.config.errorHandling?.throwOnCritical !== false
      });
      
      // Initialize circuit breakers for critical operations
      this.circuitBreakers = {
        monitoring: new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 }),
        analysis: new CircuitBreaker({ failureThreshold: 2, resetTimeout: 60000 }),
        reporting: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 15000 })
      };
      
      // Initialize retry managers
      this.retryManagers = {
        network: new RetryManager({ maxRetries: 3, baseDelay: 1000 }),
        fileSystem: new RetryManager({ maxRetries: 2, baseDelay: 500 })
      };
      
      // Initialize subsystems with error handling
      this.monitor = this._initializeSubsystem('Monitor', Monitor);
      this.detector = this._initializeSubsystem('Detector', Detector);
      this.analyzer = this._initializeSubsystem('Analyzer', Analyzer);
      this.profiler = this._initializeSubsystem('Profiler', Profiler);
      this.reporter = this._initializeSubsystem('Reporter', Reporter);
      this.performance = this._initializeSubsystem('PerformanceOptimizer', PerformanceOptimizer);
      
      // Initialize advanced features
      if (this.config.streaming?.enabled) {
        this.streamer = this._initializeSubsystem('MemoryStreamer', MemoryStreamer, this.config.streaming);
      }
      
      if (this.config.alerting?.enabled) {
        this.alerts = this._initializeSubsystem('AlertManager', AlertManager, this.config.alerting);
      }
      
      if (this.config.hotspots?.enabled) {
        this.hotspots = this._initializeSubsystem('MemoryHotspots', MemoryHotspots, this.config.hotspots);
      }
      
      this._isRunning = false;
      this._intervalId = null;
      this._instance = null;
      this._state = 'initialized';
      this._startupTime = Date.now();
      this._lastHeartbeat = Date.now();
      
      this._setupEventHandlers();
      this._setupErrorRecovery();
      this._startHeartbeat();
      
    } catch (error) {
      const sentinelError = new ConfigurationError(
        `Failed to initialize Sentinel: ${error.message}`,
        ['initialization'],
        { originalError: error.message }
      );
      this.emit('error', sentinelError);
      throw sentinelError;
    }
  }
  
  _initializeSubsystem(name, SubsystemClass, customConfig = null) {
    try {
      return new SubsystemClass(customConfig || this.config);
    } catch (error) {
      const subsystemError = new SentinelError(
        `Failed to initialize ${name}: ${error.message}`,
        'SUBSYSTEM_INIT_FAILED',
        { subsystem: name, originalError: error.message }
      );
      throw subsystemError;
    }
  }
  
  _normalizeLegacyConfig(config) {
    const normalized = { ...config };
    
    // Handle legacy 'enabled' field
    if (config.enabled !== undefined) {
      if (!normalized.detection) normalized.detection = {};
      if (normalized.detection.enabled === undefined) {
        normalized.detection.enabled = config.enabled;
      }
      delete normalized.enabled;
    }
    
    // Handle legacy 'interval' field
    if (config.interval !== undefined) {
      if (!normalized.monitoring) normalized.monitoring = {};
      if (normalized.monitoring.interval === undefined) {
        normalized.monitoring.interval = config.interval;
      }
      delete normalized.interval;
    }
    
    // Handle legacy 'production' field
    if (config.production !== undefined) {
      // This field is fully deprecated, just remove it
      delete normalized.production;
    }
    
    return normalized;
  }

  _setupErrorRecovery() {
    // Global error handlers for production safety
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.emit('error', new SentinelError('Uncaught exception', 'UNCAUGHT_EXCEPTION', { error: error.message }));
      
      // Gracefully shutdown
      this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.emit('error', new SentinelError('Unhandled promise rejection', 'UNHANDLED_REJECTION', { reason: reason?.message || reason }));
    });

    // Handle uncaught errors in subsystems
    this.on('error', (error) => {
      try {
        this.errorHandler.handle(error, { 
          state: this._state,
          isRunning: this._isRunning,
          uptime: Date.now() - this._startupTime
        });
      } catch (criticalError) {
        console.error('[Sentinel] Critical error in error handler:', criticalError);
        process.nextTick(() => {
          this.emit('critical-error', criticalError);
        });
      }
    });
    
    // Recovery strategies for different error types
    this.on('monitoring-error', (error) => this._recoverFromMonitoringError(error));
    this.on('detection-error', (error) => this._recoverFromDetectionError(error));
    this.on('analysis-error', (error) => this._recoverFromAnalysisError(error));
    this.on('reporting-error', (error) => this._recoverFromReportingError(error));
  }
  
  _startHeartbeat() {
    this._heartbeatInterval = setInterval(() => {
      this._lastHeartbeat = Date.now();
      this._performHealthCheck();
    }, 30000); // 30 second heartbeat
  }
  
  _performHealthCheck() {
    try {
      const health = {
        timestamp: Date.now(),
        state: this._state,
        isRunning: this._isRunning,
        uptime: Date.now() - this._startupTime,
        memory: process.memoryUsage(),
        errorCount: this.errorHandler.getErrorStats(),
        circuitBreakers: Object.fromEntries(
          Object.entries(this.circuitBreakers).map(([name, cb]) => [name, cb.getState()])
        )
      };
      
      this.emit('health-check', health);
      
      // Check for concerning patterns
      const totalErrors = Object.values(health.errorCount).reduce((sum, count) => sum + count, 0);
      if (totalErrors > 10) {
        this.emit('error', new SentinelError(
          `High error count detected: ${totalErrors} errors`,
          'HIGH_ERROR_COUNT',
          { errorStats: health.errorCount }
        ));
      }
      
    } catch (error) {
      this.emit('error', new SentinelError(
        `Health check failed: ${error.message}`,
        'HEALTH_CHECK_FAILED'
      ));
    }
  }
  
  static getInstance(config) {
    if (!Sentinel._instance) {
      Sentinel._instance = new Sentinel(config);
    }
    return Sentinel._instance;
  }

  get isRunning() {
    return this._isRunning;
  }
  
  _setupEventHandlers() {
    this.monitor.on('metrics', (metrics) => {
      this.emit('metrics', metrics);
      this.detector.analyze(metrics);
      
      // Stream metrics if streaming is enabled
      if (this.streamer) {
        this.streamer.broadcast({
          type: 'metrics',
          data: metrics
        }, 'memory');
      }
    });
    
    this.detector.on('leak', (leak) => {
      this.emit('leak', leak);
      this.reporter.reportLeak(leak);
      
      // Create alert for memory leak
      if (this.alerts) {
        this.alerts.createAlert({
          level: 'critical',
          title: 'Memory Leak Detected',
          message: `Memory leak detected with ${Math.round(leak.probability * 100)}% probability`,
          category: 'memory-leak',
          metrics: leak.metrics,
          recommendations: leak.recommendations,
          metadata: { leak }
        });
      }
      
      // Stream leak alert
      if (this.streamer) {
        this.streamer.broadcast({
          type: 'leak',
          data: leak
        }, 'alerts');
      }
      
      if (this.config.onLeak) {
        this.config.onLeak(leak);
      }
    });
    
    this.detector.on('warning', (warning) => {
      this.emit('warning', warning);
      this.reporter.reportWarning(warning);
      
      // Create alert for warning
      if (this.alerts) {
        this.alerts.createAlert({
          level: 'warning',
          title: warning.type || 'Memory Warning',
          message: warning.message,
          category: 'memory-warning',
          metadata: { warning }
        });
      }
      
      // Stream warning
      if (this.streamer) {
        this.streamer.broadcast({
          type: 'warning',
          data: warning
        }, 'alerts');
      }
    });
    
    // Setup hotspots event handling
    if (this.hotspots) {
      this.hotspots.on('hotspot-detected', (hotspot) => {
        this.emit('hotspot-detected', hotspot);
        
        // Create alert for hotspot
        if (this.alerts) {
          this.alerts.createAlert({
            level: hotspot.severity === 'critical' ? 'critical' : 'warning',
            title: `Memory Hotspot: ${hotspot.type}`,
            message: `Memory hotspot detected: ${hotspot.type}`,
            category: 'memory-hotspot',
            metadata: { hotspot },
            recommendations: hotspot.recommendations
          });
        }
        
        // Stream hotspot
        if (this.streamer) {
          this.streamer.broadcast({
            type: 'hotspot',
            data: hotspot
          }, 'hotspots');
        }
      });
    }
    
    // Setup alert event handling
    if (this.alerts) {
      this.alerts.on('alert-created', (alert) => {
        this.emit('alert-created', alert);
        
        // Stream alert
        if (this.streamer) {
          this.streamer.broadcast({
            type: 'alert',
            data: alert
          }, 'alerts');
        }
      });
      
      this.alerts.on('alert-escalated', (alert) => {
        this.emit('alert-escalated', alert);
        
        // Stream escalated alert
        if (this.streamer) {
          this.streamer.broadcast({
            type: 'alert-escalated',
            data: alert
          }, 'alerts');
        }
      });
    }
  }
  
  configure(config) {
    this.config = mergeConfig(this.config, config);
    this.monitor.configure(this.config);
    this.detector.configure(this.config);
    this.analyzer.configure(this.config);
    this.profiler.configure(this.config);
    this.reporter.configure(this.config);
    return this;
  }
  
  start() {
    if (this._isRunning) {
      return this;
    }
    
    if (!this.config.detection?.enabled) {
      return this;
    }
    
    try {
      this._state = 'starting';
      
      // Start subsystems 
      this.monitor.start();
      this.detector.start();
      
      // Start advanced features (async operations handled separately)
      if (this.streamer) {
        this.streamer.start().catch(error => {
          this.emit('error', new SentinelError(
            `Failed to start streaming: ${error.message}`,
            'STREAMING_START_FAILED'
          ));
        });
      }
      
      if (this.hotspots) {
        this.hotspots.start();
      }
      
      this._isRunning = true;
      this._state = 'running';
      
      // Set up monitoring interval with error handling
      const interval = this.config.monitoring?.interval || this.config.interval || 30000;
      if (interval > 0) {
        this._intervalId = setInterval(() => {
          this._performMonitoringCycle();
        }, interval);
      }
      
      this.emit('started');
      return this;
      
    } catch (error) {
      this._state = 'error';
      const startError = new StateError(
        `Failed to start Sentinel: ${error.message}`,
        'error',
        'running',
        { originalError: error.message }
      );
      
      this.emit('error', startError);
      throw startError;
    }
  }
  
  _performMonitoringCycle() {
    try {
      if (!this._shouldMonitor()) {
        return;
      }
      
      // Simple monitoring cycle
      this.monitor.collect();
      
    } catch (error) {
      const monitoringError = new SentinelError(
        `Monitoring cycle failed: ${error.message}`,
        'MONITORING_CYCLE_FAILED',
        { cycle: Date.now() }
      );
      
      this.emit('monitoring-error', monitoringError);
    }
  }
  
  _updateMonitoringInterval() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = setInterval(() => {
        this._performMonitoringCycle();
      }, this.config.interval);
    }
  }
  
  async _safelyExecute(operation, operationName) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      const wrappedError = new SentinelError(
        `Operation ${operationName} failed: ${error.message}`,
        'OPERATION_FAILED',
        { operation: operationName, originalError: error.message }
      );
      
      throw wrappedError;
    }
  }
  
  stop() {
    if (!this._isRunning) {
      return this;
    }
    
    this._isRunning = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    
    this.monitor.stop();
    this.detector.stop();
    this.reporter.flush();
    
    // Stop advanced features
    if (this.streamer) {
      this.streamer.stop().catch(error => {
        this.emit('error', new SentinelError(
          `Failed to stop streaming: ${error.message}`,
          'STREAMING_STOP_FAILED'
        ));
      });
    }
    
    if (this.hotspots) {
      this.hotspots.stop();
    }
    
    if (this.alerts) {
      this.alerts.destroy();
    }
    
    this.emit('stop');
    return this;
  }
  
  _shouldMonitor() {
    // Always monitor unless explicitly disabled
    return this.config.detection?.enabled !== false;
  }
  
  async snapshot() {
    return this.circuitBreakers.analysis.execute(async () => {
      return this.retryManagers.fileSystem.execute(async () => {
        return this._safelyExecute(() => this.analyzer.createSnapshot(), 'analyzer.createSnapshot');
      });
    });
  }
  
  async analyze(options = {}) {
    try {
      const snapshot = await this.snapshot();
      return await this.circuitBreakers.analysis.execute(async () => {
        return this._safelyExecute(() => this.analyzer.analyzeSnapshot(snapshot, options), 'analyzer.analyzeSnapshot');
      });
    } catch (error) {
      const analysisError = new SentinelError(
        `Analysis failed: ${error.message}`,
        'ANALYSIS_FAILED',
        { options, originalError: error.message }
      );
      this.emit('analysis-error', analysisError);
      throw analysisError;
    }
  }
  
  async compare(snapshot1, snapshot2) {
    return this.circuitBreakers.analysis.execute(async () => {
      return this._safelyExecute(() => this.analyzer.compareSnapshots(snapshot1, snapshot2), 'analyzer.compareSnapshots');
    });
  }
  
  forceGC() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }
  
  getMetrics() {
    return this.monitor.getMetrics();
  }
  
  getLeaks() {
    return this.detector.getLeaks();
  }
  
  reset() {
    this.monitor.reset();
    this.detector.reset();
    return this;
  }
  
  profile(duration = 10000) {
    return this.profiler.profile(duration);
  }
  
  enableDebug() {
    this.config.debug = true;
    return this;
  }
  
  disableDebug() {
    this.config.debug = false;
    return this;
  }
  
  // Error recovery methods
  async _recoverFromMonitoringError(error) {
    try {
      // Attempt to restart monitoring after a delay
      await this._sleep(5000);
      
      if (this._isRunning && this.monitor) {
        await this._safelyExecute(() => this.monitor.reset(), 'monitor.reset');
        await this._safelyExecute(() => this.monitor.start(), 'monitor.restart');
      }
    } catch (recoveryError) {
      this.emit('error', new SentinelError(
        `Failed to recover from monitoring error: ${recoveryError.message}`,
        'RECOVERY_FAILED',
        { originalError: error.message, recoveryError: recoveryError.message }
      ));
    }
  }
  
  async _recoverFromDetectionError(error) {
    try {
      // Reset detection baseline
      if (this.detector) {
        await this._safelyExecute(() => this.detector.reset(), 'detector.reset');
      }
    } catch (recoveryError) {
      this.emit('error', new SentinelError(
        `Failed to recover from detection error: ${recoveryError.message}`,
        'RECOVERY_FAILED',
        { originalError: error.message, recoveryError: recoveryError.message }
      ));
    }
  }
  
  async _recoverFromAnalysisError(error) {
    try {
      // Clear analysis cache and reset
      if (this.analyzer) {
        await this._safelyExecute(() => this.analyzer.clearCache(), 'analyzer.clearCache');
      }
    } catch (recoveryError) {
      this.emit('error', new SentinelError(
        `Failed to recover from analysis error: ${recoveryError.message}`,
        'RECOVERY_FAILED',
        { originalError: error.message, recoveryError: recoveryError.message }
      ));
    }
  }
  
  async _recoverFromReportingError(error) {
    try {
      // Reset reporting channels
      if (this.reporter) {
        await this._safelyExecute(() => this.reporter.reset(), 'reporter.reset');
      }
    } catch (recoveryError) {
      this.emit('error', new SentinelError(
        `Failed to recover from reporting error: ${recoveryError.message}`,
        'RECOVERY_FAILED',
        { originalError: error.message, recoveryError: recoveryError.message }
      ));
    }
  }
  
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Enhanced API methods with error handling
  getHealth() {
    try {
      return {
        state: this._state,
        isRunning: this._isRunning,
        uptime: Date.now() - this._startupTime,
        lastHeartbeat: this._lastHeartbeat,
        errorStats: this.errorHandler.getErrorStats(),
        circuitBreakers: Object.fromEntries(
          Object.entries(this.circuitBreakers).map(([name, cb]) => [name, cb.getState()])
        ),
        memory: process.memoryUsage(),
        version: require('../package.json').version
      };
    } catch (error) {
      throw new SentinelError(
        `Failed to get health status: ${error.message}`,
        'HEALTH_STATUS_FAILED'
      );
    }
  }
  
  getErrorHistory() {
    try {
      return this.errorHandler.getErrorHistory();
    } catch (error) {
      throw new SentinelError(
        `Failed to get error history: ${error.message}`,
        'ERROR_HISTORY_FAILED'
      );
    }
  }
  
  clearErrors() {
    try {
      this.errorHandler.clearHistory();
      
      // Reset circuit breakers
      Object.values(this.circuitBreakers).forEach(cb => cb.reset());
      
      return this;
    } catch (error) {
      throw new SentinelError(
        `Failed to clear errors: ${error.message}`,
        'CLEAR_ERRORS_FAILED'
      );
    }
  }
  
  async gracefulShutdown(timeout = 30000) {
    try {
      this._state = 'shutting_down';
      
      // Stop monitoring first
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
      
      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), timeout);
      });
      
      // Shutdown operations
      const shutdownPromise = Promise.all([
        this._safelyExecute(() => this.monitor.stop(), 'monitor.stop'),
        this._safelyExecute(() => this.detector.stop(), 'detector.stop'),
        this._safelyExecute(() => this.reporter.flush(), 'reporter.flush'),
        this._safelyExecute(() => this.performance.destroy(), 'performance.destroy')
      ]);
      
      await Promise.race([shutdownPromise, timeoutPromise]);
      
      this._isRunning = false;
      this._state = 'stopped';
      
      this.emit('shutdown');
      
    } catch (error) {
      this._state = 'error';
      throw new SentinelError(
        `Graceful shutdown failed: ${error.message}`,
        'SHUTDOWN_FAILED',
        { timeout }
      );
    }
  }
  
  // Advanced monitoring methods
  
  // Streaming API
  startStreaming(config = {}) {
    if (!this.streamer) {
      this.streamer = new MemoryStreamer({ ...this.config.streaming, ...config });
      this._setupStreamingEvents();
    }
    
    return this.streamer.start();
  }
  
  stopStreaming() {
    if (this.streamer) {
      return this.streamer.stop();
    }
    return Promise.resolve();
  }
  
  getStreamingStats() {
    return this.streamer ? this.streamer.getStats() : null;
  }
  
  broadcastToStream(data, channel = 'default') {
    if (this.streamer) {
      return this.streamer.broadcast(data, channel);
    }
    return 0;
  }
  
  // Alerting API
  createAlert(alertData) {
    if (this.alerts) {
      return this.alerts.createAlert(alertData);
    }
    return null;
  }
  
  getActiveAlerts(filters = {}) {
    return this.alerts ? this.alerts.getActiveAlerts(filters) : [];
  }
  
  resolveAlert(alertId, resolution = {}) {
    return this.alerts ? this.alerts.resolveAlert(alertId, resolution) : false;
  }
  
  getAlertStats() {
    return this.alerts ? this.alerts.getStats() : null;
  }
  
  configureAlerts(config) {
    if (this.alerts) {
      this.alerts.configure(config);
    }
    return this;
  }
  
  // Hotspots API
  startHotspotAnalysis(config = {}) {
    if (!this.hotspots) {
      this.hotspots = new MemoryHotspots({ ...this.config.hotspots, ...config });
      this._setupHotspotsEvents();
    }
    
    return this.hotspots.start();
  }
  
  stopHotspotAnalysis() {
    if (this.hotspots) {
      this.hotspots.stop();
    }
    return this;
  }
  
  getMemoryHotspots(filters = {}) {
    return this.hotspots ? this.hotspots.getHotspots(filters) : [];
  }
  
  getMemoryMap() {
    return this.hotspots ? this.hotspots.getMemoryMap() : null;
  }
  
  resolveHotspot(id, resolution = {}) {
    return this.hotspots ? this.hotspots.resolveHotspot(id, resolution) : false;
  }
  
  getHotspotStats() {
    return this.hotspots ? this.hotspots.getStats() : null;
  }
  
  _setupStreamingEvents() {
    if (this.streamer) {
      this.streamer.on('started', (info) => {
        this.emit('streaming-started', info);
      });
      
      this.streamer.on('stopped', () => {
        this.emit('streaming-stopped');
      });
      
      this.streamer.on('client-connected', (client) => {
        this.emit('streaming-client-connected', client);
      });
      
      this.streamer.on('client-disconnected', (client) => {
        this.emit('streaming-client-disconnected', client);
      });
    }
  }
  
  _setupHotspotsEvents() {
    if (this.hotspots) {
      this.hotspots.on('hotspot-detected', (hotspot) => {
        this.emit('hotspot-detected', hotspot);
      });
      
      this.hotspots.on('hotspot-resolved', (hotspot) => {
        this.emit('hotspot-resolved', hotspot);
      });
    }
  }
  
  // Performance optimization methods
  getPerformanceMetrics() {
    try {
      return this.performance.getMetrics();
    } catch (error) {
      throw new SentinelError(
        `Failed to get performance metrics: ${error.message}`,
        'PERFORMANCE_METRICS_FAILED'
      );
    }
  }
  
  optimizePerformance() {
    try {
      this.performance.optimize();
      return this.getPerformanceMetrics();
    } catch (error) {
      throw new SentinelError(
        `Performance optimization failed: ${error.message}`,
        'PERFORMANCE_OPTIMIZATION_FAILED'
      );
    }
  }
  
  measureOverhead(iterations = 100) {
    try {
      return this.performance.measureOverhead(() => {
        this.getMetrics();
      }, iterations);
    } catch (error) {
      throw new SentinelError(
        `Overhead measurement failed: ${error.message}`,
        'OVERHEAD_MEASUREMENT_FAILED'
      );
    }
  }
  
  setCacheValue(key, value, options) {
    try {
      return this.performance.cache(key, value, options);
    } catch (error) {
      throw new SentinelError(
        `Cache set failed: ${error.message}`,
        'CACHE_SET_FAILED',
        { key }
      );
    }
  }
  
  getCacheValue(key) {
    try {
      return this.performance.getCached(key);
    } catch (error) {
      throw new SentinelError(
        `Cache get failed: ${error.message}`,
        'CACHE_GET_FAILED',
        { key }
      );
    }
  }
  
  async queueOperation(operation, options) {
    try {
      return await this.performance.queueOperation(operation, options);
    } catch (error) {
      throw new SentinelError(
        `Operation queuing failed: ${error.message}`,
        'OPERATION_QUEUE_FAILED'
      );
    }
  }
}

module.exports = Sentinel;
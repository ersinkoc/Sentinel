'use strict';

/**
 * Default configuration for Sentinel
 * This serves as the base configuration that can be overridden by environment-specific configs
 */
module.exports = {
  // Core monitoring configuration
  monitoring: {
    enabled: true,
    interval: 30000, // 30 seconds
    detailed: false,
    gc: true,
    adaptiveInterval: true,
    minInterval: 5000,   // 5 seconds
    maxInterval: 300000  // 5 minutes
  },

  // Memory threshold configuration
  threshold: {
    heap: 0.8,          // 80% of heap
    rss: 0.9,           // 90% of RSS
    external: 0.8,      // 80% of external memory
    growth: 0.1,        // 10% growth rate threshold
    gcFrequency: 10,    // GC events per monitoring interval
    gcEfficiency: 0.1   // Minimum GC efficiency (10%)
  },

  // Leak detection configuration
  detection: {
    enabled: true,
    sensitivity: 'medium', // 'low', 'medium', 'high'
    patterns: ['all'],     // Array of detection patterns or 'all'
    algorithms: {
      growth: true,
      retention: true,
      frequency: true,
      clustering: true
    },
    thresholds: {
      growth: 0.15,      // 15% growth threshold
      retention: 0.8,    // 80% retention threshold
      frequency: 5,      // Frequency threshold
      confidence: 0.7    // 70% confidence threshold
    }
  },

  // Analysis configuration
  analysis: {
    enabled: true,
    heapSnapshots: true,
    objectInspection: true,
    retainerAnalysis: true,
    maxSnapshotSize: 100 * 1024 * 1024, // 100MB
    snapshotInterval: 300000,            // 5 minutes
    autoCleanup: true,
    maxSnapshots: 5
  },

  // Profiling configuration
  profiling: {
    enabled: false,
    sampling: true,
    allocation: false,
    duration: 60000,     // 1 minute
    sampleRate: 1000,    // Samples per second
    stackDepth: 32,
    filters: {
      minSampleCount: 10,
      minDuration: 1000  // 1ms
    }
  },

  // Reporting configuration
  reporting: {
    console: true,
    file: null,
    webhook: null,
    dashboard: false,
    email: null,
    levels: {
      info: true,
      warn: true,
      error: true,
      debug: false
    },
    format: 'text',      // 'text' or 'json'
    includeStack: true,
    includeContext: true
  },

  // Performance optimization
  performance: {
    adaptive: true,
    lowImpactMode: false,
    backgroundProcessing: true,
    throttling: {
      enabled: true,
      maxConcurrent: 3,
      interval: 1000
    },
    caching: {
      enabled: true,
      ttl: 30000,        // 30 seconds
      maxEntries: 1000
    }
  },

  // Security configuration
  security: {
    accessControl: {
      enabled: true,
      allowedOrigins: ['localhost'],
      maxRequestsPerMinute: 100,
      authentication: false
    },
    validation: {
      enabled: true,
      maxInputLength: 10000,
      sanitizeInput: true,
      allowedFileTypes: ['.js', '.json', '.heapsnapshot']
    },
    encryption: {
      enabled: false,
      algorithm: 'aes-256-gcm',
      keyRotation: true,
      keyRotationInterval: 86400000 // 24 hours
    }
  },

  // Alerting configuration
  alerting: {
    enabled: true,
    channels: {
      console: true,
      file: false,
      webhook: false,
      email: false
    },
    rules: [
      {
        name: 'criticalMemoryUsage',
        condition: 'heap > 0.9',
        severity: 'critical',
        throttle: 300000 // 5 minutes
      },
      {
        name: 'memoryLeak',
        condition: 'leak.confidence > 0.8',
        severity: 'high',
        throttle: 600000 // 10 minutes
      },
      {
        name: 'gcInefficiency',
        condition: 'gc.efficiency < 0.1',
        severity: 'medium',
        throttle: 900000 // 15 minutes
      }
    ]
  },

  // Streaming configuration
  streaming: {
    enabled: false,
    protocol: 'sse',     // 'sse' or 'websocket'
    heartbeat: 30000,    // 30 seconds
    maxClients: 10,
    authentication: false,
    compression: true
  },

  // Dashboard configuration
  dashboard: {
    enabled: false,
    port: 3001,
    host: 'localhost',
    auth: null,
    cors: true,
    updateInterval: 5000,
    historySize: 100
  },

  // Framework adapter configuration
  adapters: {
    express: {
      enabled: true,
      trackRoutes: true,
      trackMiddleware: true,
      trackMemoryPerRequest: false,
      excludeRoutes: ['/health', '/metrics']
    },
    fastify: {
      enabled: true,
      trackHooks: true,
      trackPlugins: false,
      trackMemoryPerRequest: false
    },
    koa: {
      enabled: true,
      trackMiddleware: true,
      trackMemoryPerRequest: false
    },
    next: {
      enabled: true,
      trackPages: true,
      trackAPI: true,
      trackSSR: true,
      trackMemoryPerRequest: false
    }
  },

  // Logging configuration
  logging: {
    level: 'info',       // 'error', 'warn', 'info', 'debug', 'trace'
    console: true,
    file: null,
    rotation: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: 'text',      // 'text' or 'json'
    timestamp: true,
    colors: true
  },

  // Error handling configuration
  errorHandling: {
    exitOnUnhandled: true,
    gracefulShutdownTimeout: 10000,
    logErrors: true,
    reportErrors: false,
    errorThreshold: 10,
    errorWindow: 60000,  // 1 minute
    circuitBreaker: {
      threshold: 5,
      window: 30000,     // 30 seconds
      timeout: 60000     // 1 minute
    }
  },

  // Environment detection
  environment: process.env.NODE_ENV || 'development',

  // Feature flags
  features: {
    experimentalFeatures: false,
    betaFeatures: false,
    legacySupport: true
  }
};
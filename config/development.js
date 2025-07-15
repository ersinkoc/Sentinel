'use strict';

/**
 * Development configuration for Sentinel
 * Optimized for development with enhanced debugging and monitoring features
 */
module.exports = {
  // Development monitoring - more frequent and detailed
  monitoring: {
    interval: 10000,     // 10 seconds for quick feedback
    detailed: true,      // Enable detailed monitoring
    adaptiveInterval: false, // Fixed interval for consistent debugging
    gc: true
  },

  // Relaxed thresholds for development
  threshold: {
    heap: 0.9,           // Higher threshold to avoid false alarms
    growth: 0.2,         // Higher growth threshold
    gcFrequency: 5       // Lower GC frequency threshold
  },

  // Sensitive detection for development
  detection: {
    sensitivity: 'medium',
    patterns: ['all'],
    thresholds: {
      growth: 0.2,       // Higher threshold for development
      confidence: 0.6    // Lower confidence for early detection
    }
  },

  // Full analysis capabilities
  analysis: {
    enabled: true,
    heapSnapshots: true,
    objectInspection: true,
    retainerAnalysis: true,
    autoCleanup: true,
    maxSnapshots: 10,    // Keep more snapshots for analysis
    snapshotInterval: 120000 // 2 minutes
  },

  // Profiling enabled for development
  profiling: {
    enabled: true,
    sampling: true,
    allocation: true,
    duration: 30000,     // Shorter duration for development
    sampleRate: 1000
  },

  // Verbose reporting for development
  reporting: {
    console: true,
    file: './logs/sentinel-dev.log',
    levels: {
      info: true,        // Enable all log levels
      warn: true,
      error: true,
      debug: true
    },
    format: 'text',      // Human-readable format
    includeStack: true,
    includeContext: true
  },

  // Performance optimized for debugging
  performance: {
    adaptive: false,     // Disable adaptive behavior for consistency
    lowImpactMode: false,
    backgroundProcessing: true,
    throttling: {
      enabled: false     // Disable throttling for immediate feedback
    },
    caching: {
      ttl: 10000,        // Shorter cache for fresh data
      maxEntries: 100
    }
  },

  // Relaxed security for development
  security: {
    accessControl: {
      enabled: false,    // Disable access control
      authentication: false
    },
    validation: {
      enabled: true,
      maxInputLength: 50000, // Higher limits for development
      sanitizeInput: false   // Disable for easier debugging
    },
    encryption: {
      enabled: false     // Disable encryption in development
    }
  },

  // Development alerting
  alerting: {
    enabled: true,
    channels: {
      console: true,     // Console alerts for immediate feedback
      file: true,
      webhook: false,
      email: false
    },
    rules: [
      {
        name: 'memoryLeak',
        condition: 'leak.confidence > 0.5', // Lower threshold
        severity: 'medium',
        throttle: 60000    // 1 minute throttle
      },
      {
        name: 'highMemoryUsage',
        condition: 'heap > 0.8',
        severity: 'low',
        throttle: 120000   // 2 minutes
      }
    ]
  },

  // Streaming enabled for development
  streaming: {
    enabled: true,
    protocol: 'sse',
    heartbeat: 10000,    // More frequent heartbeat
    maxClients: 20,      // More clients for development
    authentication: false,
    compression: false   // Disable compression for debugging
  },

  // Dashboard enabled for development
  dashboard: {
    enabled: true,
    port: 3001,
    host: 'localhost',
    auth: null,          // No authentication in development
    cors: true,
    updateInterval: 2000, // More frequent updates
    historySize: 500     // More history for analysis
  },

  // Framework adapters with full tracking
  adapters: {
    express: {
      trackRoutes: true,
      trackMiddleware: true,
      trackMemoryPerRequest: true, // Enable for development debugging
      excludeRoutes: []            // Don't exclude routes in development
    },
    fastify: {
      trackHooks: true,
      trackPlugins: true,
      trackMemoryPerRequest: true
    },
    koa: {
      trackMiddleware: true,
      trackMemoryPerRequest: true
    },
    next: {
      trackPages: true,
      trackAPI: true,
      trackSSR: true,
      trackMemoryPerRequest: true
    }
  },

  // Verbose logging for development
  logging: {
    level: 'trace',      // Maximum verbosity
    console: true,
    file: './logs/sentinel-dev.log',
    format: 'text',
    colors: true,
    timestamp: true,
    rotation: false,     // Single file for easier debugging
    maxFileSize: 100 * 1024 * 1024 // 100MB
  },

  // Lenient error handling for development
  errorHandling: {
    exitOnUnhandled: false, // Don't exit on errors in development
    gracefulShutdownTimeout: 5000,
    logErrors: true,
    reportErrors: false,
    errorThreshold: 50,     // Higher threshold
    errorWindow: 300000,    // 5 minutes
    circuitBreaker: {
      threshold: 10,        // Higher threshold
      window: 60000,
      timeout: 30000        // Shorter timeout
    }
  },

  // Development feature flags
  features: {
    experimentalFeatures: true,  // Enable experimental features
    betaFeatures: true,          // Enable beta features
    legacySupport: true
  }
};
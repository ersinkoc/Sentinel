'use strict';

/**
 * Production configuration for Sentinel
 * Optimized for production environments with security and performance focus
 */
module.exports = {
  // Production-optimized monitoring
  monitoring: {
    interval: 60000,     // 1 minute for production
    detailed: false,     // Disable detailed monitoring for performance
    adaptiveInterval: true,
    minInterval: 30000,  // 30 seconds minimum
    maxInterval: 600000  // 10 minutes maximum
  },

  // Conservative thresholds for production
  threshold: {
    heap: 0.85,          // More conservative heap threshold
    rss: 0.9,
    growth: 0.05,        // Lower growth threshold for early detection
    gcFrequency: 15      // Higher GC frequency threshold
  },

  // Enhanced detection for production
  detection: {
    sensitivity: 'high',  // High sensitivity in production
    thresholds: {
      growth: 0.1,       // Lower growth threshold
      confidence: 0.8    // Higher confidence threshold
    }
  },

  // Limited analysis in production
  analysis: {
    heapSnapshots: false,     // Disable snapshots in production by default
    objectInspection: false,  // Disable deep inspection
    maxSnapshotSize: 50 * 1024 * 1024, // 50MB limit
    snapshotInterval: 900000  // 15 minutes
  },

  // Profiling disabled in production
  profiling: {
    enabled: false,      // Disable profiling in production
    sampling: false,
    allocation: false
  },

  // Production reporting
  reporting: {
    console: false,      // Disable console in production
    file: './logs/sentinel.log',
    levels: {
      info: false,       // Disable info logs
      warn: true,
      error: true,
      debug: false
    },
    format: 'json',      // JSON format for log aggregation
    includeStack: false  // Reduce log size
  },

  // Optimized performance for production
  performance: {
    lowImpactMode: true, // Enable low impact mode
    throttling: {
      maxConcurrent: 2,  // Reduce concurrent operations
      interval: 2000     // Increase throttling interval
    },
    caching: {
      ttl: 60000,        // Longer cache TTL
      maxEntries: 500    // Smaller cache for memory efficiency
    }
  },

  // Enhanced security for production
  security: {
    accessControl: {
      enabled: true,
      allowedOrigins: [], // Restrict origins in production
      maxRequestsPerMinute: 50,
      authentication: true
    },
    validation: {
      enabled: true,
      maxInputLength: 5000, // Stricter limits
      sanitizeInput: true
    },
    encryption: {
      enabled: true,
      keyRotation: true
    }
  },

  // Production alerting
  alerting: {
    enabled: true,
    channels: {
      console: false,
      file: true,
      webhook: true,     // Enable webhook alerts
      email: true        // Enable email alerts
    },
    rules: [
      {
        name: 'criticalMemoryUsage',
        condition: 'heap > 0.85',
        severity: 'critical',
        throttle: 180000   // 3 minutes
      },
      {
        name: 'memoryLeak',
        condition: 'leak.confidence > 0.9',
        severity: 'critical',
        throttle: 300000   // 5 minutes
      }
    ]
  },

  // Streaming disabled in production by default
  streaming: {
    enabled: false,
    maxClients: 5,       // Limit clients
    authentication: true
  },

  // Dashboard secured in production
  dashboard: {
    enabled: false,      // Disable dashboard in production
    auth: {
      required: true
    },
    cors: false          // Disable CORS in production
  },

  // Framework adapters optimized
  adapters: {
    express: {
      trackMemoryPerRequest: false, // Disable for performance
      excludeRoutes: ['/health', '/metrics', '/status', '/ping']
    },
    fastify: {
      trackPlugins: false
    },
    koa: {
      trackMemoryPerRequest: false
    },
    next: {
      trackMemoryPerRequest: false
    }
  },

  // Production logging
  logging: {
    level: 'warn',       // Only warnings and errors
    console: false,
    file: './logs/sentinel.log',
    format: 'json',
    colors: false,       // No colors in production logs
    rotation: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10
  },

  // Strict error handling
  errorHandling: {
    exitOnUnhandled: true,
    gracefulShutdownTimeout: 15000, // Longer timeout for cleanup
    reportErrors: true,
    errorThreshold: 5,   // Lower threshold
    errorWindow: 30000,  // Shorter window
    circuitBreaker: {
      threshold: 3,      // Lower threshold
      window: 60000      // Longer window
    }
  },

  // Production feature flags
  features: {
    experimentalFeatures: false,
    betaFeatures: false,
    legacySupport: false
  }
};
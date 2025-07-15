'use strict';

/**
 * Test configuration for Sentinel
 * Optimized for testing with minimal overhead and deterministic behavior
 */
module.exports = {
  // Fast monitoring for tests
  monitoring: {
    enabled: true,
    interval: 1000,      // 1 second for fast tests
    detailed: false,     // Minimal monitoring for performance
    gc: false,           // Disable GC monitoring in tests
    adaptiveInterval: false // Fixed interval for deterministic tests
  },

  // Relaxed thresholds for tests
  threshold: {
    heap: 0.95,          // Very high threshold to avoid interrupting tests
    rss: 0.95,
    growth: 0.5,         // High growth threshold
    gcFrequency: 100     // Very high frequency threshold
  },

  // Minimal detection for tests
  detection: {
    enabled: false,      // Disable leak detection in tests by default
    sensitivity: 'low',
    algorithms: {
      growth: false,
      retention: false,
      frequency: false,
      clustering: false
    }
  },

  // Minimal analysis for tests
  analysis: {
    enabled: false,      // Disable analysis in tests
    heapSnapshots: false,
    objectInspection: false,
    retainerAnalysis: false,
    autoCleanup: true
  },

  // No profiling in tests
  profiling: {
    enabled: false,      // Disable profiling in tests
    sampling: false,
    allocation: false
  },

  // Minimal reporting for tests
  reporting: {
    console: false,      // Quiet by default for clean test output
    file: null,          // No file logging in tests
    webhook: null,
    levels: {
      info: false,
      warn: false,
      error: true,       // Only show errors
      debug: false
    },
    format: 'text',
    includeStack: false, // Minimal output
    includeContext: false
  },

  // Fast performance for tests
  performance: {
    adaptive: false,     // Disable adaptive behavior
    lowImpactMode: true, // Minimal impact on tests
    backgroundProcessing: false, // Synchronous for deterministic tests
    throttling: {
      enabled: false     // No throttling in tests
    },
    caching: {
      enabled: false     // No caching for consistent test results
    }
  },

  // No security in tests
  security: {
    accessControl: {
      enabled: false     // Disable all security in tests
    },
    validation: {
      enabled: false,
      sanitizeInput: false
    },
    encryption: {
      enabled: false
    }
  },

  // No alerting in tests
  alerting: {
    enabled: false,      // Disable alerting in tests
    channels: {
      console: false,
      file: false,
      webhook: false,
      email: false
    },
    rules: []            // No alert rules
  },

  // No streaming in tests
  streaming: {
    enabled: false       // Disable streaming in tests
  },

  // No dashboard in tests
  dashboard: {
    enabled: false       // Disable dashboard in tests
  },

  // Minimal adapter tracking
  adapters: {
    express: {
      enabled: false,    // Disable adapters in tests by default
      trackRoutes: false,
      trackMiddleware: false,
      trackMemoryPerRequest: false
    },
    fastify: {
      enabled: false,
      trackHooks: false,
      trackPlugins: false
    },
    koa: {
      enabled: false,
      trackMiddleware: false
    },
    next: {
      enabled: false,
      trackPages: false,
      trackAPI: false,
      trackSSR: false
    }
  },

  // Minimal logging for tests
  logging: {
    level: 'error',      // Only errors
    console: false,      // Quiet console
    file: null,          // No file logging
    format: 'text',
    colors: false,       // No colors in test logs
    timestamp: false,    // No timestamps for cleaner output
    rotation: false
  },

  // Lenient error handling for tests
  errorHandling: {
    exitOnUnhandled: false, // Don't exit during tests
    gracefulShutdownTimeout: 1000, // Fast shutdown
    logErrors: false,       // Don't log errors in tests
    reportErrors: false,
    errorThreshold: 1000,   // Very high threshold
    errorWindow: 10000,     // Short window
    circuitBreaker: {
      threshold: 100,       // Very high threshold
      window: 5000,
      timeout: 1000
    }
  },

  // Test environment
  environment: 'test',

  // Disable all features for clean tests
  features: {
    experimentalFeatures: false,
    betaFeatures: false,
    legacySupport: false
  }
};
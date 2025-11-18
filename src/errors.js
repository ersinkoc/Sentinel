'use strict';

/**
 * Custom error classes for Sentinel
 * Provides specific error types for better error handling and debugging
 */

/**
 * Base Sentinel error class
 */
class SentinelError extends Error {
  constructor(message, code = 'SENTINEL_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Configuration related errors
 */
class ConfigurationError extends SentinelError {
  constructor(message, invalidFields = [], details = {}) {
    super(message, 'INVALID_CONFIG', { invalidFields, ...details });
    this.invalidFields = invalidFields;
  }
}

/**
 * Monitoring system errors
 */
class MonitoringError extends SentinelError {
  constructor(message, monitorType = 'unknown', details = {}) {
    super(message, 'MONITORING_ERROR', { monitorType, ...details });
    this.monitorType = monitorType;
  }
}

/**
 * Memory detection errors
 */
class DetectionError extends SentinelError {
  constructor(message, detectionType = 'unknown', details = {}) {
    super(message, 'DETECTION_ERROR', { detectionType, ...details });
    this.detectionType = detectionType;
  }
}

/**
 * Analysis errors
 */
class AnalysisError extends SentinelError {
  constructor(message, analysisType = 'unknown', details = {}) {
    super(message, 'ANALYSIS_ERROR', { analysisType, ...details });
    this.analysisType = analysisType;
  }
}

/**
 * Profiling errors
 */
class ProfilingError extends SentinelError {
  constructor(message, profilingType = 'unknown', details = {}) {
    super(message, 'PROFILING_ERROR', { profilingType, ...details });
    this.profilingType = profilingType;
  }
}

/**
 * Reporting errors
 */
class ReportingError extends SentinelError {
  constructor(message, reportingChannel = 'unknown', details = {}) {
    super(message, 'REPORTING_ERROR', { reportingChannel, ...details });
    this.reportingChannel = reportingChannel;
  }
}

/**
 * Resource errors (file system, network, etc.)
 */
class ResourceError extends SentinelError {
  constructor(message, resourceType = 'unknown', resourcePath = null, details = {}) {
    super(message, 'RESOURCE_ERROR', { resourceType, resourcePath, ...details });
    this.resourceType = resourceType;
    this.resourcePath = resourcePath;
  }
}

/**
 * Runtime state errors
 */
class StateError extends SentinelError {
  constructor(message, currentState = 'unknown', expectedState = 'unknown', details = {}) {
    super(message, 'STATE_ERROR', { currentState, expectedState, ...details });
    this.currentState = currentState;
    this.expectedState = expectedState;
  }
}

/**
 * Security related errors
 */
class SecurityError extends SentinelError {
  constructor(message, securityType = 'unknown', details = {}) {
    super(message, 'SECURITY_ERROR', { securityType, ...details });
    this.securityType = securityType;
  }
}

/**
 * Performance threshold errors
 */
class PerformanceError extends SentinelError {
  constructor(message, metric = 'unknown', threshold = null, actual = null, details = {}) {
    super(message, 'PERFORMANCE_ERROR', { metric, threshold, actual, ...details });
    this.metric = metric;
    this.threshold = threshold;
    this.actual = actual;
  }
}

/**
 * Error factory for creating appropriate error types
 */
class ErrorFactory {
  static create(type, message, ...args) {
    const errorClasses = {
      configuration: ConfigurationError,
      monitoring: MonitoringError,
      detection: DetectionError,
      analysis: AnalysisError,
      profiling: ProfilingError,
      reporting: ReportingError,
      resource: ResourceError,
      state: StateError,
      security: SecurityError,
      performance: PerformanceError
    };

    const ErrorClass = errorClasses[type] || SentinelError;
    return new ErrorClass(message, ...args);
  }

  static wrap(error, type, context = {}) {
    if (error instanceof SentinelError) {
      return error;
    }

    const message = `${type}: ${error.message}`;
    const details = { originalError: error.message, ...context };
    
    // Create error with appropriate parameters for each type
    switch (type) {
    case 'configuration':
      return new ConfigurationError(message, [], details);
    case 'monitoring':
      return new MonitoringError(message, 'wrapped', details);
    case 'detection':
      return new DetectionError(message, 'wrapped', details);
    case 'analysis':
      return new AnalysisError(message, 'wrapped', details);
    case 'profiling':
      return new ProfilingError(message, 'wrapped', details);
    case 'reporting':
      return new ReportingError(message, 'wrapped', details);
    case 'resource':
      return new ResourceError(message, 'wrapped', null, details);
    case 'state':
      return new StateError(message, 'wrapped', 'unknown', details);
    case 'security':
      return new SecurityError(message, 'wrapped', details);
    case 'performance':
      return new PerformanceError(message, 'wrapped', null, null, details);
    default:
      return new SentinelError(message, `${type.toUpperCase()}_ERROR`, details);
    }
  }
}

/**
 * Error handler for consistent error processing
 */
class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      logErrors: options.logErrors !== false,
      throwOnCritical: options.throwOnCritical !== false,
      maxStackSize: options.maxStackSize || 10,
      ...options
    };
    
    this.errorHistory = [];
  }

  handle(error, context = {}) {
    // Ensure we have a SentinelError
    const sentinelError = error instanceof SentinelError 
      ? error 
      : ErrorFactory.wrap(error, 'unknown', context);

    // Add to history
    this.addToHistory(sentinelError, context);

    // Log if enabled
    if (this.options.logErrors) {
      this.logError(sentinelError, context);
    }

    // Check if critical
    if (this.isCritical(sentinelError) && this.options.throwOnCritical) {
      throw sentinelError;
    }

    return sentinelError;
  }

  addToHistory(error, context) {
    this.errorHistory.unshift({
      error: error.toJSON(),
      context,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.errorHistory.length > this.options.maxStackSize) {
      this.errorHistory = this.errorHistory.slice(0, this.options.maxStackSize);
    }
  }

  logError(error, context) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: error.toJSON(),
      context,
      pid: process.pid,
      memory: process.memoryUsage()
    };

    console.error('[Sentinel Error]', JSON.stringify(logData, null, 2));
  }

  isCritical(error) {
    const criticalCodes = [
      'HEAP_SNAPSHOT_FAILED',
      'MONITORING_SYSTEM_FAILURE',
      'MEMORY_EXHAUSTION',
      'SECURITY_VIOLATION'
    ];

    return criticalCodes.includes(error.code) || 
           error instanceof SecurityError ||
           (error instanceof ResourceError && error.resourceType === 'memory');
  }

  getErrorHistory() {
    return [...this.errorHistory];
  }

  clearHistory() {
    this.errorHistory = [];
  }

  getErrorStats() {
    const stats = {};
    
    this.errorHistory.forEach(({ error }) => {
      const type = error.name;
      stats[type] = (stats[type] || 0) + 1;
    });

    return stats;
  }
}

/**
 * Circuit breaker for preventing cascading failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000,
      monitorWindow: options.monitorWindow || 120000,
      ...options
    };

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = [];
    this.lastFailure = null;
    this.nextAttempt = null;
  }

  async execute(operation, _context = {}) {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new StateError(
          'Circuit breaker is OPEN - operation blocked',
          'OPEN',
          'CLOSED',
          { nextAttempt: this.nextAttempt }
        );
      } else {
        // Atomic transition: only first caller transitions to HALF_OPEN
        // Use a simple flag to prevent race conditions
        if (this.state === 'OPEN') {
          this.state = 'HALF_OPEN';
        } else if (this.state === 'HALF_OPEN') {
          // Another concurrent operation already transitioned - block this one
          throw new StateError(
            'Circuit breaker is in HALF_OPEN state - test in progress',
            'HALF_OPEN',
            'CLOSED',
            { nextAttempt: this.nextAttempt }
          );
        }
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error, _context);
      throw error;
    }
  }

  onSuccess() {
    this.failures = [];
    this.state = 'CLOSED';
    this.nextAttempt = null;
  }

  onFailure(error, context) {
    this.failures.push({
      timestamp: Date.now(),
      error: error.message,
      context
    });

    this.lastFailure = Date.now();

    // Remove old failures outside monitor window
    const cutoff = Date.now() - this.options.monitorWindow;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);

    // Check if we should open the circuit
    if (this.failures.length >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeout;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures.length,
      lastFailure: this.lastFailure,
      nextAttempt: this.nextAttempt
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.lastFailure = null;
    this.nextAttempt = null;
  }
}

/**
 * Retry mechanism with exponential backoff
 */
class RetryManager {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffFactor: options.backoffFactor || 2,
      retryableErrors: options.retryableErrors || [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'RESOURCE_TEMPORARILY_UNAVAILABLE'
      ],
      ...options
    };
  }

  async execute(operation, _context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on the last attempt or non-retryable errors
        if (attempt === this.options.maxRetries || !this.isRetryable(error)) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    if (error instanceof SentinelError) {
      return this.options.retryableErrors.includes(error.code);
    }
    
    // Common retryable error patterns
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('network') ||
           message.includes('temporarily');
  }

  calculateDelay(attempt) {
    const delay = this.options.baseDelay * Math.pow(this.options.backoffFactor, attempt);
    return Math.min(delay, this.options.maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  SentinelError,
  ConfigurationError,
  MonitoringError,
  DetectionError,
  AnalysisError,
  ProfilingError,
  ReportingError,
  ResourceError,
  StateError,
  SecurityError,
  PerformanceError,
  ErrorFactory,
  ErrorHandler,
  CircuitBreaker,
  RetryManager
};
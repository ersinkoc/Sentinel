'use strict';

const { ConfigurationError, SecurityError } = require('./errors');

function validateConfig(config) {
  const errors = [];
  const securityIssues = [];
  
  try {
    // Basic type validation
    if (config === null || typeof config !== 'object') {
      throw new ConfigurationError('Configuration must be an object', ['root']);
    }

    // Monitoring configuration validation
    if (config.monitoring !== undefined) {
      validateMonitoringConfig(config.monitoring, errors);
    }

    // Detection configuration validation  
    if (config.detection !== undefined) {
      validateDetectionConfig(config.detection, errors);
    }

    // Threshold validation
    if (config.threshold !== undefined) {
      validateThresholdConfig(config.threshold, errors);
    }

    // Profiling validation
    if (config.profiling !== undefined) {
      validateProfilingConfig(config.profiling, errors);
    }

    // Reporting validation
    if (config.reporting !== undefined) {
      validateReportingConfig(config.reporting, errors, securityIssues);
    }

    // Framework validation
    if (config.framework !== undefined) {
      validateFrameworkConfig(config.framework, errors);
    }

    // Legacy field validation (for backward compatibility)
    validateLegacyFields(config, errors);

    // Security validation
    if (securityIssues.length > 0) {
      throw new SecurityError(
        `Security issues found in configuration: ${securityIssues.join(', ')}`,
        'configuration',
        { issues: securityIssues }
      );
    }

    if (errors.length > 0) {
      throw new ConfigurationError(
        `Invalid configuration: ${errors.join(', ')}`,
        errors
      );
    }

    return true;

  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof SecurityError) {
      throw error;
    }

    throw new ConfigurationError(
      `Configuration validation failed: ${error.message}`,
      ['validation'],
      { originalError: error.message }
    );
  }
}

function validateMonitoringConfig(monitoring, errors) {
  if (typeof monitoring !== 'object' || monitoring === null) {
    errors.push('monitoring must be an object');
    return;
  }

  if (monitoring.interval !== undefined) {
    if (typeof monitoring.interval !== 'number' || monitoring.interval < 1000 || monitoring.interval > 300000) {
      errors.push('monitoring.interval must be a number between 1000 and 300000 milliseconds');
    }
  }

  if (monitoring.detailed !== undefined && typeof monitoring.detailed !== 'boolean') {
    errors.push('monitoring.detailed must be a boolean');
  }

  if (monitoring.gc !== undefined && typeof monitoring.gc !== 'boolean') {
    errors.push('monitoring.gc must be a boolean');
  }

  if (monitoring.processes !== undefined && typeof monitoring.processes !== 'boolean') {
    errors.push('monitoring.processes must be a boolean');
  }
}

function validateDetectionConfig(detection, errors) {
  if (typeof detection !== 'object' || detection === null) {
    errors.push('detection must be an object');
    return;
  }

  if (detection.enabled !== undefined && typeof detection.enabled !== 'boolean') {
    errors.push('detection.enabled must be a boolean');
  }

  if (detection.sensitivity !== undefined) {
    if (!['low', 'medium', 'high'].includes(detection.sensitivity)) {
      errors.push('detection.sensitivity must be one of: low, medium, high');
    }
  }

  if (detection.algorithms !== undefined) {
    if (!Array.isArray(detection.algorithms)) {
      errors.push('detection.algorithms must be an array');
    } else {
      const validAlgorithms = ['rapid-growth', 'steady-growth', 'gc-pressure', 'sawtooth-pattern'];
      const invalidAlgorithms = detection.algorithms.filter(alg => !validAlgorithms.includes(alg));
      if (invalidAlgorithms.length > 0) {
        errors.push(`detection.algorithms contains invalid algorithms: ${invalidAlgorithms.join(', ')}`);
      }
    }
  }

  if (detection.baseline !== undefined) {
    validateBaselineConfig(detection.baseline, errors);
  }
}

function validateThresholdConfig(threshold, errors) {
  if (typeof threshold !== 'object' || threshold === null) {
    errors.push('threshold must be an object');
    return;
  }

  if (threshold.heap !== undefined) {
    if (typeof threshold.heap !== 'number' || threshold.heap < 0 || threshold.heap > 1) {
      errors.push('threshold.heap must be a number between 0 and 1');
    }
  }

  if (threshold.growth !== undefined) {
    if (typeof threshold.growth !== 'number' || threshold.growth < 0 || threshold.growth > 10) {
      errors.push('threshold.growth must be a number between 0 and 10');
    }
  }

  if (threshold.gc !== undefined) {
    validateGCThresholdConfig(threshold.gc, errors);
  }
}

function validateGCThresholdConfig(gc, errors) {
  if (typeof gc !== 'object' || gc === null) {
    errors.push('threshold.gc must be an object');
    return;
  }

  if (gc.frequency !== undefined) {
    if (typeof gc.frequency !== 'number' || gc.frequency < 1 || gc.frequency > 100) {
      errors.push('threshold.gc.frequency must be a number between 1 and 100');
    }
  }

  if (gc.duration !== undefined) {
    if (typeof gc.duration !== 'number' || gc.duration < 1 || gc.duration > 10000) {
      errors.push('threshold.gc.duration must be a number between 1 and 10000 milliseconds');
    }
  }
}

function validateProfilingConfig(profiling, errors) {
  if (typeof profiling !== 'object' || profiling === null) {
    errors.push('profiling must be an object');
    return;
  }

  if (profiling.enabled !== undefined && typeof profiling.enabled !== 'boolean') {
    errors.push('profiling.enabled must be a boolean');
  }

  if (profiling.heapSnapshots !== undefined && typeof profiling.heapSnapshots !== 'boolean') {
    errors.push('profiling.heapSnapshots must be a boolean');
  }

  if (profiling.samplingInterval !== undefined) {
    if (typeof profiling.samplingInterval !== 'number' || profiling.samplingInterval < 100 || profiling.samplingInterval > 100000) {
      errors.push('profiling.samplingInterval must be a number between 100 and 100000 microseconds');
    }
  }
}

function validateReportingConfig(reporting, errors, securityIssues) {
  if (typeof reporting !== 'object' || reporting === null) {
    errors.push('reporting must be an object');
    return;
  }

  if (reporting.console !== undefined && typeof reporting.console !== 'boolean') {
    errors.push('reporting.console must be a boolean');
  }

  if (reporting.webhook !== undefined && reporting.webhook !== null) {
    if (typeof reporting.webhook !== 'string') {
      errors.push('reporting.webhook must be a string');
    } else {
      validateWebhookURL(reporting.webhook, securityIssues);
    }
  }

  if (reporting.file !== undefined && reporting.file !== null) {
    if (typeof reporting.file !== 'string') {
      errors.push('reporting.file must be a string');
    } else {
      validateFilePath(reporting.file, securityIssues);
    }
  }

  if (reporting.format !== undefined) {
    if (!['json', 'text'].includes(reporting.format)) {
      errors.push('reporting.format must be either "json" or "text"');
    }
  }
}

function validateFrameworkConfig(framework, errors) {
  if (typeof framework !== 'object' || framework === null) {
    errors.push('framework must be an object');
    return;
  }

  if (framework.auto !== undefined && typeof framework.auto !== 'boolean') {
    errors.push('framework.auto must be a boolean');
  }

  if (framework.type !== undefined) {
    const validTypes = ['express', 'fastify', 'koa', 'nextjs'];
    if (!validTypes.includes(framework.type)) {
      errors.push(`framework.type must be one of: ${validTypes.join(', ')}`);
    }
  }
}

function validateBaselineConfig(baseline, errors) {
  if (typeof baseline !== 'object' || baseline === null) {
    errors.push('detection.baseline must be an object');
    return;
  }

  if (baseline.samples !== undefined) {
    if (typeof baseline.samples !== 'number' || baseline.samples < 3 || baseline.samples > 100) {
      errors.push('detection.baseline.samples must be a number between 3 and 100');
    }
  }

  if (baseline.stabilization !== undefined) {
    if (typeof baseline.stabilization !== 'number' || baseline.stabilization < 10000 || baseline.stabilization > 1800000) {
      errors.push('detection.baseline.stabilization must be a number between 10000 and 1800000 milliseconds');
    }
  }
}

function validateLegacyFields(config, errors) {
  // Handle legacy interval field
  if (config.interval !== undefined) {
    if (typeof config.interval !== 'number' || config.interval < 1000 || config.interval > 300000) {
      errors.push('interval must be a number between 1000 and 300000 milliseconds');
    }
  }

  // Warn about deprecated fields
  const deprecatedFields = ['enabled', 'production'];
  deprecatedFields.forEach(field => {
    if (config[field] !== undefined) {
      console.warn(`[Sentinel] Warning: Configuration field "${field}" is deprecated`);
    }
  });
}

function validateWebhookURL(url, securityIssues) {
  try {
    const { URL } = require('url');
    const parsedURL = new URL(url);
    
    // Security checks
    if (parsedURL.protocol !== 'https:' && parsedURL.protocol !== 'http:') {
      securityIssues.push('webhook URL must use HTTP or HTTPS protocol');
    }
    
    if (parsedURL.hostname === 'localhost' || parsedURL.hostname === '127.0.0.1' || parsedURL.hostname === '::1') {
      securityIssues.push('webhook URL should not point to localhost in production');
    }

    // Check for all private IP ranges (RFC 1918 and link-local)
    const hostname = parsedURL.hostname;
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^127\./, // 127.0.0.0/8 (loopback)
      /^fc00:/i, // IPv6 unique local address
      /^fe80:/i  // IPv6 link-local
    ];

    if (privateRanges.some(pattern => pattern.test(hostname))) {
      securityIssues.push('webhook URL should not point to private network ranges');
    }
    
    if (parsedURL.port && (parsedURL.port === '22' || parsedURL.port === '23' || parsedURL.port === '3389')) {
      securityIssues.push('webhook URL should not target administrative ports');
    }
    
  } catch {
    securityIssues.push('webhook URL is not valid');
  }
}

function validateFilePath(filePath, securityIssues) {
  // Check for path traversal attempts
  if (filePath.includes('..') || filePath.includes('~')) {
    securityIssues.push('file path contains potentially dangerous patterns');
  }
  
  // Check for absolute paths to sensitive directories
  const sensitivePaths = ['/etc/', '/root/', '/sys/', '/proc/', 'C:\\Windows\\', 'C:\\Users\\'];
  if (sensitivePaths.some(sensitive => filePath.startsWith(sensitive))) {
    securityIssues.push('file path points to sensitive system directory');
  }
}

function mergeConfig(defaultConfig, userConfig) {
  // First merge, then validate the complete config
  const merged = _deepMerge(defaultConfig, userConfig);
  validateConfig(merged);
  return merged;
}

function _deepMerge(defaultConfig, userConfig) {
  const merged = { ...defaultConfig };
  
  for (const key in userConfig) {
    if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
      if (typeof userConfig[key] === 'object' && userConfig[key] !== null && !Array.isArray(userConfig[key])) {
        merged[key] = _deepMerge(defaultConfig[key] || {}, userConfig[key]);
      } else {
        merged[key] = userConfig[key];
      }
    }
  }
  
  return merged;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function debounce(func, wait) {
  let timeout;
  
  return function debounced(...args) {
    const context = this;
    
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  let lastFunc;
  let lastTime;
  
  return function throttled(...args) {
    const context = this;
    
    if (!inThrottle) {
      func.apply(context, args);
      lastTime = Date.now();
      inThrottle = true;
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastTime >= limit) {
          func.apply(context, args);
          lastTime = Date.now();
        }
      }, limit - (Date.now() - lastTime));
    }
  };
}

class CircularBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size);
    this.pointer = 0;
    this.count = 0;
  }
  
  push(item) {
    this.buffer[this.pointer] = item;
    this.pointer = (this.pointer + 1) % this.size;
    if (this.count < this.size) {
      this.count++;
    }
  }
  
  toArray() {
    if (this.count < this.size) {
      return this.buffer.slice(0, this.count);
    }
    
    return [
      ...this.buffer.slice(this.pointer),
      ...this.buffer.slice(0, this.pointer)
    ];
  }
  
  clear() {
    this.buffer = new Array(this.size);
    this.pointer = 0;
    this.count = 0;
  }
  
  get length() {
    return this.count;
  }
}

class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }
  
  canMakeRequest() {
    const now = Date.now();
    
    // Remove old requests outside the time window
    this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindow);
    
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }
  
  reset() {
    this.requests = [];
  }
}

function parseSize(sizeStr) {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  
  const multipliers = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024
  };
  
  return value * (multipliers[unit] || 1);
}

function isPromise(obj) {
  return obj && typeof obj.then === 'function';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced error handling utilities
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return String(input).slice(0, maxLength);
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .slice(0, maxLength);
}

function isValidNumber(value, min = -Infinity, max = Infinity) {
  return typeof value === 'number' && 
         !isNaN(value) && 
         isFinite(value) && 
         value >= min && 
         value <= max;
}

function clampNumber(value, min, max) {
  if (!isValidNumber(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

function getSystemLimits() {
  try {
    const os = require('os');
    return {
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuCount: os.cpus().length,
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version
    };
  } catch {
    return {
      totalMemory: 0,
      freeMemory: 0,
      cpuCount: 1,
      platform: 'unknown',
      arch: 'unknown',
      nodeVersion: process.version || 'unknown'
    };
  }
}

function detectEnvironment() {
  const env = {
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
    isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
    isContainer: Boolean(process.env.KUBERNETES_SERVICE_HOST || process.env.DOCKER_CONTAINER),
    isCluster: require('cluster').isWorker,
    hasInspector: Boolean(process.env.NODE_OPTIONS?.includes('--inspect')),
    platform: process.platform,
    nodeVersion: process.version
  };
  
  return env;
}

function createSafeTimer(callback, interval, maxExecutions = Infinity) {
  let executions = 0;
  let timerId;
  
  const safeCallback = () => {
    try {
      if (executions < maxExecutions) {
        callback();
        executions++;
        
        if (executions < maxExecutions) {
          timerId = setTimeout(safeCallback, interval);
        }
      }
    } catch (error) {
      console.error('[Sentinel Timer Error]', error);
      // Continue timer even if callback fails
      if (executions < maxExecutions) {
        timerId = setTimeout(safeCallback, interval);
      }
    }
  };
  
  timerId = setTimeout(safeCallback, interval);
  
  return {
    clear: () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    getExecutions: () => executions
  };
}

function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function createResourcePool(createResource, destroyResource, maxSize = 10) {
  const pool = [];
  const inUse = new Set();
  
  return {
    async acquire() {
      if (pool.length > 0) {
        const resource = pool.pop();
        inUse.add(resource);
        return resource;
      }
      
      if (inUse.size < maxSize) {
        const resource = await createResource();
        inUse.add(resource);
        return resource;
      }
      
      throw new Error('Resource pool exhausted');
    },
    
    release(resource) {
      if (inUse.has(resource)) {
        inUse.delete(resource);
        pool.push(resource);
      }
    },
    
    async destroy() {
      for (const resource of [...pool, ...inUse]) {
        try {
          await destroyResource(resource);
        } catch (error) {
          console.error('Error destroying resource:', error);
        }
      }
      pool.length = 0;
      inUse.clear();
    },
    
    stats() {
      return {
        available: pool.length,
        inUse: inUse.size,
        total: pool.length + inUse.size
      };
    }
  };
}

// Memory-safe string operations
function truncateString(str, maxLength, suffix = '...') {
  if (typeof str !== 'string') {
    str = String(str);
  }
  
  if (str.length <= maxLength) {
    return str;
  }
  
  return str.slice(0, maxLength - suffix.length) + suffix;
}

function safeStringify(obj, maxDepth = 3, maxLength = 10000) {
  const seen = new WeakSet();
  
  const stringify = (value, depth = 0) => {
    if (depth > maxDepth) {
      return '[Max Depth Reached]';
    }
    
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    const type = typeof value;
    
    if (type === 'string') {
      return truncateString(JSON.stringify(value), maxLength / 4);
    }
    
    if (type === 'number' || type === 'boolean') {
      return String(value);
    }
    
    if (type === 'function') {
      return '[Function]';
    }
    
    if (type === 'object') {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      
      seen.add(value);
      
      try {
        if (Array.isArray(value)) {
          const items = value.slice(0, 10).map(item => stringify(item, depth + 1));
          if (value.length > 10) items.push(`... ${value.length - 10} more items`);
          return `[${items.join(', ')}]`;
        }
        
        const entries = Object.entries(value).slice(0, 10);
        const props = entries.map(([key, val]) => 
          `"${key}": ${stringify(val, depth + 1)}`
        );
        
        if (Object.keys(value).length > 10) {
          props.push(`... ${Object.keys(value).length - 10} more properties`);
        }
        
        return `{${props.join(', ')}}`;
      } finally {
        seen.delete(value);
      }
    }
    
    return '[Unknown Type]';
  };
  
  return truncateString(stringify(obj), maxLength);
}

module.exports = {
  validateConfig,
  mergeConfig,
  formatBytes,
  formatDuration,
  debounce,
  throttle,
  CircularBuffer,
  RateLimiter,
  parseSize,
  isPromise,
  sleep,
  safeJsonParse,
  safeJsonStringify,
  sanitizeInput,
  isValidNumber,
  clampNumber,
  deepClone,
  getSystemLimits,
  detectEnvironment,
  createSafeTimer,
  withTimeout,
  createResourcePool,
  truncateString,
  safeStringify
};
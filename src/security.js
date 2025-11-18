'use strict';

const crypto = require('crypto');
const EventEmitter = require('events');
const { URL } = require('url');
const { 
  SecurityError, 
  ConfigurationError
} = require('./errors');
const { 
  detectEnvironment,
  getSystemLimits,
  safeStringify 
} = require('./utils');

/**
 * Security and validation module for Sentinel
 * Provides comprehensive security features including input validation,
 * access control, audit logging, and threat detection
 */
class SecurityManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Access control settings
      accessControl: {
        enabled: config.accessControl?.enabled !== false,
        requireAuth: config.accessControl?.requireAuth || false,
        allowedOrigins: config.accessControl?.allowedOrigins || ['localhost'],
        maxRequestsPerMinute: config.accessControl?.maxRequestsPerMinute || 100,
        blacklist: config.accessControl?.blacklist || [],
        whitelist: config.accessControl?.whitelist || []
      },
      
      // Input validation settings
      validation: {
        maxInputLength: config.validation?.maxInputLength || 10000,
        allowedChars: config.validation?.allowedChars || /^[a-zA-Z0-9\s\-_.,;:!?@#$%^&*()[\]{}|\\+=<>/~`'"]*$/,
        sanitizeHtml: config.validation?.sanitizeHtml !== false,
        validateUrls: config.validation?.validateUrls !== false,
        maxDepth: config.validation?.maxDepth || 10
      },
      
      // Audit logging settings
      audit: {
        enabled: config.audit?.enabled !== false,
        logLevel: config.audit?.logLevel || 'info', // 'debug', 'info', 'warn', 'error'
        maxLogSize: config.audit?.maxLogSize || 10 * 1024 * 1024, // 10MB
        retentionDays: config.audit?.retentionDays || 30,
        logSensitiveData: config.audit?.logSensitiveData || false
      },
      
      // Threat detection settings
      threatDetection: {
        enabled: config.threatDetection?.enabled !== false,
        suspiciousPatterns: config.threatDetection?.suspiciousPatterns || [
          /eval\s*\(/i,
          /function\s*\(\s*\)\s*{/i,
          /<script/i,
          /javascript:/i,
          /data:.*base64/i,
          /\.\./,
          /\/etc\/passwd/i,
          /proc\/self/i
        ],
        maxFailedAttempts: config.threatDetection?.maxFailedAttempts || 5,
        blockDuration: config.threatDetection?.blockDuration || 300000, // 5 minutes
        rateLimitWindow: config.threatDetection?.rateLimitWindow || 60000 // 1 minute
      },
      
      // Encryption settings
      encryption: {
        algorithm: config.encryption?.algorithm || 'aes-256-gcm',
        keyDerivation: config.encryption?.keyDerivation || 'pbkdf2',
        iterations: config.encryption?.iterations || 100000,
        saltLength: config.encryption?.saltLength || 32,
        ivLength: config.encryption?.ivLength || 16
      },
      
      // Security headers
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': 'default-src \'self\'',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    };
    
    this.state = {
      sessions: new Map(),
      blockedIPs: new Map(),
      rateLimits: new Map(),
      auditLog: [],
      threatEvents: [],
      lastCleanup: Date.now()
    };
    
    this.environment = detectEnvironment();
    this.systemLimits = getSystemLimits();
    
    this._setupCleanupTimer();
    this._initializeSecurity();
  }
  
  _initializeSecurity() {
    // Validate security configuration
    this._validateSecurityConfig();
    
    // Setup security event handlers
    this.on('security-violation', (event) => this._handleSecurityViolation(event));
    this.on('suspicious-activity', (event) => this._handleSuspiciousActivity(event));
    this.on('access-denied', (event) => this._logAccessDenied(event));
    
    this.emit('security-initialized', {
      environment: this.environment,
      config: this._getSafeConfig()
    });
  }
  
  _validateSecurityConfig() {
    const errors = [];
    
    if (this.config.accessControl.maxRequestsPerMinute < 1 || this.config.accessControl.maxRequestsPerMinute > 10000) {
      errors.push('maxRequestsPerMinute must be between 1 and 10000');
    }
    
    if (this.config.validation.maxInputLength < 100 || this.config.validation.maxInputLength > 100000) {
      errors.push('maxInputLength must be between 100 and 100000');
    }
    
    if (this.config.threatDetection.maxFailedAttempts < 1 || this.config.threatDetection.maxFailedAttempts > 100) {
      errors.push('maxFailedAttempts must be between 1 and 100');
    }
    
    if (errors.length > 0) {
      throw new ConfigurationError(
        `Security configuration validation failed: ${errors.join(', ')}`,
        errors
      );
    }
  }
  
  _setupCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpiredData();
    }, 60000); // Cleanup every minute
  }
  
  _cleanupExpiredData() {
    const now = Date.now();
    
    // Cleanup expired blocked IPs
    for (const [ip, blockData] of this.state.blockedIPs.entries()) {
      if (now - blockData.timestamp > this.config.threatDetection.blockDuration) {
        this.state.blockedIPs.delete(ip);
      }
    }
    
    // Cleanup expired rate limits
    for (const [key, limitData] of this.state.rateLimits.entries()) {
      if (now - limitData.windowStart > this.config.threatDetection.rateLimitWindow) {
        this.state.rateLimits.delete(key);
      }
    }
    
    // Cleanup old audit logs
    const retentionPeriod = this.config.audit.retentionDays * 24 * 60 * 60 * 1000;
    this.state.auditLog = this.state.auditLog.filter(
      log => now - log.timestamp < retentionPeriod
    );
    
    // Cleanup old threat events
    this.state.threatEvents = this.state.threatEvents.filter(
      event => now - event.timestamp < retentionPeriod
    );
    
    this.state.lastCleanup = now;
  }
  
  /**
   * Input validation and sanitization
   */
  validateInput(input, options = {}) {
    try {
      if (input === null || input === undefined) {
        if (options.required) {
          throw new SecurityError(
            'Required input is missing',
            'validation',
            { inputType: options.type || 'unknown' }
          );
        }
        return null;
      }
      
      // Convert to string for validation
      const inputStr = String(input);
      
      // Check length
      if (inputStr.length > this.config.validation.maxInputLength) {
        throw new SecurityError(
          `Input length exceeds maximum allowed (${this.config.validation.maxInputLength})`,
          'validation',
          { actualLength: inputStr.length, maxLength: this.config.validation.maxInputLength }
        );
      }
      
      // Check for suspicious patterns
      this._checkSuspiciousPatterns(inputStr);
      
      // Validate specific types
      if (options.type) {
        this._validateInputType(inputStr, options.type, options);
      }
      
      // Sanitize input
      const sanitized = this._sanitizeInput(inputStr, options);
      
      this._logAudit('input-validated', {
        type: options.type || 'generic',
        length: inputStr.length,
        sanitized: sanitized !== inputStr
      });
      
      return sanitized;
      
    } catch (error) {
      this._logAudit('input-validation-failed', {
        error: error.message,
        inputLength: String(input).length,
        type: options.type || 'generic'
      });
      
      if (error instanceof SecurityError) {
        throw error;
      }
      
      throw new SecurityError(
        `Input validation failed: ${error.message}`,
        'validation',
        { originalError: error.message }
      );
    }
  }
  
  _checkSuspiciousPatterns(input) {
    for (const pattern of this.config.threatDetection.suspiciousPatterns) {
      if (pattern.test(input)) {
        const violation = {
          type: 'suspicious-pattern',
          pattern: pattern.toString(),
          input: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
          timestamp: Date.now()
        };
        
        this.emit('suspicious-activity', violation);
        
        throw new SecurityError(
          'Input contains suspicious patterns',
          'validation',
          { pattern: pattern.toString() }
        );
      }
    }
  }
  
  _validateInputType(input, type, options) {
    switch (type) {
    case 'number': {
      const num = Number(input);
      if (isNaN(num) || !isFinite(num)) {
        throw new SecurityError('Invalid number format', 'validation');
      }
      if (options.min !== undefined && num < options.min) {
        throw new SecurityError(`Number below minimum (${options.min})`, 'validation');
      }
      if (options.max !== undefined && num > options.max) {
        throw new SecurityError(`Number above maximum (${options.max})`, 'validation');
      }
      break;
    }
        
    case 'email': {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(input)) {
        throw new SecurityError('Invalid email format', 'validation');
      }
      break;
    }
        
    case 'url':
      if (this.config.validation.validateUrls) {
        this._validateUrl(input);
      }
      break;
        
    case 'path':
      this._validatePath(input);
      break;
        
    case 'json':
      try {
        JSON.parse(input);
      } catch {
        throw new SecurityError('Invalid JSON format', 'validation');
      }
      break;
        
    case 'alphanumeric':
      if (!/^[a-zA-Z0-9]+$/.test(input)) {
        throw new SecurityError('Input must be alphanumeric', 'validation');
      }
      break;
        
    default:
      // Generic pattern validation
      if (!this.config.validation.allowedChars.test(input)) {
        throw new SecurityError('Input contains invalid characters', 'validation');
      }
    }
  }
  
  _validateUrl(url) {
    try {
      const parsed = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new SecurityError('URL must use HTTP or HTTPS protocol', 'validation');
      }
      
      // Check for dangerous patterns
      const dangerousPatterns = [
        /^javascript:/i,
        /^data:/i,
        /^file:/i,
        /^ftp:/i
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(url)) {
          throw new SecurityError('URL uses dangerous protocol', 'validation');
        }
      }
      
      // Check for localhost/private IPs in production
      if (this.environment.isProduction) {
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' || 
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.')) {
          throw new SecurityError('URL should not point to private networks in production', 'validation');
        }
      }
      
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new SecurityError('Invalid URL format', 'validation');
    }
  }
  
  _validatePath(path) {
    // Check for path traversal
    if (path.includes('..') || path.includes('~')) {
      throw new SecurityError('Path contains traversal patterns', 'validation');
    }
    
    // Check for sensitive system paths
    const sensitivePaths = [
      '/etc/', '/root/', '/sys/', '/proc/', '/dev/',
      'C:\\Windows\\', 'C:\\Users\\', 'C:\\Program Files\\'
    ];
    
    for (const sensitivePath of sensitivePaths) {
      if (path.startsWith(sensitivePath)) {
        throw new SecurityError('Path points to sensitive system directory', 'validation');
      }
    }
  }
  
  _sanitizeInput(input, options) {
    let sanitized = input;
    
    // HTML sanitization
    if (this.config.validation.sanitizeHtml) {
      sanitized = sanitized
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    
    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Apply custom sanitization
    if (options.sanitizer && typeof options.sanitizer === 'function') {
      sanitized = options.sanitizer(sanitized);
    }
    
    return sanitized;
  }
  
  /**
   * Access control and authentication
   */
  checkAccess(request, requiredPermissions = []) {
    try {
      const clientInfo = this._extractClientInfo(request);
      
      // Check if IP is blocked
      if (this._isIpBlocked(clientInfo.ip)) {
        this.emit('access-denied', {
          reason: 'ip-blocked',
          ip: clientInfo.ip,
          timestamp: Date.now()
        });
        throw new SecurityError('Access denied: IP address is blocked', 'access-control');
      }
      
      // Check rate limiting
      if (!this._checkRateLimit(clientInfo.ip)) {
        this.emit('access-denied', {
          reason: 'rate-limited',
          ip: clientInfo.ip,
          timestamp: Date.now()
        });
        throw new SecurityError('Access denied: Rate limit exceeded', 'access-control');
      }
      
      // Check whitelist/blacklist
      if (!this._checkIpAllowed(clientInfo.ip)) {
        this.emit('access-denied', {
          reason: 'ip-not-allowed',
          ip: clientInfo.ip,
          timestamp: Date.now()
        });
        throw new SecurityError('Access denied: IP address not allowed', 'access-control');
      }
      
      // Check origin if provided
      if (clientInfo.origin && !this._checkOriginAllowed(clientInfo.origin)) {
        this.emit('access-denied', {
          reason: 'origin-not-allowed',
          origin: clientInfo.origin,
          ip: clientInfo.ip,
          timestamp: Date.now()
        });
        throw new SecurityError('Access denied: Origin not allowed', 'access-control');
      }
      
      // Check authentication if required
      if (this.config.accessControl.requireAuth) {
        this._checkAuthentication(request, requiredPermissions);
      }
      
      this._logAudit('access-granted', {
        ip: clientInfo.ip,
        origin: clientInfo.origin,
        userAgent: clientInfo.userAgent,
        permissions: requiredPermissions
      });
      
      return true;
      
    } catch (error) {
      this._logAudit('access-denied', {
        reason: error.message,
        timestamp: Date.now()
      });
      
      if (error instanceof SecurityError) {
        throw error;
      }
      
      throw new SecurityError(
        `Access check failed: ${error.message}`,
        'access-control'
      );
    }
  }
  
  _extractClientInfo(request) {
    // Handle different request formats (Express, raw HTTP, etc.)
    if (request.connection || request.socket) {
      // HTTP request object
      return {
        ip: request.ip || 
            request.connection.remoteAddress || 
            request.socket.remoteAddress || 
            '0.0.0.0',
        origin: request.headers?.origin,
        userAgent: request.headers?.['user-agent']
      };
    } else {
      // Custom request object
      return {
        ip: request.ip || '0.0.0.0',
        origin: request.origin,
        userAgent: request.userAgent
      };
    }
  }
  
  _isIpBlocked(ip) {
    const blockData = this.state.blockedIPs.get(ip);
    if (!blockData) return false;
    
    const now = Date.now();
    if (now - blockData.timestamp > this.config.threatDetection.blockDuration) {
      this.state.blockedIPs.delete(ip);
      return false;
    }
    
    return true;
  }
  
  _checkRateLimit(ip) {
    const now = Date.now();
    const limitKey = `rate:${ip}`;
    const limitData = this.state.rateLimits.get(limitKey);
    
    if (!limitData) {
      this.state.rateLimits.set(limitKey, {
        count: 1,
        windowStart: now
      });
      return true;
    }
    
    // Check if window has expired
    if (now - limitData.windowStart > this.config.threatDetection.rateLimitWindow) {
      this.state.rateLimits.set(limitKey, {
        count: 1,
        windowStart: now
      });
      return true;
    }
    
    // Increment counter
    limitData.count++;
    
    return limitData.count <= this.config.accessControl.maxRequestsPerMinute;
  }
  
  _checkIpAllowed(ip) {
    // Check blacklist first
    if (this.config.accessControl.blacklist.includes(ip)) {
      return false;
    }
    
    // If whitelist is empty, allow all (except blacklisted)
    if (this.config.accessControl.whitelist.length === 0) {
      return true;
    }
    
    // Check whitelist
    return this.config.accessControl.whitelist.includes(ip);
  }
  
  _checkOriginAllowed(origin) {
    const allowedOrigins = this.config.accessControl.allowedOrigins;
    
    // If no restrictions, allow all
    if (allowedOrigins.length === 0) {
      return true;
    }
    
    // Check exact matches and wildcards
    return allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (allowed === origin) return true;
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }
      return false;
    });
  }
  
  _checkAuthentication(request, requiredPermissions) {
    // This is a basic implementation - integrate with your auth system
    const authHeader = request.headers?.authorization;
    
    if (!authHeader) {
      throw new SecurityError('Authentication required', 'authentication');
    }
    
    // Basic validation - implement proper JWT/session validation
    const token = authHeader.replace('Bearer ', '');
    if (!this._validateToken(token)) {
      throw new SecurityError('Invalid authentication token', 'authentication');
    }
    
    // Check permissions
    if (requiredPermissions.length > 0) {
      const userPermissions = this._getUserPermissions(token);
      const hasPermission = requiredPermissions.every(perm => 
        userPermissions.includes(perm)
      );
      
      if (!hasPermission) {
        throw new SecurityError('Insufficient permissions', 'authorization');
      }
    }
  }
  
  _validateToken(_token) {
    // WARNING: This is a PLACEHOLDER implementation
    // MUST be replaced with proper JWT/session token validation in production
    // TODO: Integrate with your authentication system (e.g., JWT verify, session validation)
    if (!_token || typeof _token !== 'string') {
      return false;
    }

    // Basic sanity checks (NOT secure for production)
    if (_token.length < 32 || _token.length > 1024) {
      return false;
    }

    // Check for suspicious patterns
    if (_token.includes('..') || _token.includes('<') || _token.includes('>')) {
      return false;
    }

    // TODO: Replace with actual token verification:
    // - JWT: jsonwebtoken.verify(token, secret)
    // - Session: validate against session store
    // - OAuth: validate with identity provider
    return true;
  }

  _getUserPermissions(_token) {
    // WARNING: This is a PLACEHOLDER implementation
    // MUST be replaced with proper permission extraction from your auth system
    // TODO: Extract permissions from validated token claims or session data
    return ['read', 'monitor'];
  }
  
  /**
   * Threat detection and response
   */
  reportFailedAttempt(ip, reason = 'unknown') {
    const now = Date.now();
    
    const failures = this.state.threatEvents.filter(
      event => event.type === 'failed-attempt' && 
               event.ip === ip && 
               now - event.timestamp < this.config.threatDetection.rateLimitWindow
    );
    
    failures.push({
      type: 'failed-attempt',
      ip,
      reason,
      timestamp: now
    });
    
    this.state.threatEvents.push(...failures.slice(-1)); // Keep only the latest
    
    if (failures.length >= this.config.threatDetection.maxFailedAttempts) {
      this._blockIp(ip, 'too-many-failures');
    }
    
    this.emit('suspicious-activity', {
      type: 'failed-attempt',
      ip,
      reason,
      attemptCount: failures.length,
      threshold: this.config.threatDetection.maxFailedAttempts
    });
  }
  
  _blockIp(ip, reason) {
    this.state.blockedIPs.set(ip, {
      reason,
      timestamp: Date.now(),
      attempts: this.state.threatEvents.filter(
        event => event.ip === ip && event.type === 'failed-attempt'
      ).length
    });
    
    this.emit('security-violation', {
      type: 'ip-blocked',
      ip,
      reason,
      timestamp: Date.now()
    });
    
    this._logAudit('ip-blocked', { ip, reason });
  }
  
  unblockIp(ip) {
    const wasBlocked = this.state.blockedIPs.has(ip);
    this.state.blockedIPs.delete(ip);
    
    if (wasBlocked) {
      this._logAudit('ip-unblocked', { ip });
      this.emit('ip-unblocked', { ip, timestamp: Date.now() });
    }
    
    return wasBlocked;
  }
  
  /**
   * Data encryption and hashing
   */
  async encrypt(data, password) {
    try {
      const algorithm = this.config.encryption.algorithm;
      const salt = crypto.randomBytes(this.config.encryption.saltLength);
      const iv = crypto.randomBytes(this.config.encryption.ivLength);
      
      // Derive key
      const key = crypto.pbkdf2Sync(
        password, 
        salt, 
        this.config.encryption.iterations, 
        32, 
        'sha256'
      );
      
      // Encrypt
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);
      
      return {
        encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm
      };
      
    } catch (error) {
      throw new SecurityError(
        `Encryption failed: ${error.message}`,
        'encryption'
      );
    }
  }
  
  async decrypt(encryptedData, password) {
    try {
      const { encrypted, salt, iv, authTag, algorithm } = encryptedData;

      // Derive key
      const key = crypto.pbkdf2Sync(
        password,
        Buffer.from(salt, 'hex'),
        this.config.encryption.iterations,
        32,
        'sha256'
      );

      // Decrypt
      const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
      
      if (authTag) {
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      }
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
      
    } catch (error) {
      throw new SecurityError(
        `Decryption failed: ${error.message}`,
        'decryption'
      );
    }
  }
  
  hash(data, algorithm = 'sha256') {
    try {
      const hash = crypto.createHash(algorithm);
      hash.update(safeStringify(data));
      return hash.digest('hex');
    } catch (error) {
      throw new SecurityError(
        `Hashing failed: ${error.message}`,
        'hashing'
      );
    }
  }
  
  /**
   * Audit logging
   */
  _logAudit(action, data = {}) {
    if (!this.config.audit.enabled) return;
    
    const logEntry = {
      timestamp: Date.now(),
      action,
      data: this.config.audit.logSensitiveData ? data : this._sanitizeLogData(data),
      environment: this.environment.isProduction ? 'production' : 'development',
      pid: process.pid
    };
    
    this.state.auditLog.push(logEntry);
    
    // Check log size limit
    if (this.state.auditLog.length * 1000 > this.config.audit.maxLogSize) {
      this.state.auditLog = this.state.auditLog.slice(-Math.floor(this.config.audit.maxLogSize / 1000));
    }
    
    this.emit('audit-log', logEntry);
  }
  
  _sanitizeLogData(data) {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
  
  getAuditLog(options = {}) {
    const { limit = 100, startTime, endTime, action } = options;
    
    let filtered = this.state.auditLog;
    
    if (startTime) {
      filtered = filtered.filter(entry => entry.timestamp >= startTime);
    }
    
    if (endTime) {
      filtered = filtered.filter(entry => entry.timestamp <= endTime);
    }
    
    if (action) {
      filtered = filtered.filter(entry => entry.action === action);
    }
    
    return filtered.slice(-limit);
  }
  
  /**
   * Security event handlers
   */
  _handleSecurityViolation(event) {
    this._logAudit('security-violation', event);
    
    // Implement automatic response based on violation type
    switch (event.type) {
    case 'ip-blocked':
      // Could notify security team, update firewall rules, etc.
      break;
    case 'suspicious-pattern':
      // Could increase monitoring, alert security team
      break;
    default:
      // Generic handling
      break;
    }
  }
  
  _handleSuspiciousActivity(event) {
    this._logAudit('suspicious-activity', event);
    
    // Escalate if needed
    if (event.severity === 'high') {
      this.emit('security-alert', event);
    }
  }
  
  _logAccessDenied(event) {
    this._logAudit('access-denied', event);
  }
  
  /**
   * Security metrics and reporting
   */
  getSecurityMetrics() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    
    const recentEvents = this.state.threatEvents.filter(
      event => event.timestamp > last24h
    );
    
    const recentAudit = this.state.auditLog.filter(
      log => log.timestamp > last24h
    );
    
    return {
      blockedIPs: this.state.blockedIPs.size,
      activeRateLimits: this.state.rateLimits.size,
      threatEvents: {
        total: this.state.threatEvents.length,
        last24h: recentEvents.length,
        byType: this._groupEventsByType(recentEvents)
      },
      auditLog: {
        total: this.state.auditLog.length,
        last24h: recentAudit.length,
        byAction: this._groupLogsByAction(recentAudit)
      },
      lastCleanup: this.state.lastCleanup,
      environment: this.environment,
      config: this._getSafeConfig()
    };
  }
  
  _groupEventsByType(events) {
    return events.reduce((groups, event) => {
      groups[event.type] = (groups[event.type] || 0) + 1;
      return groups;
    }, {});
  }
  
  _groupLogsByAction(logs) {
    return logs.reduce((groups, log) => {
      groups[log.action] = (groups[log.action] || 0) + 1;
      return groups;
    }, {});
  }
  
  _getSafeConfig() {
    return {
      accessControlEnabled: this.config.accessControl.enabled,
      auditEnabled: this.config.audit.enabled,
      threatDetectionEnabled: this.config.threatDetection.enabled,
      validationEnabled: true
    };
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Clear sensitive data
    this.state.sessions.clear();
    this.state.blockedIPs.clear();
    this.state.rateLimits.clear();
    
    // Clear non-sensitive data
    this.state.auditLog = [];
    this.state.threatEvents = [];
    
    this.removeAllListeners();
  }
}

module.exports = SecurityManager;
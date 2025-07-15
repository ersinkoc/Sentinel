'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const SecurityManager = require('../src/security');

describe('Security Manager', () => {
  let security;
  
  test('should create SecurityManager instance with default config', () => {
    security = new SecurityManager();
    assert.ok(security instanceof SecurityManager);
    assert.strictEqual(security.config.accessControl.enabled, true);
    assert.strictEqual(security.config.validation.maxInputLength, 10000);
  });
  
  test('should create SecurityManager instance with custom config', () => {
    const config = {
      accessControl: {
        enabled: false,
        maxRequestsPerMinute: 50
      },
      validation: {
        maxInputLength: 5000
      }
    };
    
    security = new SecurityManager(config);
    assert.strictEqual(security.config.accessControl.enabled, false);
    assert.strictEqual(security.config.accessControl.maxRequestsPerMinute, 50);
    assert.strictEqual(security.config.validation.maxInputLength, 5000);
  });
  
  test('should validate input successfully', () => {
    security = new SecurityManager();
    
    const validInput = 'Hello world 123';
    const result = security.validateInput(validInput);
    assert.strictEqual(result, true);
  });
  
  test('should sanitize input properly', () => {
    security = new SecurityManager();
    
    const input = '<script>alert("xss")</script>normal text';
    const sanitized = security.sanitizeInput(input);
    assert.ok(!sanitized.includes('<script>'));
    assert.ok(sanitized.includes('normal text'));
  });
  
  test('should validate numbers correctly', () => {
    security = new SecurityManager();
    
    // Valid number
    assert.doesNotThrow(() => {
      security.validateNumber(42, { min: 0, max: 100 });
    });
    
    // Invalid number - too small
    assert.throws(() => {
      security.validateNumber(-5, { min: 0, max: 100 });
    });
    
    // Invalid number - too large
    assert.throws(() => {
      security.validateNumber(150, { min: 0, max: 100 });
    });
  });
  
  test('should validate email addresses', () => {
    security = new SecurityManager();
    
    // Valid email
    assert.doesNotThrow(() => {
      security.validateEmail('test@example.com');
    });
    
    // Invalid email
    assert.throws(() => {
      security.validateEmail('invalid-email');
    });
  });
  
  test('should validate URLs', () => {
    security = new SecurityManager();
    
    // Valid HTTPS URL
    assert.doesNotThrow(() => {
      security.validateUrl('https://example.com/path');
    });
    
    // Valid HTTP URL
    assert.doesNotThrow(() => {
      security.validateUrl('http://localhost:3000');
    });
    
    // Invalid protocol
    assert.throws(() => {
      security.validateUrl('ftp://example.com');
    });
  });
  
  test('should validate file paths', () => {
    security = new SecurityManager();
    
    // Valid path
    assert.doesNotThrow(() => {
      security.validatePath('/tmp/safe-file.txt');
    });
    
    // Path traversal attempt
    assert.throws(() => {
      security.validatePath('../../../etc/passwd');
    });
  });
  
  test('should perform access control checks', () => {
    security = new SecurityManager({
      accessControl: {
        enabled: true,
        allowedOrigins: ['example.com'],
        maxRequestsPerMinute: 10
      }
    });
    
    // Valid origin
    assert.doesNotThrow(() => {
      security.checkAccess({
        ip: '192.168.1.1',
        origin: 'example.com',
        userAgent: 'Mozilla/5.0'
      });
    });
    
    // Invalid origin
    assert.throws(() => {
      security.checkAccess({
        ip: '192.168.1.1',
        origin: 'malicious.com',
        userAgent: 'Mozilla/5.0'
      });
    });
  });
  
  test('should handle rate limiting', () => {
    security = new SecurityManager({
      accessControl: {
        enabled: true,
        maxRequestsPerMinute: 2
      }
    });
    
    const ip = '192.168.1.100';
    
    // First request should pass
    assert.doesNotThrow(() => {
      security.checkAccess({ ip, origin: 'localhost' });
    });
    
    // Second request should pass
    assert.doesNotThrow(() => {
      security.checkAccess({ ip, origin: 'localhost' });
    });
    
    // Third request should fail (rate limit exceeded)
    assert.throws(() => {
      security.checkAccess({ ip, origin: 'localhost' });
    });
  });
  
  test('should generate security tokens', () => {
    security = new SecurityManager();
    
    const token = security.generateToken('user123');
    assert.ok(typeof token === 'string');
    assert.ok(token.length > 0);
  });
  
  test('should verify security tokens', () => {
    security = new SecurityManager();
    
    const userId = 'user123';
    const token = security.generateToken(userId);
    
    // Valid token
    const verified = security.verifyToken(token);
    assert.ok(verified);
    assert.strictEqual(verified.userId, userId);
    
    // Invalid token
    assert.throws(() => {
      security.verifyToken('invalid-token');
    });
  });
  
  test('should validate permissions', () => {
    security = new SecurityManager();
    
    const token = security.generateToken('admin', ['read', 'write']);
    const verified = security.verifyToken(token);
    
    // Should have read permission
    assert.doesNotThrow(() => {
      security.checkPermission(verified, 'read');
    });
    
    // Should have write permission
    assert.doesNotThrow(() => {
      security.checkPermission(verified, 'write');
    });
    
    // Should not have admin permission
    assert.throws(() => {
      security.checkPermission(verified, 'admin');
    });
  });
  
  test('should encrypt and decrypt data', () => {
    security = new SecurityManager();
    
    const plaintext = 'sensitive data';
    const encrypted = security.encrypt(plaintext);
    
    assert.ok(encrypted);
    assert.notStrictEqual(encrypted, plaintext);
    
    const decrypted = security.decrypt(encrypted);
    assert.strictEqual(decrypted, plaintext);
  });
  
  test('should hash passwords securely', () => {
    security = new SecurityManager();
    
    const password = 'test-password-123'; // Test password, not real secret
    const hashed = security.hashPassword(password);
    
    assert.ok(hashed);
    assert.notStrictEqual(hashed, password);
    assert.ok(hashed.includes('$')); // Should be in standard hash format
  });
  
  test('should verify password hashes', () => {
    security = new SecurityManager();
    
    const password = 'test-password-123'; // Test password, not real secret
    const hashed = security.hashPassword(password);
    
    // Correct password
    assert.strictEqual(security.verifyPassword(password, hashed), true);
    
    // Incorrect password
    assert.strictEqual(security.verifyPassword('wrongPassword', hashed), false);
  });
  
  test('should get security metrics', () => {
    security = new SecurityManager();
    
    // Trigger some security events
    try {
      security.validateNumber(-1, { min: 0, max: 100 });
    } catch {
      // Expected error
    }
    
    try {
      security.validateEmail('invalid-email');
    } catch {
      // Expected error
    }
    
    const metrics = security.getSecurityMetrics();
    assert.ok(typeof metrics === 'object');
    assert.ok(typeof metrics.violations === 'number');
    assert.ok(typeof metrics.attempts === 'number');
  });
  
  test('should handle security events', (t, done) => {
    security = new SecurityManager();
    
    security.on('security-violation', (event) => {
      assert.ok(event.type);
      assert.ok(event.timestamp);
      done();
    });
    
    // Trigger a security violation
    try {
      security.validatePath('../../../etc/passwd');
    } catch {
      // Expected error, event should be emitted
    }
  });
  
  test('should configure security settings', () => {
    security = new SecurityManager();
    
    const newConfig = {
      accessControl: {
        enabled: false
      }
    };
    
    security.configure(newConfig);
    assert.strictEqual(security.config.accessControl.enabled, false);
  });
  
  // Clean up after tests
  test('cleanup', () => {
    if (security) {
      security.removeAllListeners();
    }
  });
});

module.exports = () => {
  console.log('✓ Security manager tests');
};
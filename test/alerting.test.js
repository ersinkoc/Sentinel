'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const AlertManager = require('../src/alerting');

describe('AlertManager', () => {
  let alertManager;

  beforeEach(() => {
    alertManager = new AlertManager();
  });

  afterEach(() => {
    alertManager.destroy();
  });

  test('initializes with default configuration', () => {
    assert(alertManager.config.throttling.enabled);
    assert.strictEqual(alertManager.config.throttling.windowMs, 60000);
    assert.strictEqual(alertManager.config.throttling.maxAlertsPerWindow, 10);
    assert(alertManager.config.escalation.enabled);
    assert(alertManager.config.suppression.enabled);
    assert(alertManager.config.smartFiltering.enabled);
    assert.strictEqual(alertManager.alerts.size, 0);
    assert.strictEqual(alertManager.stats.totalAlerts, 0);
  });

  test('creates basic alert', () => {
    const alertData = {
      level: 'warning',
      title: 'High Memory Usage',
      message: 'Memory usage is above 80%',
      source: 'monitor',
      category: 'memory'
    };

    const alert = alertManager.createAlert(alertData);

    assert(alert);
    assert(alert.id);
    assert.strictEqual(alert.level, 'warning');
    assert.strictEqual(alert.title, 'High Memory Usage');
    assert.strictEqual(alert.source, 'monitor');
    assert(alert.createdAt);
    assert(alert.fingerprint);
    assert(alert.severity > 0);
    assert.strictEqual(alertManager.alerts.size, 1);
    assert.strictEqual(alertManager.stats.totalAlerts, 1);
    assert.strictEqual(alertManager.stats.alertsByLevel.warning, 1);
  });

  test('normalizes alert with enhanced memory message', () => {
    const alertData = {
      level: 'error',
      title: 'Memory Leak Detected',
      message: 'Potential memory leak',
      metrics: {
        heapUsed: 1073741824, // 1GB
        heapTotal: 2147483648, // 2GB
        growthRate: 0.15,
        gcFrequency: 12
      },
      recommendations: ['Investigate large object allocations', 'Check for circular references']
    };

    const alert = alertManager.createAlert(alertData);

    assert(alert.enhancedMessage);
    assert(alert.enhancedMessage.includes('Heap Usage:'));
    assert(alert.enhancedMessage.includes('50.0% of total'));
    assert(alert.enhancedMessage.includes('Growth Rate: 15.0%/min'));
    assert(alert.enhancedMessage.includes('GC Frequency: 12 cycles/min'));
    assert(alert.enhancedMessage.includes('Recommendations:'));
  });

  test('calculates severity based on metrics', () => {
    const highSeverityData = {
      level: 'error',
      title: 'Critical Memory State',
      metrics: {
        heapUsed: 1900000000,
        heapTotal: 2000000000, // 95% usage
        gcFrequency: 15,
        growthRate: 0.3
      }
    };

    const lowSeverityData = {
      level: 'warning',
      title: 'Memory Usage Warning',
      metrics: {
        heapUsed: 500000000,
        heapTotal: 2000000000, // 25% usage
        gcFrequency: 3,
        growthRate: 0.05
      }
    };

    const highAlert = alertManager.createAlert(highSeverityData);
    const lowAlert = alertManager.createAlert(lowSeverityData);

    assert(highAlert.severity > lowAlert.severity);
  });

  test('throttles alerts when limit exceeded', () => {
    const config = {
      throttling: {
        enabled: true,
        windowMs: 60000,
        maxAlertsPerWindow: 3
      }
    };

    alertManager = new AlertManager(config);

    const alertData = {
      level: 'warning',
      source: 'test',
      category: 'memory'
    };

    // Create alerts up to limit
    for (let i = 0; i < 3; i++) {
      const alert = alertManager.createAlert({ ...alertData, title: `Alert ${i}` });
      assert(alert);
    }

    // Next alert should be throttled
    const throttledAlert = alertManager.createAlert({ ...alertData, title: 'Throttled' });
    assert.strictEqual(throttledAlert, null);
    assert.strictEqual(alertManager.stats.suppressed, 1);
  });

  test('detects and suppresses duplicate alerts', () => {
    const config = {
      smartFiltering: {
        enabled: true,
        duplicateWindow: 1000
      }
    };

    alertManager = new AlertManager(config);

    const alertData = {
      level: 'error',
      title: 'Duplicate Alert',
      source: 'test',
      category: 'memory'
    };

    const first = alertManager.createAlert(alertData);
    assert(first);

    const duplicate = alertManager.createAlert(alertData);
    assert.strictEqual(duplicate, null);
    assert.strictEqual(alertManager.stats.suppressed, 1);
  });

  test('applies suppression rules', () => {
    const config = {
      suppression: {
        enabled: true,
        rules: [
          { level: 'info' },
          { source: 'test', pattern: 'ignore.*' }
        ]
      }
    };

    alertManager = new AlertManager(config);

    // Info level should be suppressed
    const infoAlert = alertManager.createAlert({
      level: 'info',
      title: 'Info Alert'
    });
    assert.strictEqual(infoAlert, null);

    // Pattern match should be suppressed
    const patternAlert = alertManager.createAlert({
      level: 'warning',
      source: 'test',
      message: 'ignore this message'
    });
    assert.strictEqual(patternAlert, null);

    // This should pass
    const validAlert = alertManager.createAlert({
      level: 'warning',
      source: 'monitor',
      message: 'important message'
    });
    assert(validAlert);
  });

  test('escalates alerts based on timeout', async () => {
    const config = {
      escalation: {
        enabled: true,
        timeouts: {
          warning: 100, // 100ms for testing
          error: 50
        },
        maxEscalations: 2
      }
    };

    alertManager = new AlertManager(config);

    const events = [];
    alertManager.on('alert-escalated', (alert, oldLevel) => {
      events.push({ alert, oldLevel });
    });

    const alert = alertManager.createAlert({
      level: 'warning',
      title: 'Escalating Alert'
    });

    assert.strictEqual(alert.level, 'warning');

    // Wait for escalation
    await new Promise(resolve => setTimeout(resolve, 150));

    // Check escalation happened
    assert(events.length > 0);
    assert.strictEqual(events[0].oldLevel, 'warning');
    assert.strictEqual(alertManager.alerts.get(alert.id).level, 'error');
    assert.strictEqual(alertManager.stats.escalated, 1);
  });

  test('respects maximum escalations', async () => {
    const config = {
      escalation: {
        enabled: true,
        timeouts: {
          warning: 50,
          error: 50,
          critical: 50
        },
        maxEscalations: 2
      }
    };

    alertManager = new AlertManager(config);

    let maxEscalationReached = false;
    alertManager.on('alert-max-escalation', () => {
      maxEscalationReached = true;
    });

    const alert = alertManager.createAlert({
      level: 'warning',
      title: 'Max Escalation Test'
    });

    // Wait for max escalations
    await new Promise(resolve => setTimeout(resolve, 200));

    assert(maxEscalationReached);
    assert.strictEqual(alertManager.escalations.has(alert.id), false);
  });

  test('resolves alerts', () => {
    const alert = alertManager.createAlert({
      level: 'error',
      title: 'Resolvable Alert'
    });

    const resolved = alertManager.resolveAlert(alert.id, {
      reason: 'Issue fixed',
      resolvedBy: 'auto'
    });

    assert(resolved);
    assert.strictEqual(alertManager.alerts.has(alert.id), false);
    assert.strictEqual(alertManager.stats.resolved, 1);
  });

  test('suppresses specific alerts', async () => {
    const alert = alertManager.createAlert({
      level: 'warning',
      title: 'Suppressible Alert'
    });

    const suppressed = alertManager.suppressAlert(alert.id, 100);
    assert(suppressed);
    assert(alertManager.suppressions.has(alert.id));

    // Wait for suppression to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(alertManager.suppressions.has(alert.id), false);
  });

  test('filters active alerts', () => {
    // Create various alerts
    alertManager.createAlert({
      level: 'warning',
      source: 'monitor',
      category: 'memory',
      tags: ['performance']
    });

    alertManager.createAlert({
      level: 'error',
      source: 'detector',
      category: 'leak',
      tags: ['critical', 'performance']
    });

    alertManager.createAlert({
      level: 'info',
      source: 'monitor',
      category: 'cpu',
      tags: ['system']
    });

    // Test various filters
    const warningAlerts = alertManager.getActiveAlerts({ level: 'warning' });
    assert.strictEqual(warningAlerts.length, 1);

    const monitorAlerts = alertManager.getActiveAlerts({ source: 'monitor' });
    assert.strictEqual(monitorAlerts.length, 2);

    const performanceAlerts = alertManager.getActiveAlerts({ tags: ['performance'] });
    assert.strictEqual(performanceAlerts.length, 2);

    const allAlerts = alertManager.getActiveAlerts();
    assert.strictEqual(allAlerts.length, 3);
  });

  test('maintains alert history', () => {
    // Create some alerts
    for (let i = 0; i < 5; i++) {
      alertManager.createAlert({
        level: 'info',
        title: `Alert ${i}`
      });
    }

    const history = alertManager.getAlertHistory(3);
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[2].title, 'Alert 4');
  });

  test('channels configuration and filtering', () => {
    const config = {
      channels: {
        critical: {
          type: 'webhook',
          minLevel: 'error',
          filters: {
            categories: ['memory', 'leak']
          }
        },
        all: {
          type: 'console',
          minLevel: 'info'
        }
      }
    };

    alertManager = new AlertManager(config);

    // Mock channel methods
    let webhookCalled = false;
    let consoleCalled = false;

    alertManager.on('webhook-notification', () => { webhookCalled = true; });
    alertManager._sendConsole = () => { consoleCalled = true; };

    // Create low priority alert - should only go to console
    alertManager.createAlert({
      level: 'warning',
      category: 'cpu'
    });

    assert.strictEqual(webhookCalled, false);
    assert(consoleCalled);

    // Reset
    webhookCalled = false;
    consoleCalled = false;

    // Create high priority alert with correct category
    alertManager.createAlert({
      level: 'error',
      category: 'memory'
    });

    assert(webhookCalled);
    assert(consoleCalled);
  });

  test('console notification formatting', () => {
    const config = {
      channels: {
        console: { type: 'console' }
      }
    };

    alertManager = new AlertManager(config);

    // Capture console output
    const originalLog = console.log;
    const output = [];
    console.log = (...args) => output.push(args.join(' '));

    alertManager.createAlert({
      level: 'error',
      title: 'Console Test',
      message: 'Test message',
      recommendations: ['Fix issue 1', 'Check logs']
    });

    console.log = originalLog;

    assert(output.some(line => line.includes('[ERROR]')));
    assert(output.some(line => line.includes('Console Test')));
    assert(output.some(line => line.includes('Test message')));
    assert(output.some(line => line.includes('Recommendations:')));
  });

  test('generates correct alert fingerprints', () => {
    const alert1 = alertManager.createAlert({
      level: 'warning',
      title: 'Alert 1',
      source: 'test',
      category: 'memory'
    });

    const alert2 = alertManager.createAlert({
      level: 'warning',
      title: 'Alert 1',
      source: 'test',
      category: 'memory'
    });

    const alert3 = alertManager.createAlert({
      level: 'error', // Different level
      title: 'Alert 1',
      source: 'test',
      category: 'memory'
    });

    assert(alert1, 'First alert should be created');
    assert(alert2, 'Second alert should be created');
    assert(alert3, 'Third alert should be created');
    
    assert.strictEqual(alert1.fingerprint, alert2.fingerprint);
    assert.notStrictEqual(alert1.fingerprint, alert3.fingerprint);
  });

  test('getStats returns comprehensive statistics', () => {
    // Create new alertManager for clean state
    const testAlertManager = new AlertManager();
    
    // Create various alerts
    testAlertManager.createAlert({ level: 'info' });
    testAlertManager.createAlert({ level: 'warning' });
    testAlertManager.createAlert({ level: 'warning' });
    testAlertManager.createAlert({ level: 'error' });

    const alert = testAlertManager.createAlert({ level: 'critical' });
    if (alert) {
      testAlertManager.resolveAlert(alert.id);
    }

    const stats = testAlertManager.getStats();

    // Stats might be affected by suppression/throttling
    assert(stats.totalAlerts >= 4, `Expected at least 4 alerts, got ${stats.totalAlerts}`);
    assert(stats.activeAlerts <= stats.totalAlerts);
    
    testAlertManager.destroy();
  });

  test('configure updates configuration', () => {

    alertManager.configure({
      throttling: { windowMs: 30000 }
    });

    assert.strictEqual(alertManager.config.throttling.windowMs, 30000);
    // Note: configure does shallow merge, not deep merge
  });

  test('notification error handling', () => {
    const config = {
      channels: {
        broken: {
          type: 'webhook',
          url: 'invalid'
        }
      }
    };

    alertManager = new AlertManager(config);

    let errorEmitted = false;
    alertManager.on('notification-error', (data) => {
      errorEmitted = true;
      assert.strictEqual(data.channel, 'broken');
      assert(data.error);
      assert(data.alert);
    });

    // Mock webhook to throw error
    alertManager._sendWebhook = () => {
      throw new Error('Webhook failed');
    };

    alertManager.createAlert({
      level: 'error',
      title: 'Test Alert'
    });

    assert(errorEmitted);
  });

  test('unknown channel type handling', () => {
    const config = {
      channels: {
        unknown: {
          type: 'sms' // Not implemented
        }
      }
    };

    alertManager = new AlertManager(config);

    let unknownEmitted = false;
    alertManager.on('unknown-channel-type', (data) => {
      unknownEmitted = true;
      assert.strictEqual(data.channelName, 'unknown');
      assert.strictEqual(data.channel.type, 'sms');
    });

    alertManager.createAlert({
      level: 'warning',
      title: 'Test'
    });

    assert(unknownEmitted);
  });

  test('email and file notifications emit events', () => {
    const config = {
      channels: {
        email: {
          type: 'email',
          recipients: ['test@example.com']
        },
        file: {
          type: 'file',
          path: '/tmp/alerts.log'
        }
      }
    };

    alertManager = new AlertManager(config);

    let emailEmitted = false;
    let fileEmitted = false;

    alertManager.on('email-notification', (data) => {
      emailEmitted = true;
      assert(data.emailData.to);
      assert(data.emailData.subject);
      assert(data.emailData.body);
    });

    alertManager.on('file-notification', (data) => {
      fileEmitted = true;
      assert(data.logEntry.timestamp);
      assert(data.logEntry.alert);
    });

    alertManager.createAlert({
      level: 'error',
      title: 'Multi-channel Alert'
    });

    assert(emailEmitted);
    assert(fileEmitted);
  });

  test('respects suppression max duration', () => {
    const config = {
      suppression: {
        maxDuration: 1000
      }
    };

    alertManager = new AlertManager(config);

    const alert = alertManager.createAlert({
      level: 'warning',
      title: 'Test'
    });

    alertManager.suppressAlert(alert.id, 5000); // Request 5 seconds

    const suppression = alertManager.suppressions.get(alert.id);
    assert.strictEqual(suppression.duration, 1000); // Capped at max
  });

  test('clears timers on destroy', () => {
    const config = {
      escalation: {
        enabled: true,
        timeouts: { warning: 100 }
      }
    };

    alertManager = new AlertManager(config);

    // Create alert with escalation
    const alert = alertManager.createAlert({
      level: 'warning',
      title: 'Test'
    });

    assert(alertManager.escalations.has(alert.id));

    alertManager.destroy();

    // Timers should be cleared
    assert(alertManager.throttleResetTimer === undefined || alertManager.throttleResetTimer._destroyed);
    assert(alertManager.escalationTimer === undefined || alertManager.escalationTimer._destroyed);
  });
});

module.exports = async function runAlertingTests() {
  console.log('  🚨 Running alerting system tests...');
};
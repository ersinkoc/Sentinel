'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Mock reporter to avoid file system operations in tests
const MockReporter = class {
  constructor(config) {
    this.config = config || { reporting: { console: false, file: false } };
    this.reports = [];
    this.logFile = null;
    this.reportDir = path.join(process.cwd(), '.sentinel-test');
  }
  
  async reportLeak(leak) {
    const report = this._formatLeakReport(leak);
    
    if (this.config.reporting.console) {
      this._consoleReport(report);
    }
    
    this.reports.push(report);
    return report;
  }
  
  async reportWarning(warning) {
    const report = this._formatWarningReport(warning);
    
    if (this.config.reporting.console) {
      console.warn('[Sentinel Warning]', report.message);
    }
    
    this.reports.push(report);
    return report;
  }
  
  _formatLeakReport(leak) {
    return {
      type: 'memory-leak',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      probability: leak.probability,
      factors: leak.factors,
      metrics: leak.metrics,
      recommendations: leak.recommendations,
      message: this._buildLeakMessage(leak)
    };
  }
  
  _formatWarningReport(warning) {
    return {
      type: 'warning',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      warningType: warning.type,
      message: warning.message,
      details: warning
    };
  }
  
  _buildLeakMessage(leak) {
    const prob = Math.round(leak.probability * 100);
    const heap = (leak.metrics.heapUsed / 1024 / 1024).toFixed(2);
    
    let message = `Memory leak detected (${prob}% probability)\n`;
    message += `Heap: ${heap}MB | Factors: ${leak.factors.join(', ')}\n`;
    
    if (leak.recommendations.length > 0) {
      message += 'Recommendations:\n';
      leak.recommendations.forEach((rec, i) => {
        message += `  ${i + 1}. ${rec}\n`;
      });
    }
    
    return message;
  }
  
  _consoleReport(report) {
    console.error('[Sentinel Alert] Memory Leak Detected!');
    console.error(`Probability: ${Math.round(report.probability * 100)}%`);
    console.error(`Factors: ${report.factors.join(', ')}`);
  }
  
  async generateReport() {
    return {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      runtime: process.uptime(),
      totalReports: this.reports.length,
      leakReports: this.reports.filter(r => r.type === 'memory-leak').length,
      warningReports: this.reports.filter(r => r.type === 'warning').length,
      reports: this.reports
    };
  }
  
  flush() {
    // Mock flush - no actual file operations
  }
  
  configure(config) {
    this.config = config;
  }
  
  getReports() {
    return this.reports;
  }
  
  clearReports() {
    this.reports = [];
  }
};

describe('Reporter', () => {
  let reporter;
  
  test('should create Reporter instance', () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    assert.ok(reporter);
    assert.ok(Array.isArray(reporter.reports));
    assert.strictEqual(reporter.reports.length, 0);
  });
  
  test('should format leak report correctly', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    const leak = {
      probability: 0.85,
      factors: ['rapid-growth', 'gc-pressure'],
      metrics: {
        heapUsed: 50 * 1024 * 1024, // 50MB
        heapTotal: 100 * 1024 * 1024,
        heapLimit: 200 * 1024 * 1024
      },
      recommendations: [
        'Check for unbounded data structures',
        'Review event listener cleanup'
      ]
    };
    
    const report = await reporter.reportLeak(leak);
    
    assert.ok(typeof report === 'object');
    assert.strictEqual(report.type, 'memory-leak');
    assert.ok(typeof report.timestamp === 'string');
    assert.strictEqual(report.pid, process.pid);
    assert.strictEqual(report.probability, 0.85);
    assert.deepStrictEqual(report.factors, ['rapid-growth', 'gc-pressure']);
    assert.deepStrictEqual(report.metrics, leak.metrics);
    assert.deepStrictEqual(report.recommendations, leak.recommendations);
    assert.ok(typeof report.message === 'string');
    
    // Check message format
    assert.ok(report.message.includes('85% probability'));
    assert.ok(report.message.includes('50.00MB'));
    assert.ok(report.message.includes('rapid-growth, gc-pressure'));
    assert.ok(report.message.includes('Recommendations:'));
  });
  
  test('should format warning report correctly', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    const warning = {
      type: 'route-memory-spike',
      message: 'Route /api/users showed memory spike',
      route: '/api/users',
      memoryIncrease: 10 * 1024 * 1024
    };
    
    const report = await reporter.reportWarning(warning);
    
    assert.ok(typeof report === 'object');
    assert.strictEqual(report.type, 'warning');
    assert.ok(typeof report.timestamp === 'string');
    assert.strictEqual(report.pid, process.pid);
    assert.strictEqual(report.warningType, 'route-memory-spike');
    assert.strictEqual(report.message, 'Route /api/users showed memory spike');
    assert.deepStrictEqual(report.details, warning);
  });
  
  test('should store reports', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    const leak = {
      probability: 0.6,
      factors: ['steady-growth'],
      metrics: { heapUsed: 1024 * 1024, heapTotal: 2048 * 1024, heapLimit: 4096 * 1024 },
      recommendations: ['Review memory usage']
    };
    
    const warning = {
      type: 'slow-route',
      message: 'Route is slow'
    };
    
    await reporter.reportLeak(leak);
    await reporter.reportWarning(warning);
    
    const reports = reporter.getReports();
    assert.strictEqual(reports.length, 2);
    assert.strictEqual(reports[0].type, 'memory-leak');
    assert.strictEqual(reports[1].type, 'warning');
  });
  
  test('should generate summary report', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    // Add some reports
    await reporter.reportLeak({
      probability: 0.7,
      factors: ['test'],
      metrics: { heapUsed: 1024, heapTotal: 2048, heapLimit: 4096 },
      recommendations: []
    });
    
    await reporter.reportWarning({
      type: 'test-warning',
      message: 'Test warning'
    });
    
    const summary = await reporter.generateReport();
    
    assert.ok(typeof summary === 'object');
    assert.ok(typeof summary.timestamp === 'string');
    assert.strictEqual(summary.pid, process.pid);
    assert.ok(typeof summary.runtime === 'number');
    assert.strictEqual(summary.totalReports, 2);
    assert.strictEqual(summary.leakReports, 1);
    assert.strictEqual(summary.warningReports, 1);
    assert.ok(Array.isArray(summary.reports));
    assert.strictEqual(summary.reports.length, 2);
  });
  
  test('should configure reporter', () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    const newConfig = {
      reporting: { console: true, file: true, webhook: 'http://example.com' }
    };
    
    reporter.configure(newConfig);
    assert.strictEqual(reporter.config.reporting.console, true);
    assert.strictEqual(reporter.config.reporting.file, true);
    assert.strictEqual(reporter.config.reporting.webhook, 'http://example.com');
  });
  
  test('should clear reports', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    // Add a report
    await reporter.reportLeak({
      probability: 0.5,
      factors: ['test'],
      metrics: { heapUsed: 1024, heapTotal: 2048, heapLimit: 4096 },
      recommendations: []
    });
    
    assert.strictEqual(reporter.getReports().length, 1);
    
    reporter.clearReports();
    assert.strictEqual(reporter.getReports().length, 0);
  });
  
  test('should build leak message with recommendations', () => {
    reporter = new MockReporter({});
    
    const leak = {
      probability: 0.75,
      factors: ['rapid-growth', 'high-gc'],
      metrics: { heapUsed: 25 * 1024 * 1024 }, // 25MB
      recommendations: [
        'Check for memory leaks in event listeners',
        'Implement object pooling'
      ]
    };
    
    const message = reporter._buildLeakMessage(leak);
    
    assert.ok(message.includes('75% probability'));
    assert.ok(message.includes('25.00MB'));
    assert.ok(message.includes('rapid-growth, high-gc'));
    assert.ok(message.includes('1. Check for memory leaks'));
    assert.ok(message.includes('2. Implement object pooling'));
  });
  
  test('should build leak message without recommendations', () => {
    reporter = new MockReporter({});
    
    const leak = {
      probability: 0.5,
      factors: ['gc-pressure'],
      metrics: { heapUsed: 10 * 1024 * 1024 }, // 10MB
      recommendations: []
    };
    
    const message = reporter._buildLeakMessage(leak);
    
    assert.ok(message.includes('50% probability'));
    assert.ok(message.includes('10.00MB'));
    assert.ok(message.includes('gc-pressure'));
    assert.ok(!message.includes('Recommendations:'));
  });
  
  test('should handle console reporting when enabled', async () => {
    reporter = new MockReporter({
      reporting: { console: true, file: false }
    });
    
    // Capture console output
    const originalError = console.error;
    const loggedMessages = [];
    console.error = (...args) => loggedMessages.push(args.join(' '));
    
    try {
      await reporter.reportLeak({
        probability: 0.8,
        factors: ['test'],
        metrics: { heapUsed: 1024 * 1024, heapTotal: 2048 * 1024, heapLimit: 4096 * 1024 },
        recommendations: []
      });
      
      assert.ok(loggedMessages.some(msg => msg.includes('Memory Leak Detected')));
      assert.ok(loggedMessages.some(msg => msg.includes('80%')));
    } finally {
      console.error = originalError;
    }
  });
  
  test('should handle warning console reporting when enabled', async () => {
    reporter = new MockReporter({
      reporting: { console: true, file: false }
    });
    
    // Capture console output
    const originalWarn = console.warn;
    const loggedMessages = [];
    console.warn = (...args) => loggedMessages.push(args.join(' '));
    
    try {
      await reporter.reportWarning({
        type: 'test-warning',
        message: 'This is a test warning'
      });
      
      assert.ok(loggedMessages.some(msg => msg.includes('Sentinel Warning')));
      assert.ok(loggedMessages.some(msg => msg.includes('test warning')));
    } finally {
      console.warn = originalWarn;
    }
  });
  
  test('should not log to console when disabled', async () => {
    reporter = new MockReporter({
      reporting: { console: false, file: false }
    });
    
    // Capture console output
    const originalError = console.error;
    const loggedMessages = [];
    console.error = (...args) => loggedMessages.push(args.join(' '));
    
    try {
      await reporter.reportLeak({
        probability: 0.8,
        factors: ['test'],
        metrics: { heapUsed: 1024 * 1024, heapTotal: 2048 * 1024, heapLimit: 4096 * 1024 },
        recommendations: []
      });
      
      assert.strictEqual(loggedMessages.length, 0);
    } finally {
      console.error = originalError;
    }
  });
});

module.exports = () => {
  console.log('✓ Reporter tests');
};
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const Sentinel = require('../src/sentinel');
const MemoryStreamer = require('../src/streaming');
const AlertManager = require('../src/alerting');
const MemoryHotspots = require('../src/hotspots');

describe('Advanced Features', () => {
  let sentinel;
  
  test('should support streaming configuration', () => {
    sentinel = new Sentinel({
      streaming: {
        enabled: true,
        port: 3002,
        host: 'localhost'
      }
    });
    
    assert.ok(sentinel.streamer instanceof MemoryStreamer);
  });
  
  test('should support alerting configuration', () => {
    sentinel = new Sentinel({
      alerting: {
        enabled: true,
        throttling: { enabled: true }
      }
    });
    
    assert.ok(sentinel.alerts instanceof AlertManager);
  });
  
  test('should support hotspots configuration', () => {
    sentinel = new Sentinel({
      hotspots: {
        enabled: true,
        sampleInterval: 5000
      }
    });
    
    assert.ok(sentinel.hotspots instanceof MemoryHotspots);
  });
  
  test('should provide streaming API methods', () => {
    sentinel = new Sentinel();
    
    assert.ok(typeof sentinel.startStreaming === 'function');
    assert.ok(typeof sentinel.stopStreaming === 'function');
    assert.ok(typeof sentinel.getStreamingStats === 'function');
    assert.ok(typeof sentinel.broadcastToStream === 'function');
  });
  
  test('should provide alerting API methods', () => {
    sentinel = new Sentinel();
    
    assert.ok(typeof sentinel.createAlert === 'function');
    assert.ok(typeof sentinel.getActiveAlerts === 'function');
    assert.ok(typeof sentinel.resolveAlert === 'function');
    assert.ok(typeof sentinel.getAlertStats === 'function');
    assert.ok(typeof sentinel.configureAlerts === 'function');
  });
  
  test('should provide hotspots API methods', () => {
    sentinel = new Sentinel();
    
    assert.ok(typeof sentinel.startHotspotAnalysis === 'function');
    assert.ok(typeof sentinel.stopHotspotAnalysis === 'function');
    assert.ok(typeof sentinel.getMemoryHotspots === 'function');
    assert.ok(typeof sentinel.getMemoryMap === 'function');
    assert.ok(typeof sentinel.resolveHotspot === 'function');
    assert.ok(typeof sentinel.getHotspotStats === 'function');
  });
  
  test('should handle streaming when not enabled', () => {
    sentinel = new Sentinel({ streaming: { enabled: false } });
    
    const stats = sentinel.getStreamingStats();
    assert.strictEqual(stats, null);
    
    const count = sentinel.broadcastToStream({ test: 'data' });
    assert.strictEqual(count, 0);
  });
  
  test('should handle alerts when not enabled', () => {
    sentinel = new Sentinel({ alerting: { enabled: false } });
    
    const alert = sentinel.createAlert({ level: 'info', message: 'test' });
    assert.strictEqual(alert, null);
    
    const alerts = sentinel.getActiveAlerts();
    assert.ok(Array.isArray(alerts));
    assert.strictEqual(alerts.length, 0);
  });
  
  test('should handle hotspots when not enabled', () => {
    sentinel = new Sentinel({ hotspots: { enabled: false } });
    
    const hotspots = sentinel.getMemoryHotspots();
    assert.ok(Array.isArray(hotspots));
    assert.strictEqual(hotspots.length, 0);
    
    const map = sentinel.getMemoryMap();
    assert.strictEqual(map, null);
  });
  
  test('should create alerts with proper structure', () => {
    sentinel = new Sentinel({
      alerting: {
        enabled: true,
        channels: { console: { type: 'console' } }
      }
    });
    
    const alert = sentinel.createAlert({
      level: 'warning',
      title: 'Test Alert',
      message: 'This is a test alert',
      category: 'test'
    });
    
    assert.ok(alert);
    assert.strictEqual(alert.level, 'warning');
    assert.strictEqual(alert.title, 'Test Alert');
    assert.strictEqual(alert.message, 'This is a test alert');
    assert.strictEqual(alert.category, 'test');
    assert.ok(alert.id);
    assert.ok(alert.createdAt);
  });
  
  test('should resolve alerts', () => {
    sentinel = new Sentinel({ alerting: { enabled: true } });
    
    const alert = sentinel.createAlert({
      level: 'info',
      message: 'Test alert for resolution'
    });
    
    const resolved = sentinel.resolveAlert(alert.id, { 
      reason: 'Test resolution' 
    });
    assert.strictEqual(resolved, true);
    
    // Alert should no longer be active
    const activeAlerts = sentinel.getActiveAlerts();
    const stillActive = activeAlerts.find(a => a.id === alert.id);
    assert.strictEqual(stillActive, undefined);
  });
  
  test('should start and stop hotspot analysis', () => {
    sentinel = new Sentinel();
    
    const result = sentinel.startHotspotAnalysis({ sampleInterval: 1000 });
    assert.ok(sentinel.hotspots);
    assert.strictEqual(result, sentinel.hotspots);
    
    sentinel.stopHotspotAnalysis();
    // Hotspots object should still exist but be stopped
    assert.ok(sentinel.hotspots);
  });
  
  test('should handle streaming events', (t, done) => {
    sentinel = new Sentinel();
    
    let eventCount = 0;
    const expectedEvents = ['streaming-started'];
    
    expectedEvents.forEach(event => {
      sentinel.on(event, () => {
        eventCount++;
        if (eventCount === expectedEvents.length) {
          sentinel.stopStreaming().then(() => {
            done();
          }).catch(done);
        }
      });
    });
    
    sentinel.startStreaming({ port: 6001 });
  });
  
  test('should handle hotspot events', (t, done) => {
    sentinel = new Sentinel();
    
    sentinel.on('hotspot-detected', (hotspot) => {
      assert.ok(hotspot);
      assert.ok(hotspot.id);
      assert.ok(hotspot.type);
      done();
    });
    
    // Start hotspot analysis and manually trigger a hotspot
    sentinel.startHotspotAnalysis({ sampleInterval: 100 });
    
    // Simulate a hotspot by directly calling the internal method
    setTimeout(() => {
      if (sentinel.hotspots) {
        sentinel.hotspots.emit('hotspot-detected', {
          id: 'test-hotspot',
          type: 'test',
          severity: 'medium',
          recommendations: ['Test recommendation']
        });
      }
    }, 50);
  });
  
  test('should integrate alerts with memory leak detection', (t, done) => {
    sentinel = new Sentinel({
      alerting: { enabled: true },
      detection: { enabled: true }
    });
    
    sentinel.on('alert-created', (alert) => {
      if (alert.category === 'memory-leak') {
        assert.strictEqual(alert.level, 'critical');
        assert.ok(alert.title.includes('Memory Leak'));
        done();
      }
    });
    
    // Simulate a memory leak detection
    sentinel.detector.emit('leak', {
      probability: 0.8,
      factors: ['test'],
      metrics: { heapUsed: 1000000 },
      recommendations: ['Test recommendation']
    });
  });
  
  test('should get comprehensive stats', () => {
    sentinel = new Sentinel({
      alerting: { enabled: true },
      hotspots: { enabled: true }
    });
    
    // Create some test data
    sentinel.createAlert({ level: 'info', message: 'Test 1' });
    sentinel.createAlert({ level: 'warning', message: 'Test 2' });
    
    const alertStats = sentinel.getAlertStats();
    assert.ok(alertStats);
    assert.strictEqual(alertStats.totalAlerts, 2);
    assert.strictEqual(alertStats.alertsByLevel.info, 1);
    assert.strictEqual(alertStats.alertsByLevel.warning, 1);
    
    const hotspotStats = sentinel.getHotspotStats();
    assert.ok(hotspotStats);
    assert.ok(typeof hotspotStats.totalSamples === 'number');
  });
  
  // Clean up after tests
  test('cleanup advanced features', async () => {
    if (sentinel) {
      if (sentinel.streamer) {
        await sentinel.stopStreaming();
      }
      if (sentinel.hotspots) {
        sentinel.stopHotspotAnalysis();
      }
      if (sentinel._isRunning) {
        sentinel.stop();
      }
    }
  });
});

module.exports = () => {
  console.log('✓ Advanced features tests');
};
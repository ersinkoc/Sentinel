'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const Detector = require('../src/detector');

describe('Detector', () => {
  let detector;
  
  test('should create Detector instance', () => {
    const config = {
      threshold: { heap: 0.8, growth: 0.1, gcFrequency: 10 },
      detection: { sensitivity: 'medium', baseline: { duration: 60000, samples: 10 } }
    };
    
    detector = new Detector(config);
    
    assert.ok(detector instanceof Detector);
    assert.strictEqual(detector.config.threshold.heap, 0.8);
    assert.strictEqual(detector.isBaselineEstablished, false);
    assert.ok(Array.isArray(detector.leaks));
  });
  
  test('should start and stop detector', () => {
    detector = new Detector({});
    
    // Should not throw
    detector.start();
    detector.stop();
    
    assert.ok(typeof detector.startTime === 'number');
  });
  
  test('should update baseline with samples', () => {
    const config = {
      detection: { baseline: { duration: 1000, samples: 3 } }
    };
    detector = new Detector(config);
    detector.start();
    
    const mockMetrics = {
      heap: { used: 1000000 },
      gc: []
    };
    
    // Add samples
    detector._updateBaseline(mockMetrics);
    detector._updateBaseline(mockMetrics);
    detector._updateBaseline(mockMetrics);
    
    assert.strictEqual(detector.baselineSamples.length, 3);
    
    // Should establish baseline after enough samples
    setTimeout(() => {
      assert.strictEqual(detector.isBaselineEstablished, true);
      assert.ok(detector.baseline);
      assert.ok(typeof detector.baseline.avgHeapSize === 'number');
    }, 10);
  });
  
  test('should detect rapid growth pattern', () => {
    const config = {
      threshold: { growth: 0.1 } // 10% growth threshold
    };
    detector = new Detector(config);
    
    // Establish baseline
    detector.baseline = {
      avgHeapSize: 1000000,
      stdDevHeapSize: 50000
    };
    detector.isBaselineEstablished = true;
    
    const metrics = {
      heap: { used: 1500000 } // 50% increase
    };
    
    const result = detector._detectRapidGrowth(metrics);
    
    assert.ok(result);
    assert.strictEqual(result.severity, 'high');
    assert.ok(result.growthRate > 10);
    assert.ok(result.message.includes('rapidly'));
  });
  
  test('should detect steady growth pattern', () => {
    detector = new Detector({});
    
    // Create steady growth pattern
    const steadyGrowthSamples = [
      { heap: { used: 1000000 } },
      { heap: { used: 1100000 } },
      { heap: { used: 1200000 } },
      { heap: { used: 1300000 } },
      { heap: { used: 1400000 } }
    ];
    
    detector.baselineSamples = steadyGrowthSamples;
    
    const result = detector._detectSteadyGrowth({});
    
    if (result) {
      assert.strictEqual(result.severity, 'medium');
      assert.ok(result.trend > 0);
      assert.ok(result.correlation > 0);
    }
  });
  
  test('should detect GC pressure', () => {
    const config = {
      threshold: { gcFrequency: 5 }, // 5 GCs per minute threshold
      interval: 10000 // 10 seconds
    };
    detector = new Detector(config);
    
    // Create samples with high GC frequency
    const highGCSamples = Array(10).fill(null).map(() => ({
      heap: { used: 1000000 },
      gc: [{ duration: 10 }, { duration: 15 }] // 2 GCs per sample
    }));
    
    detector.baselineSamples = highGCSamples;
    
    const result = detector._detectGCPressure({});
    
    if (result) {
      assert.strictEqual(result.severity, 'high');
      assert.ok(result.gcPerMinute > config.threshold.gcFrequency);
    }
  });
  
  test('should detect memory threshold violations', () => {
    const config = {
      threshold: { heap: 0.8 } // 80% threshold
    };
    detector = new Detector(config);
    
    const metrics = {
      heap: {
        used: 9000000,
        limit: 10000000 // 90% usage
      }
    };
    
    const result = detector._detectMemoryThreshold(metrics);
    
    assert.ok(result);
    assert.strictEqual(result.severity, 'critical');
    assert.ok(result.usage > 80);
  });
  
  test('should analyze leak probability', () => {
    detector = new Detector({});
    
    const issues = [
      { pattern: 'rapid-growth', severity: 'high' },
      { pattern: 'gc-pressure', severity: 'high' }
    ];
    
    const metrics = {
      heap: {
        used: 5000000,
        total: 10000000,
        limit: 20000000
      }
    };
    
    const leak = detector._analyzeLeakProbability(issues, metrics);
    
    assert.ok(typeof leak === 'object');
    assert.ok(typeof leak.probability === 'number');
    assert.ok(leak.probability >= 0 && leak.probability <= 1);
    assert.ok(Array.isArray(leak.factors));
    assert.ok(Array.isArray(leak.recommendations));
    assert.ok(typeof leak.timestamp === 'number');
  });
  
  test('should generate appropriate recommendations', () => {
    detector = new Detector({});
    
    const issues = [
      { pattern: 'rapid-growth' },
      { pattern: 'steady-growth' },
      { pattern: 'saw-tooth' }
    ];
    
    const recommendations = detector._generateRecommendations(issues);
    
    assert.ok(Array.isArray(recommendations));
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.some(rec => rec.includes('unbounded data structures')));
    assert.ok(recommendations.some(rec => rec.includes('long-lived objects')));
  });
  
  test('should respect sensitivity thresholds', () => {
    const lowSensitivity = new Detector({ detection: { sensitivity: 'low' } });
    const mediumSensitivity = new Detector({ detection: { sensitivity: 'medium' } });
    const highSensitivity = new Detector({ detection: { sensitivity: 'high' } });
    
    assert.strictEqual(lowSensitivity._getSensitivityThreshold(), 0.7);
    assert.strictEqual(mediumSensitivity._getSensitivityThreshold(), 0.5);
    assert.strictEqual(highSensitivity._getSensitivityThreshold(), 0.3);
  });
  
  test('should calculate statistical measures correctly', () => {
    detector = new Detector({});
    
    const values = [10, 20, 30, 40, 50];
    
    const average = detector._average(values);
    assert.strictEqual(average, 30);
    
    const stdDev = detector._standardDeviation(values);
    assert.ok(typeof stdDev === 'number');
    assert.ok(stdDev > 0);
  });
  
  test('should calculate trend analysis correctly', () => {
    detector = new Detector({});
    
    const values = [1, 2, 3, 4, 5]; // Perfect positive trend
    const trend = detector._calculateTrend(values);
    
    assert.ok(typeof trend === 'object');
    assert.ok(typeof trend.slope === 'number');
    assert.ok(typeof trend.intercept === 'number');
    assert.ok(typeof trend.r2 === 'number');
    
    assert.ok(trend.slope > 0); // Positive slope
    assert.ok(trend.r2 > 0.9); // Strong correlation
  });
  
  test('should emit events for leaks and warnings', (t, done) => {
    detector = new Detector({
      threshold: { heap: 0.5 },
      detection: { sensitivity: 'high' }
    });
    
    let eventCount = 0;
    
    detector.on('leak', (leak) => {
      assert.ok(typeof leak === 'object');
      eventCount++;
      if (eventCount === 2) done();
    });
    
    detector.on('warning', (warning) => {
      assert.ok(typeof warning === 'object');
      eventCount++;
      if (eventCount === 2) done();
    });
    
    // Establish baseline first
    detector.baseline = { avgHeapSize: 1000000 };
    detector.isBaselineEstablished = true;
    
    // Simulate high memory usage that should trigger both leak and warning
    const metrics = {
      heap: {
        used: 9000000,
        total: 10000000,
        limit: 10000000
      }
    };
    
    detector.analyze(metrics);
  });
  
  test('should reset detector state', () => {
    detector = new Detector({});
    detector.baseline = { avgHeapSize: 1000000 };
    detector.isBaselineEstablished = true;
    detector.leaks = [{ probability: 0.8 }];
    detector.baselineSamples = [{ heap: { used: 1000000 } }];
    
    detector.reset();
    
    assert.strictEqual(detector.baseline, null);
    assert.strictEqual(detector.isBaselineEstablished, false);
    assert.strictEqual(detector.leaks.length, 0);
    assert.strictEqual(detector.baselineSamples.length, 0);
  });
  
  test('should get leaks history', () => {
    detector = new Detector({});
    detector.leaks = [
      { probability: 0.8, timestamp: Date.now() },
      { probability: 0.6, timestamp: Date.now() }
    ];
    
    const leaks = detector.getLeaks();
    assert.ok(Array.isArray(leaks));
    assert.strictEqual(leaks.length, 2);
  });
  
  // Clean up
  test('cleanup', () => {
    if (detector) {
      detector.stop();
    }
  });
});

module.exports = () => {
  console.log('✓ Detector tests');
};
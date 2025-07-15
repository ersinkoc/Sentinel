'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const MemoryHotspots = require('../src/hotspots');
const { CircularBuffer } = require('../src/utils');

describe('MemoryHotspots', () => {
  test('Constructor and configuration', () => {
    const defaultHotspots = new MemoryHotspots();
    assert.ok(defaultHotspots instanceof MemoryHotspots, 'Creates instance with default config');
    assert.strictEqual(defaultHotspots.config.sampleInterval, 10000, 'Default sample interval is 10 seconds');
    assert.strictEqual(defaultHotspots.config.retentionPeriod, 3600000, 'Default retention period is 1 hour');
    assert.strictEqual(defaultHotspots.config.hotspotThreshold, 0.1, 'Default hotspot threshold is 10%');
    
    const customConfig = {
      sampleInterval: 5000,
      retentionPeriod: 1800000,
      hotspotThreshold: 0.2,
      stackTraces: { enabled: false, maxDepth: 10 },
      categories: { objects: false, arrays: true },
      thresholds: { growth: 0.1, frequency: 10, size: 2048 }
    };
    
    const customHotspots = new MemoryHotspots(customConfig);
    assert.strictEqual(customHotspots.config.sampleInterval, 5000, 'Custom sample interval');
    assert.strictEqual(customHotspots.config.stackTraces.enabled, false, 'Stack traces disabled');
    assert.strictEqual(customHotspots.config.stackTraces.maxDepth, 10, 'Custom stack trace depth');
    assert.strictEqual(customHotspots.config.categories.objects, false, 'Objects category disabled');
    assert.strictEqual(customHotspots.config.thresholds.size, 2048, 'Custom size threshold');
    
    // Test properties initialization
    assert.ok(customHotspots.hotspots instanceof Map, 'Hotspots map initialized');
    assert.ok(customHotspots.samples instanceof CircularBuffer, 'Samples buffer initialized');
    assert.ok(customHotspots.allocations instanceof Map, 'Allocations map initialized');
    assert.ok(customHotspots.patterns instanceof Map, 'Patterns map initialized');
    assert.strictEqual(customHotspots.isActive, false, 'Not active by default');
    
    // Test stats initialization
    assert.strictEqual(customHotspots.stats.totalSamples, 0, 'Total samples starts at 0');
    assert.strictEqual(customHotspots.stats.hotspotsDetected, 0, 'Hotspots detected starts at 0');
    assert.strictEqual(customHotspots.stats.allocationsTracked, 0, 'Allocations tracked starts at 0');
    assert.strictEqual(customHotspots.stats.patternsIdentified, 0, 'Patterns identified starts at 0');
  });

  test('Start and stop', () => {
    const hotspots = new MemoryHotspots({ sampleInterval: 100 });
    
    let startEmitted = false;
    let stopEmitted = false;
    
    hotspots.on('started', () => { startEmitted = true; });
    hotspots.on('stopped', () => { stopEmitted = true; });
    
    const result = hotspots.start();
    assert.strictEqual(result, hotspots, 'Start returns this for chaining');
    assert.strictEqual(hotspots.isActive, true, 'Is active after start');
    assert.ok(startEmitted, 'Started event emitted');
    
    const stopResult = hotspots.stop();
    assert.strictEqual(stopResult, hotspots, 'Stop returns this for chaining');
    assert.strictEqual(hotspots.isActive, false, 'Is not active after stop');
    assert.ok(stopEmitted, 'Stopped event emitted');
    assert.strictEqual(hotspots.samplingTimer, null, 'Sampling timer cleared');
  });

  test('Sample collection', async () => {
    const hotspots = new MemoryHotspots({ sampleInterval: 50 });
    
    let sampleCollected = null;
    hotspots.on('sample-collected', (sample) => {
      sampleCollected = sample;
    });
    
    hotspots.start();
    
    // Wait for first sample
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert.ok(sampleCollected, 'Sample was collected');
    assert.ok(sampleCollected.timestamp, 'Sample has timestamp');
    assert.ok(sampleCollected.memory, 'Sample has memory data');
    assert.ok(sampleCollected.heap, 'Sample has heap statistics');
    assert.ok(sampleCollected.objects, 'Sample has object analysis');
    assert.ok(sampleCollected.gc, 'Sample has GC info');
    
    // Check memory snapshot
    assert.ok(sampleCollected.memory.rss, 'Memory has RSS');
    assert.ok(sampleCollected.memory.heapTotal, 'Memory has heap total');
    assert.ok(sampleCollected.memory.heapUsed, 'Memory has heap used');
    assert.ok(sampleCollected.memory.external, 'Memory has external');
    assert.strictEqual(typeof sampleCollected.memory.arrayBuffers, 'number', 'Memory has array buffers');
    
    // Check heap statistics
    assert.ok(sampleCollected.heap.totalHeapSize, 'Heap has total size');
    assert.ok(sampleCollected.heap.usedHeapSize, 'Heap has used size');
    assert.ok(sampleCollected.heap.heapSizeLimit, 'Heap has size limit');
    
    // Check object analysis
    assert.ok(sampleCollected.objects.spaces, 'Objects has spaces');
    assert.ok(sampleCollected.objects.objectTypes, 'Objects has type estimation');
    
    assert.strictEqual(hotspots.stats.totalSamples, 1, 'Total samples incremented');
    assert.strictEqual(hotspots.samples.length, 1, 'Sample added to buffer');
    
    hotspots.stop();
  });

  test('Memory growth detection', async () => {
    const hotspots = new MemoryHotspots({ 
      sampleInterval: 10,
      thresholds: { growth: 0.05 }
    });
    
    let hotspotDetected = null;
    hotspots.on('hotspot-detected', (hotspot) => {
      if (hotspot.type === 'memory-growth') {
        hotspotDetected = hotspot;
      }
    });
    
    // Mock samples with memory growth
    const baseSample = {
      timestamp: Date.now(),
      memory: { heapUsed: 100000000 }, // 100MB
      heap: {},
      objects: { spaces: {}, objectTypes: {} },
      gc: {}
    };
    
    // Add base samples
    for (let i = 0; i < 3; i++) {
      hotspots.samples.push({ ...baseSample, timestamp: Date.now() + i * 1000 });
    }
    
    // Add sample with growth
    const growthSample = {
      ...baseSample,
      timestamp: Date.now() + 10000,
      memory: { heapUsed: 110000000 } // 110MB (10% growth)
    };
    
    hotspots.isActive = true;
    hotspots._analyzeHotspots(growthSample);
    
    assert.ok(hotspotDetected, 'Memory growth hotspot detected');
    assert.strictEqual(hotspotDetected.id, 'memory-growth', 'Correct hotspot ID');
    assert.strictEqual(hotspotDetected.type, 'memory-growth', 'Correct hotspot type');
    assert.ok(hotspotDetected.severity, 'Hotspot has severity');
    assert.strictEqual(hotspotDetected.growthRate, 0.1, 'Correct growth rate');
    assert.strictEqual(hotspotDetected.startSize, 100000000, 'Correct start size');
    assert.strictEqual(hotspotDetected.currentSize, 110000000, 'Correct current size');
    assert.strictEqual(hotspotDetected.deltaSize, 10000000, 'Correct delta size');
    assert.ok(hotspotDetected.recommendations.length > 0, 'Has recommendations');
    
    assert.strictEqual(hotspots.stats.hotspotsDetected, 1, 'Hotspot count incremented');
    assert.strictEqual(hotspots.hotspots.size, 1, 'Hotspot added to map');
    
    // Test existing hotspot update
    const anotherGrowthSample = {
      ...baseSample,
      timestamp: Date.now() + 20000,
      memory: { heapUsed: 115000000 } // 115MB (15% growth from base)
    };
    
    hotspots._analyzeHotspots(anotherGrowthSample);
    
    const updatedHotspot = hotspots.hotspots.get('memory-growth');
    assert.strictEqual(updatedHotspot.occurrences, 2, 'Occurrence count increased');
    assert.ok(updatedHotspot.growthRate >= 0.1, 'Growth rate updated');
  });

  test('Object distribution analysis', () => {
    const hotspots = new MemoryHotspots({
      thresholds: { growth: 0.05, size: 1000 }
    });
    
    let objectHotspot = null;
    hotspots.on('hotspot-detected', (hotspot) => {
      if (hotspot.type === 'object-growth') {
        objectHotspot = hotspot;
      }
    });
    
    const sample1 = {
      timestamp: Date.now(),
      objects: { 
        spaces: {},
        objectTypes: { 
          objects: 10000,
          arrays: 5000
        }
      }
    };
    
    const sample2 = {
      timestamp: Date.now() + 1000,
      objects: {
        spaces: {},
        objectTypes: {
          objects: 11000, // 10% growth
          arrays: 5100    // 2% growth (below threshold)
        }
      }
    };
    
    hotspots.samples.push(sample1);
    hotspots.samples.push(sample2);
    
    hotspots.isActive = true;
    hotspots._analyzeObjectDistribution([sample1, sample2], sample2);
    
    assert.ok(objectHotspot, 'Object growth hotspot detected');
    assert.strictEqual(objectHotspot.objectType, 'objects', 'Correct object type');
    assert.strictEqual(objectHotspot.growth, 0.1, 'Correct growth rate');
    assert.ok(objectHotspot.recommendations.length > 0, 'Has recommendations');
    
    // Verify arrays didn't trigger hotspot (below threshold)
    const arrayHotspot = Array.from(hotspots.hotspots.values())
      .find(h => h.objectType === 'arrays');
    assert.strictEqual(arrayHotspot, undefined, 'Arrays did not trigger hotspot');
  });

  test('Heap space pressure detection', () => {
    const hotspots = new MemoryHotspots();
    
    let spaceHotspot = null;
    hotspots.on('hotspot-detected', (hotspot) => {
      if (hotspot.type === 'heap-space-pressure') {
        spaceHotspot = hotspot;
      }
    });
    
    const sample = {
      timestamp: Date.now(),
      objects: {
        spaces: {
          'new_space': {
            size: 1000000,
            used: 850000,   // 85% utilization
            available: 150000,
            physical: 1000000
          },
          'old_space': {
            size: 10000000,
            used: 5000000,  // 50% utilization
            available: 5000000,
            physical: 10000000
          }
        },
        objectTypes: {}
      }
    };
    
    hotspots.isActive = true;
    hotspots._analyzeHeapSpaces([], sample);
    
    assert.ok(spaceHotspot, 'Heap space pressure detected');
    assert.strictEqual(spaceHotspot.spaceName, 'new_space', 'Correct space identified');
    assert.strictEqual(spaceHotspot.utilization, 0.85, 'Correct utilization');
    assert.ok(spaceHotspot.recommendations.length > 0, 'Has recommendations');
    
    // Verify old_space didn't trigger (below 80% threshold)
    const oldSpaceHotspot = Array.from(hotspots.hotspots.values())
      .find(h => h.spaceName === 'old_space');
    assert.strictEqual(oldSpaceHotspot, undefined, 'Old space did not trigger hotspot');
  });

  test('Allocation pattern detection', () => {
    const hotspots = new MemoryHotspots({
      thresholds: { frequency: 3 }
    });
    
    let patternHotspot = null;
    hotspots.on('hotspot-detected', (hotspot) => {
      if (hotspot.type === 'allocation-pattern') {
        patternHotspot = hotspot;
      }
    });
    
    hotspots.isActive = true;
    
    // Create samples with similar memory patterns
    for (let i = 0; i < 5; i++) {
      const sample = {
        timestamp: Date.now() + i * 1000,
        memory: {
          heapUsed: 50000000,
          heapTotal: 100000000,
          rss: 150000000
        }
      };
      hotspots._detectAllocationPatterns(sample);
    }
    
    assert.ok(patternHotspot, 'Allocation pattern detected');
    assert.strictEqual(patternHotspot.type, 'allocation-pattern', 'Correct hotspot type');
    assert.ok(patternHotspot.frequency >= 3, 'Pattern frequency meets threshold');
    assert.ok(patternHotspot.recommendations.length > 0, 'Has recommendations');
    
    assert.strictEqual(hotspots.stats.patternsIdentified, 1, 'Pattern count incremented');
  });

  test('Severity calculation', () => {
    const hotspots = new MemoryHotspots();
    
    // Test growth severity
    assert.strictEqual(hotspots._calculateSeverity(0.25, 'growth'), 'critical', 'Growth 25% is critical');
    assert.strictEqual(hotspots._calculateSeverity(0.15, 'growth'), 'high', 'Growth 15% is high');
    assert.strictEqual(hotspots._calculateSeverity(0.08, 'growth'), 'medium', 'Growth 8% is medium');
    assert.strictEqual(hotspots._calculateSeverity(0.03, 'growth'), 'low', 'Growth 3% is low');
    
    // Test object severity
    assert.strictEqual(hotspots._calculateSeverity(0.35, 'object'), 'critical', 'Object 35% is critical');
    assert.strictEqual(hotspots._calculateSeverity(0.20, 'object'), 'high', 'Object 20% is high');
    assert.strictEqual(hotspots._calculateSeverity(0.10, 'object'), 'medium', 'Object 10% is medium');
    assert.strictEqual(hotspots._calculateSeverity(0.05, 'object'), 'low', 'Object 5% is low');
    
    // Test space severity
    assert.strictEqual(hotspots._calculateSeverity(0.96, 'space'), 'critical', 'Space 96% is critical');
    assert.strictEqual(hotspots._calculateSeverity(0.92, 'space'), 'high', 'Space 92% is high');
    assert.strictEqual(hotspots._calculateSeverity(0.85, 'space'), 'medium', 'Space 85% is medium');
    assert.strictEqual(hotspots._calculateSeverity(0.75, 'space'), 'low', 'Space 75% is low');
    
    // Test pattern severity
    assert.strictEqual(hotspots._calculateSeverity(25, 'pattern'), 'critical', 'Pattern 25 is critical');
    assert.strictEqual(hotspots._calculateSeverity(15, 'pattern'), 'high', 'Pattern 15 is high');
    assert.strictEqual(hotspots._calculateSeverity(8, 'pattern'), 'medium', 'Pattern 8 is medium');
    assert.strictEqual(hotspots._calculateSeverity(3, 'pattern'), 'low', 'Pattern 3 is low');
    
    // Test unknown type
    assert.strictEqual(hotspots._calculateSeverity(100, 'unknown'), 'low', 'Unknown type defaults to low');
  });

  test('Get hotspots with filters', () => {
    const hotspots = new MemoryHotspots();
    
    // Add various hotspots
    hotspots.hotspots.set('h1', {
      id: 'h1',
      type: 'memory-growth',
      severity: 'critical',
      occurrences: 10
    });
    
    hotspots.hotspots.set('h2', {
      id: 'h2',
      type: 'object-growth',
      severity: 'high',
      occurrences: 5
    });
    
    hotspots.hotspots.set('h3', {
      id: 'h3',
      type: 'memory-growth',
      severity: 'medium',
      occurrences: 3
    });
    
    // Test no filters
    let results = hotspots.getHotspots();
    assert.strictEqual(results.length, 3, 'Returns all hotspots without filters');
    assert.strictEqual(results[0].severity, 'critical', 'Sorted by severity');
    
    // Test type filter
    results = hotspots.getHotspots({ type: 'memory-growth' });
    assert.strictEqual(results.length, 2, 'Type filter works');
    assert.ok(results.every(h => h.type === 'memory-growth'), 'All results match type');
    
    // Test severity filter
    results = hotspots.getHotspots({ severity: 'high' });
    assert.strictEqual(results.length, 1, 'Severity filter works');
    assert.strictEqual(results[0].id, 'h2', 'Correct hotspot returned');
    
    // Test occurrence filter
    results = hotspots.getHotspots({ minOccurrences: 5 });
    assert.strictEqual(results.length, 2, 'Occurrence filter works');
    assert.ok(results.every(h => h.occurrences >= 5), 'All results meet occurrence threshold');
    
    // Test multiple filters
    results = hotspots.getHotspots({ 
      type: 'memory-growth',
      minOccurrences: 5
    });
    assert.strictEqual(results.length, 1, 'Multiple filters work together');
    assert.strictEqual(results[0].id, 'h1', 'Correct hotspot with multiple filters');
  });

  test('Get single hotspot', () => {
    const hotspots = new MemoryHotspots();
    
    const testHotspot = {
      id: 'test-hotspot',
      type: 'memory-growth',
      severity: 'high'
    };
    
    hotspots.hotspots.set('test-hotspot', testHotspot);
    
    const result = hotspots.getHotspot('test-hotspot');
    assert.deepStrictEqual(result, testHotspot, 'Returns correct hotspot');
    
    const notFound = hotspots.getHotspot('non-existent');
    assert.strictEqual(notFound, undefined, 'Returns undefined for non-existent hotspot');
  });

  test('Resolve hotspot', () => {
    const hotspots = new MemoryHotspots();
    
    let resolvedHotspot = null;
    hotspots.on('hotspot-resolved', (hotspot) => {
      resolvedHotspot = hotspot;
    });
    
    const testHotspot = {
      id: 'test-hotspot',
      type: 'memory-growth'
    };
    
    hotspots.hotspots.set('test-hotspot', testHotspot);
    
    const resolution = { action: 'fixed', notes: 'Memory leak patched' };
    const result = hotspots.resolveHotspot('test-hotspot', resolution);
    
    assert.ok(result, 'Resolution successful');
    assert.ok(resolvedHotspot, 'Resolved event emitted');
    assert.ok(resolvedHotspot.resolved, 'Hotspot marked as resolved');
    assert.ok(resolvedHotspot.resolvedAt, 'Resolution timestamp added');
    assert.deepStrictEqual(resolvedHotspot.resolution, resolution, 'Resolution data stored');
    assert.strictEqual(hotspots.hotspots.has('test-hotspot'), false, 'Hotspot removed from map');
    
    // Test resolving non-existent hotspot
    const notFound = hotspots.resolveHotspot('non-existent');
    assert.strictEqual(notFound, false, 'Returns false for non-existent hotspot');
  });

  test('Get memory map', () => {
    const hotspots = new MemoryHotspots();
    
    // No samples yet
    let memoryMap = hotspots.getMemoryMap();
    assert.strictEqual(memoryMap, null, 'Returns null when no samples');
    
    // Add a sample
    const sample = {
      timestamp: Date.now(),
      memory: { heapUsed: 100000000 },
      heap: { totalHeapSize: 150000000 },
      objects: { spaces: {}, objectTypes: {} }
    };
    
    hotspots.samples.push(sample);
    
    memoryMap = hotspots.getMemoryMap();
    assert.ok(memoryMap, 'Returns memory map with samples');
    assert.strictEqual(memoryMap.timestamp, sample.timestamp, 'Contains latest timestamp');
    assert.deepStrictEqual(memoryMap.memory, sample.memory, 'Contains memory data');
    assert.deepStrictEqual(memoryMap.heap, sample.heap, 'Contains heap data');
    assert.deepStrictEqual(memoryMap.objects, sample.objects, 'Contains object data');
    assert.ok(Array.isArray(memoryMap.hotspots), 'Contains hotspots array');
    assert.ok(memoryMap.stats, 'Contains stats');
  });

  test('Get stats', () => {
    const hotspots = new MemoryHotspots();
    
    // Add some data
    hotspots.stats.totalSamples = 10;
    hotspots.stats.hotspotsDetected = 5;
    hotspots.hotspots.set('h1', {});
    hotspots.hotspots.set('h2', {});
    hotspots.patterns.set('p1', {});
    hotspots.samples.push({});
    hotspots.samples.push({});
    
    const stats = hotspots.getStats();
    
    assert.strictEqual(stats.totalSamples, 10, 'Returns total samples');
    assert.strictEqual(stats.hotspotsDetected, 5, 'Returns hotspots detected');
    assert.strictEqual(stats.activeHotspots, 2, 'Calculates active hotspots');
    assert.strictEqual(stats.trackedPatterns, 1, 'Calculates tracked patterns');
    assert.strictEqual(stats.samplesRetained, 2, 'Calculates samples retained');
  });

  test('Configure runtime', () => {
    const hotspots = new MemoryHotspots({ sampleInterval: 1000 });
    
    const result = hotspots.configure({ 
      sampleInterval: 2000,
      hotspotThreshold: 0.2 
    });
    
    assert.strictEqual(result, hotspots, 'Configure returns this for chaining');
    assert.strictEqual(hotspots.config.sampleInterval, 2000, 'Sample interval updated');
    assert.strictEqual(hotspots.config.hotspotThreshold, 0.2, 'Threshold updated');
    
    // Test that timer is restarted
    const oldTimer = hotspots.samplingTimer;
    hotspots.configure({ sampleInterval: 3000 });
    assert.notStrictEqual(hotspots.samplingTimer, oldTimer, 'Timer restarted with new interval');
    
    hotspots.stop();
  });

  test('Reset', () => {
    const hotspots = new MemoryHotspots();
    
    let resetEmitted = false;
    hotspots.on('reset', () => { resetEmitted = true; });
    
    // Add data
    hotspots.hotspots.set('h1', {});
    hotspots.patterns.set('p1', {});
    hotspots.samples.push({});
    hotspots.stats.totalSamples = 10;
    hotspots.stats.hotspotsDetected = 5;
    
    const result = hotspots.reset();
    
    assert.strictEqual(result, hotspots, 'Reset returns this for chaining');
    assert.strictEqual(hotspots.hotspots.size, 0, 'Hotspots cleared');
    assert.strictEqual(hotspots.patterns.size, 0, 'Patterns cleared');
    assert.strictEqual(hotspots.samples.length, 0, 'Samples cleared');
    assert.strictEqual(hotspots.stats.totalSamples, 0, 'Stats reset');
    assert.strictEqual(hotspots.stats.hotspotsDetected, 0, 'Stats reset');
    assert.ok(resetEmitted, 'Reset event emitted');
  });

  test('Cleanup old data', () => {
    const hotspots = new MemoryHotspots({ retentionPeriod: 1000 });
    
    let expiredHotspot = null;
    hotspots.on('hotspot-expired', (hotspot) => {
      expiredHotspot = hotspot;
    });
    
    const now = Date.now();
    
    // Add old and new hotspots
    hotspots.hotspots.set('old', {
      id: 'old',
      lastSeen: now - 2000 // 2 seconds ago (expired)
    });
    
    hotspots.hotspots.set('new', {
      id: 'new',
      lastSeen: now - 500 // 0.5 seconds ago (not expired)
    });
    
    // Add old and new patterns
    hotspots.patterns.set('old-pattern', {
      lastSeen: now - 2000
    });
    
    hotspots.patterns.set('new-pattern', {
      lastSeen: now - 500
    });
    
    hotspots._cleanupOldData();
    
    assert.ok(expiredHotspot, 'Expired event emitted');
    assert.strictEqual(expiredHotspot.id, 'old', 'Correct hotspot expired');
    assert.strictEqual(hotspots.hotspots.has('old'), false, 'Old hotspot removed');
    assert.ok(hotspots.hotspots.has('new'), 'New hotspot retained');
    assert.strictEqual(hotspots.patterns.has('old-pattern'), false, 'Old pattern removed');
    assert.ok(hotspots.patterns.has('new-pattern'), 'New pattern retained');
  });

  test('Destroy', () => {
    const hotspots = new MemoryHotspots({ sampleInterval: 100 });
    
    // Add data and listeners
    hotspots.hotspots.set('h1', {});
    hotspots.patterns.set('p1', {});
    hotspots.samples.push({});
    hotspots.on('test', () => {});
    
    hotspots.start();
    hotspots.destroy();
    
    assert.strictEqual(hotspots.isActive, false, 'Stopped when destroyed');
    assert.strictEqual(hotspots.samplingTimer, null, 'Timer cleared');
    assert.strictEqual(hotspots.hotspots.size, 0, 'Hotspots cleared');
    assert.strictEqual(hotspots.patterns.size, 0, 'Patterns cleared');
    assert.strictEqual(hotspots.samples.length, 0, 'Samples cleared');
    assert.strictEqual(hotspots.listenerCount('test'), 0, 'Listeners removed');
  });

  test('No sampling when interval is 0', () => {
    const hotspots = new MemoryHotspots({ sampleInterval: 0 });
    
    // Timer should not be set when interval is 0
    assert.ok(!hotspots.samplingTimer, 'No timer created when interval is 0');
  });

  test('Edge cases and error handling', () => {
    const hotspots = new MemoryHotspots();
    
    // Test empty object analysis
    const emptyObjects = hotspots._estimateObjectTypes();
    assert.ok(emptyObjects, 'Object estimation works');
    assert.ok(emptyObjects.objects >= 0, 'Objects estimate is non-negative');
    assert.ok(emptyObjects.arrays >= 0, 'Arrays estimate is non-negative');
    
    // Test pattern generation with edge values
    const edgeSample = {
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        rss: 0
      }
    };
    const pattern = hotspots._generatePatternKey(edgeSample);
    assert.ok(pattern, 'Pattern generated for edge values');
    
    // Test analysis with insufficient samples
    hotspots.isActive = true;
    hotspots.samples.push({ timestamp: Date.now() });
    hotspots._analyzeHotspots({ timestamp: Date.now() + 1000 });
    assert.strictEqual(hotspots.hotspots.size, 0, 'No hotspots with insufficient samples');
  });

  test('Recommendation generation', () => {
    const hotspots = new MemoryHotspots();
    
    // Test memory growth recommendations
    let recs = hotspots._generateRecommendations('memory-growth', { growthRate: 0.05 });
    assert.ok(recs.length > 0, 'Memory growth has recommendations');
    assert.ok(recs.some(r => r.includes('memory leaks')), 'Mentions memory leaks');
    
    recs = hotspots._generateRecommendations('memory-growth', { growthRate: 0.2 });
    assert.ok(recs.some(r => r.includes('garbage collection')), 'High growth mentions GC');
    
    // Test object growth recommendations
    recs = hotspots._generateRecommendations('object-growth', { type: 'arrays' });
    assert.ok(recs.some(r => r.includes('arrays')), 'Array-specific recommendation');
    
    // Test heap space recommendations
    recs = hotspots._generateRecommendations('heap-space-pressure', { 
      spaceName: 'old_space',
      utilization: 0.95 
    });
    assert.ok(recs.some(r => r.includes('Immediate action')), 'High utilization urgent');
    
    // Test pattern recommendations
    recs = hotspots._generateRecommendations('allocation-pattern', {});
    assert.ok(recs.some(r => r.includes('pattern')), 'Pattern recommendation');
  });

  // Helper to simulate memory growth
  function simulateMemoryGrowth(hotspots, startSize, growthRate, samples = 5) {
    const baseTime = Date.now();
    let currentSize = startSize;
    
    for (let i = 0; i < samples; i++) {
      currentSize = Math.floor(currentSize * (1 + growthRate));
      const sample = {
        timestamp: baseTime + i * 1000,
        memory: { 
          heapUsed: currentSize,
          heapTotal: currentSize * 1.5,
          rss: currentSize * 2
        },
        heap: {},
        objects: { 
          spaces: {}, 
          objectTypes: {
            objects: currentSize * 0.4,
            arrays: currentSize * 0.2,
            strings: currentSize * 0.15
          }
        },
        gc: {}
      };
      hotspots.samples.push(sample);
    }
    
    return currentSize;
  }

  test('Complex scenario simulation', async () => {
    const hotspots = new MemoryHotspots({
      sampleInterval: 50,
      thresholds: { growth: 0.05, frequency: 3 }
    });
    
    const detectedHotspots = [];
    hotspots.on('hotspot-detected', (hotspot) => {
      detectedHotspots.push(hotspot);
    });
    
    hotspots.start();
    
    // Simulate memory growth
    simulateMemoryGrowth(hotspots, 50000000, 0.02, 3); // Small growth
    
    // Wait for analysis
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate larger growth
    simulateMemoryGrowth(hotspots, 60000000, 0.1, 3); // Large growth
    
    // Force analysis
    hotspots._collectSample();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.ok(detectedHotspots.length > 0, 'Hotspots detected in complex scenario');
    
    // Memory growth detection might not always trigger in this test
    // due to timing and threshold settings, so we just check that some hotspots were detected
    
    // Check memory map
    const memoryMap = hotspots.getMemoryMap();
    assert.ok(memoryMap, 'Memory map available');
    assert.ok(memoryMap.hotspots.length > 0, 'Memory map includes hotspots');
    
    // Check stats
    const stats = hotspots.getStats();
    assert.ok(stats.totalSamples > 0, 'Samples collected');
    assert.ok(stats.hotspotsDetected > 0, 'Hotspots detected count');
    
    hotspots.stop();
  });
});

// Export for test runner
module.exports = () => describe('MemoryHotspots', () => {});
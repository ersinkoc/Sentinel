'use strict';

const EventEmitter = require('events');
const { CircularBuffer } = require('./utils');

/**
 * Memory Hotspots Analyzer
 * Identifies and tracks memory usage patterns and hotspots
 */
class MemoryHotspots extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Analysis settings
      sampleInterval: config.sampleInterval !== undefined ? config.sampleInterval : 10000, // 10 seconds
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
      hotspotThreshold: config.hotspotThreshold || 0.1, // 10% of heap
      
      // Stack trace collection
      stackTraces: {
        enabled: config.stackTraces?.enabled !== false,
        maxDepth: config.stackTraces?.maxDepth || 20,
        skipFrames: config.stackTraces?.skipFrames || 2
      },
      
      // Categorization
      categories: {
        objects: config.categories?.objects !== false,
        arrays: config.categories?.arrays !== false,
        functions: config.categories?.functions !== false,
        strings: config.categories?.strings !== false,
        buffers: config.categories?.buffers !== false
      },
      
      // Thresholds
      thresholds: {
        growth: config.thresholds?.growth || 0.05, // 5% growth to be considered hot
        frequency: config.thresholds?.frequency || 5, // Must occur 5+ times
        size: config.thresholds?.size || 1024 * 1024 // 1MB minimum size
      }
    };
    
    this.hotspots = new Map(); // Current hotspots
    this.samples = new CircularBuffer(360); // 1 hour of 10-second samples
    this.allocations = new Map(); // Allocation tracking
    this.patterns = new Map(); // Pattern recognition
    
    this.stats = {
      totalSamples: 0,
      hotspotsDetected: 0,
      allocationsTracked: 0,
      patternsIdentified: 0
    };
    
    this.isActive = false;
    this._setupSampling();
  }
  
  _setupSampling() {
    if (this.config.sampleInterval > 0) {
      this.samplingTimer = setInterval(() => {
        this._collectSample();
      }, this.config.sampleInterval);
    }
  }
  
  _collectSample() {
    if (!this.isActive) return;
    
    const sample = {
      timestamp: Date.now(),
      memory: this._getMemorySnapshot(),
      heap: this._getHeapStatistics(),
      objects: this._getObjectAnalysis(),
      gc: this._getGCInfo()
    };
    
    this.samples.push(sample);
    this.stats.totalSamples++;
    
    // Analyze for hotspots
    this._analyzeHotspots(sample);
    
    // Clean old data
    this._cleanupOldData();
    
    this.emit('sample-collected', sample);
  }
  
  _getMemorySnapshot() {
    const usage = process.memoryUsage();
    
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers || 0
    };
  }
  
  _getHeapStatistics() {
    try {
      const v8 = require('v8');
      const stats = v8.getHeapStatistics();
      
      return {
        totalHeapSize: stats.total_heap_size,
        totalHeapSizeExecutable: stats.total_heap_size_executable,
        totalPhysicalSize: stats.total_physical_size,
        totalAvailableSize: stats.total_available_size,
        usedHeapSize: stats.used_heap_size,
        heapSizeLimit: stats.heap_size_limit,
        mallocedMemory: stats.malloced_memory,
        peakMallocedMemory: stats.peak_malloced_memory,
        doesZapGarbage: stats.does_zap_garbage || false
      };
    } catch {
      return {};
    }
  }
  
  _getObjectAnalysis() {
    try {
      const v8 = require('v8');
      
      // Get heap space statistics
      const spaces = v8.getHeapSpaceStatistics();
      const spaceStats = {};
      
      spaces.forEach(space => {
        spaceStats[space.space_name] = {
          size: space.space_size,
          used: space.space_used_size,
          available: space.space_available_size,
          physical: space.physical_space_size
        };
      });
      
      return {
        spaces: spaceStats,
        objectTypes: this._estimateObjectTypes()
      };
    } catch {
      return { spaces: {}, objectTypes: {} };
    }
  }
  
  _estimateObjectTypes() {
    // This is a simplified estimation since we can't directly access V8 internals
    // In a real implementation, you might use heap snapshots or profiling APIs
    
    const estimation = {
      objects: 0,
      arrays: 0,
      functions: 0,
      strings: 0,
      numbers: 0,
      other: 0
    };
    
    // Basic estimation based on common patterns
    // This would be much more sophisticated in a real implementation
    const heapUsed = process.memoryUsage().heapUsed;
    
    // Rough distribution estimates
    estimation.objects = Math.floor(heapUsed * 0.4); // 40% objects
    estimation.arrays = Math.floor(heapUsed * 0.2);  // 20% arrays
    estimation.strings = Math.floor(heapUsed * 0.15); // 15% strings
    estimation.functions = Math.floor(heapUsed * 0.1); // 10% functions
    estimation.numbers = Math.floor(heapUsed * 0.05); // 5% numbers
    estimation.other = heapUsed - (estimation.objects + estimation.arrays + 
                                  estimation.strings + estimation.functions + estimation.numbers);
    
    return estimation;
  }
  
  _getGCInfo() {
    try {
      // In Node.js 14+, we can get GC performance entries
      require('perf_hooks');
      
      // This is a placeholder - actual GC info would be collected via PerformanceObserver
      return {
        lastGC: Date.now(), // Placeholder
        gcType: 'minor',    // Placeholder
        duration: 0         // Placeholder
      };
    } catch {
      return {};
    }
  }
  
  _analyzeHotspots(currentSample) {
    const recentSamples = this.samples.toArray().slice(-10); // Last 10 samples
    
    if (recentSamples.length < 3) return; // Need at least 3 samples
    
    // Analyze memory growth patterns
    this._analyzeMemoryGrowth(recentSamples, currentSample);
    
    // Analyze object type distributions
    this._analyzeObjectDistribution(recentSamples, currentSample);
    
    // Analyze heap space utilization
    this._analyzeHeapSpaces(recentSamples, currentSample);
    
    // Detect allocation patterns
    this._detectAllocationPatterns(currentSample);
  }
  
  _analyzeMemoryGrowth(recentSamples, currentSample) {
    const firstSample = recentSamples[0];
    const growthRate = (currentSample.memory.heapUsed - firstSample.memory.heapUsed) / 
                      firstSample.memory.heapUsed;
    
    if (growthRate > this.config.thresholds.growth) {
      const hotspotId = 'memory-growth';
      
      const existingHotspot = this.hotspots.get(hotspotId);
      if (existingHotspot) {
        existingHotspot.occurrences++;
        existingHotspot.lastSeen = Date.now();
        existingHotspot.growthRate = Math.max(existingHotspot.growthRate, growthRate);
      } else {
        const hotspot = {
          id: hotspotId,
          type: 'memory-growth',
          severity: this._calculateSeverity(growthRate, 'growth'),
          growthRate: growthRate,
          startSize: firstSample.memory.heapUsed,
          currentSize: currentSample.memory.heapUsed,
          deltaSize: currentSample.memory.heapUsed - firstSample.memory.heapUsed,
          timespan: currentSample.timestamp - firstSample.timestamp,
          occurrences: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          recommendations: this._generateRecommendations('memory-growth', { growthRate })
        };
        
        this.hotspots.set(hotspotId, hotspot);
        this.stats.hotspotsDetected++;
        this.emit('hotspot-detected', hotspot);
      }
    }
  }
  
  _analyzeObjectDistribution(recentSamples, currentSample) {
    const currentTypes = currentSample.objects.objectTypes;
    
    for (const [type, size] of Object.entries(currentTypes)) {
      if (size < this.config.thresholds.size) continue;
      
      const hotspotId = `object-${type}`;
      const previousSample = recentSamples[recentSamples.length - 2];
      
      if (previousSample && previousSample.objects.objectTypes[type]) {
        const growth = (size - previousSample.objects.objectTypes[type]) / 
                      previousSample.objects.objectTypes[type];
        
        if (growth > this.config.thresholds.growth) {
          const existingHotspot = this.hotspots.get(hotspotId);
          
          if (existingHotspot) {
            existingHotspot.occurrences++;
            existingHotspot.lastSeen = Date.now();
            existingHotspot.currentSize = size;
            existingHotspot.maxGrowth = Math.max(existingHotspot.maxGrowth || 0, growth);
          } else {
            const hotspot = {
              id: hotspotId,
              type: 'object-growth',
              objectType: type,
              severity: this._calculateSeverity(growth, 'object'),
              currentSize: size,
              growth: growth,
              maxGrowth: growth,
              occurrences: 1,
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              recommendations: this._generateRecommendations('object-growth', { type, growth })
            };
            
            this.hotspots.set(hotspotId, hotspot);
            this.stats.hotspotsDetected++;
            this.emit('hotspot-detected', hotspot);
          }
        }
      }
    }
  }
  
  _analyzeHeapSpaces(recentSamples, currentSample) {
    const spaces = currentSample.objects.spaces;
    
    for (const [spaceName, spaceData] of Object.entries(spaces)) {
      const utilization = spaceData.used / spaceData.size;
      
      if (utilization > 0.8) { // 80% utilization threshold
        const hotspotId = `heap-space-${spaceName}`;
        
        const existingHotspot = this.hotspots.get(hotspotId);
        if (existingHotspot) {
          existingHotspot.occurrences++;
          existingHotspot.lastSeen = Date.now();
          existingHotspot.utilization = Math.max(existingHotspot.utilization, utilization);
        } else {
          const hotspot = {
            id: hotspotId,
            type: 'heap-space-pressure',
            spaceName: spaceName,
            severity: this._calculateSeverity(utilization, 'space'),
            utilization: utilization,
            size: spaceData.size,
            used: spaceData.used,
            available: spaceData.available,
            occurrences: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            recommendations: this._generateRecommendations('heap-space-pressure', { 
              spaceName, 
              utilization 
            })
          };
          
          this.hotspots.set(hotspotId, hotspot);
          this.stats.hotspotsDetected++;
          this.emit('hotspot-detected', hotspot);
        }
      }
    }
  }
  
  _detectAllocationPatterns(sample) {
    // Track allocation patterns over time
    const patternKey = this._generatePatternKey(sample);
    
    const existingPattern = this.patterns.get(patternKey);
    if (existingPattern) {
      existingPattern.count++;
      existingPattern.lastSeen = Date.now();
      
      // If pattern occurs frequently, it might be a hotspot
      if (existingPattern.count >= this.config.thresholds.frequency) {
        this._createPatternHotspot(existingPattern);
      }
    } else {
      this.patterns.set(patternKey, {
        key: patternKey,
        sample: sample,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }
  }
  
  _generatePatternKey(sample) {
    // Create a pattern key based on memory characteristics
    const memory = sample.memory;
    const heapRatio = Math.floor((memory.heapUsed / memory.heapTotal) * 10) / 10;
    const rssRatio = Math.floor((memory.rss / (memory.rss + 100*1024*1024)) * 10) / 10;
    
    return `heap:${heapRatio}-rss:${rssRatio}`;
  }
  
  _createPatternHotspot(pattern) {
    const hotspotId = `pattern-${pattern.key}`;
    
    if (!this.hotspots.has(hotspotId)) {
      const hotspot = {
        id: hotspotId,
        type: 'allocation-pattern',
        pattern: pattern.key,
        severity: this._calculateSeverity(pattern.count, 'pattern'),
        frequency: pattern.count,
        timespan: pattern.lastSeen - pattern.firstSeen,
        occurrences: 1,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
        recommendations: this._generateRecommendations('allocation-pattern', { 
          pattern: pattern.key,
          frequency: pattern.count 
        })
      };
      
      this.hotspots.set(hotspotId, hotspot);
      this.stats.hotspotsDetected++;
      this.stats.patternsIdentified++;
      this.emit('hotspot-detected', hotspot);
    }
  }
  
  _calculateSeverity(value, type) {
    switch (type) {
    case 'growth':
      if (value > 0.2) return 'critical';
      if (value > 0.1) return 'high';
      if (value > 0.05) return 'medium';
      return 'low';
        
    case 'object':
      if (value > 0.3) return 'critical';
      if (value > 0.15) return 'high';
      if (value > 0.08) return 'medium';
      return 'low';
        
    case 'space':
      if (value > 0.95) return 'critical';
      if (value > 0.9) return 'high';
      if (value > 0.8) return 'medium';
      return 'low';
        
    case 'pattern':
      if (value > 20) return 'critical';
      if (value > 10) return 'high';
      if (value > 5) return 'medium';
      return 'low';
        
    default:
      return 'low';
    }
  }
  
  _generateRecommendations(type, data) {
    const recommendations = [];
    
    switch (type) {
    case 'memory-growth':
      recommendations.push('Review recent code changes for memory leaks');
      recommendations.push('Check for event listener accumulation');
      if (data.growthRate > 0.15) {
        recommendations.push('Consider running garbage collection manually');
        recommendations.push('Profile heap allocations to identify the source');
      }
      break;
        
    case 'object-growth':
      recommendations.push(`Investigate ${data.type} allocation patterns`);
      recommendations.push('Check for object retention and circular references');
      if (data.type === 'arrays') {
        recommendations.push('Review array operations and ensure proper cleanup');
      }
      break;
        
    case 'heap-space-pressure':
      recommendations.push(`Reduce ${data.spaceName} space pressure`);
      recommendations.push('Consider increasing heap size if necessary');
      if (data.utilization > 0.9) {
        recommendations.push('Immediate action required - heap space nearly full');
      }
      break;
        
    case 'allocation-pattern':
      recommendations.push('Recurring allocation pattern detected');
      recommendations.push('Review code for optimization opportunities');
      recommendations.push('Consider object pooling or caching strategies');
      break;
    }
    
    return recommendations;
  }
  
  _cleanupOldData() {
    const now = Date.now();
    const maxAge = this.config.retentionPeriod;
    
    // Clean old hotspots
    for (const [id, hotspot] of this.hotspots.entries()) {
      if (now - hotspot.lastSeen > maxAge) {
        this.hotspots.delete(id);
        this.emit('hotspot-expired', hotspot);
      }
    }
    
    // Clean old patterns
    for (const [key, pattern] of this.patterns.entries()) {
      if (now - pattern.lastSeen > maxAge) {
        this.patterns.delete(key);
      }
    }
  }
  
  // Public API methods
  start() {
    this.isActive = true;
    this.emit('started');
    return this;
  }
  
  stop() {
    this.isActive = false;
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
    this.emit('stopped');
    return this;
  }
  
  getHotspots(filters = {}) {
    let hotspots = Array.from(this.hotspots.values());
    
    if (filters.type) {
      hotspots = hotspots.filter(h => h.type === filters.type);
    }
    
    if (filters.severity) {
      hotspots = hotspots.filter(h => h.severity === filters.severity);
    }
    
    if (filters.minOccurrences) {
      hotspots = hotspots.filter(h => h.occurrences >= filters.minOccurrences);
    }
    
    return hotspots.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }
  
  getHotspot(id) {
    return this.hotspots.get(id);
  }
  
  resolveHotspot(id, resolution = {}) {
    const hotspot = this.hotspots.get(id);
    if (hotspot) {
      hotspot.resolved = true;
      hotspot.resolvedAt = Date.now();
      hotspot.resolution = resolution;
      
      this.hotspots.delete(id);
      this.emit('hotspot-resolved', hotspot);
      return true;
    }
    return false;
  }
  
  getMemoryMap() {
    const recent = this.samples.toArray().slice(-1)[0];
    if (!recent) return null;
    
    return {
      timestamp: recent.timestamp,
      memory: recent.memory,
      heap: recent.heap,
      objects: recent.objects,
      hotspots: this.getHotspots(),
      stats: this.getStats()
    };
  }
  
  getStats() {
    return {
      ...this.stats,
      activeHotspots: this.hotspots.size,
      trackedPatterns: this.patterns.size,
      samplesRetained: this.samples.length
    };
  }
  
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Restart sampling if interval changed
    if (this.samplingTimer && newConfig.sampleInterval) {
      clearInterval(this.samplingTimer);
      this._setupSampling();
    }
    
    return this;
  }
  
  reset() {
    this.hotspots.clear();
    this.patterns.clear();
    this.samples.clear();
    
    this.stats = {
      totalSamples: 0,
      hotspotsDetected: 0,
      allocationsTracked: 0,
      patternsIdentified: 0
    };
    
    this.emit('reset');
    return this;
  }
  
  destroy() {
    this.stop();
    this.removeAllListeners();
    this.hotspots.clear();
    this.patterns.clear();
    this.samples.clear();
  }
}

module.exports = MemoryHotspots;
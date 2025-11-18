'use strict';

const EventEmitter = require('events');

class Detector extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.baseline = null;
    this.baselineSamples = [];
    this.isBaselineEstablished = false;
    this.leaks = [];
    this.patterns = {
      'rapid-growth': this._detectRapidGrowth.bind(this),
      'steady-growth': this._detectSteadyGrowth.bind(this),
      'saw-tooth': this._detectSawToothPattern.bind(this),
      'gc-pressure': this._detectGCPressure.bind(this),
      'memory-threshold': this._detectMemoryThreshold.bind(this)
    };
  }
  
  start() {
    this.startTime = Date.now();
  }
  
  stop() {
    // Cleanup if needed
  }
  
  analyze(metrics) {
    if (!this.isBaselineEstablished) {
      this._updateBaseline(metrics);
      return;
    }
    
    const detectedIssues = [];
    
    // Run all pattern detectors
    for (const [pattern, detector] of Object.entries(this.patterns)) {
      const issue = detector(metrics);
      if (issue) {
        detectedIssues.push({ pattern, ...issue });
      }
    }
    
    // Check for memory leaks
    if (detectedIssues.length > 0) {
      const leak = this._analyzeLeakProbability(detectedIssues, metrics);
      if (leak.probability > this._getSensitivityThreshold()) {
        this.leaks.push(leak);
        this.emit('leak', leak);
      } else if (leak.probability > 0.3) {
        this.emit('warning', {
          type: 'potential-leak',
          ...leak
        });
      }
    }
  }
  
  _updateBaseline(metrics) {
    this.baselineSamples.push(metrics);
    
    const { duration, samples } = this.config.detection.baseline;
    const elapsed = Date.now() - this.startTime;
    
    if (elapsed >= duration || this.baselineSamples.length >= samples) {
      this._establishBaseline();
    }
  }
  
  _establishBaseline() {
    if (this.baselineSamples.length === 0) return;
    
    const heapSizes = this.baselineSamples.map(s => s.heap.used);
    const gcCounts = this.baselineSamples.filter(s => s.gc).map(s => s.gc.length);
    
    this.baseline = {
      avgHeapSize: this._average(heapSizes),
      stdDevHeapSize: this._standardDeviation(heapSizes),
      avgGCFrequency: gcCounts.length > 0 ? this._average(gcCounts) : 0,
      samples: this.baselineSamples.length,
      established: Date.now()
    };
    
    this.isBaselineEstablished = true;
    this.emit('baseline-established', this.baseline);
  }
  
  _detectRapidGrowth(metrics) {
    if (!this.baseline) return null;

    const currentHeap = metrics.heap.used;
    const baselineHeap = this.baseline.avgHeapSize;

    // Avoid division by zero
    if (baselineHeap === 0) return null;

    const growthRate = ((currentHeap - baselineHeap) / baselineHeap) * 100;
    
    if (growthRate > this.config.threshold.growth * 100) {
      return {
        severity: 'high',
        growthRate,
        currentHeap,
        baselineHeap,
        message: `Heap size growing rapidly: ${growthRate.toFixed(2)}% increase`
      };
    }
    
    return null;
  }
  
  _detectSteadyGrowth(_metrics) {
    // Get recent heap samples
    const recentSamples = this.baselineSamples.slice(-10);
    if (recentSamples.length < 5) return null;
    
    const heapSizes = recentSamples.map(s => s.heap.used);
    const trend = this._calculateTrend(heapSizes);

    if (trend.slope > 0 && trend.r2 > 0.8) { // Strong positive correlation
      const interval = this.config.monitoring?.interval || this.config.interval || 30000;
      const growthPerMinute = trend.slope * 60000 / interval;
      
      return {
        severity: 'medium',
        trend: trend.slope,
        correlation: trend.r2,
        growthPerMinute,
        message: `Steady heap growth detected: ${(growthPerMinute / 1024 / 1024).toFixed(2)} MB/min`
      };
    }
    
    return null;
  }
  
  _detectSawToothPattern(_metrics) {
    const recentGCs = this.baselineSamples
      .slice(-20)
      .filter(s => s.gc && s.gc.length > 0);
    
    if (recentGCs.length < 10) return null;
    
    // Analyze heap size before and after GC
    const gcEffectiveness = [];
    for (let i = 1; i < recentGCs.length; i++) {
      const before = recentGCs[i - 1].heap.used;
      const after = recentGCs[i].heap.used;
      const reduction = ((before - after) / before) * 100;
      gcEffectiveness.push(reduction);
    }
    
    const avgReduction = this._average(gcEffectiveness);
    
    if (avgReduction < 10) { // GC not freeing much memory
      return {
        severity: 'high',
        avgReduction,
        message: `Ineffective GC: only ${avgReduction.toFixed(2)}% memory freed on average`
      };
    }
    
    return null;
  }
  
  _detectGCPressure(_metrics) {
    const recentGCs = this.baselineSamples
      .slice(-10)
      .reduce((count, s) => count + (s.gc ? s.gc.length : 0), 0);

    const interval = this.config.monitoring?.interval || this.config.interval || 30000;
    const timeWindow = 10 * interval / 60000; // in minutes
    const gcPerMinute = recentGCs / timeWindow;
    
    if (gcPerMinute > this.config.threshold.gcFrequency) {
      return {
        severity: 'high',
        gcPerMinute,
        threshold: this.config.threshold.gcFrequency,
        message: `High GC frequency: ${gcPerMinute.toFixed(2)} GCs per minute`
      };
    }
    
    return null;
  }
  
  _detectMemoryThreshold(metrics) {
    const heapUsagePercent = metrics.heap.used / metrics.heap.limit;
    
    if (heapUsagePercent > this.config.threshold.heap) {
      return {
        severity: 'critical',
        usage: heapUsagePercent * 100,
        threshold: this.config.threshold.heap * 100,
        message: `Heap usage at ${(heapUsagePercent * 100).toFixed(2)}% of limit`
      };
    }
    
    return null;
  }
  
  _analyzeLeakProbability(issues, metrics) {
    // Calculate leak probability based on detected patterns
    let probability = 0;
    const factors = [];
    
    issues.forEach(issue => {
      switch (issue.pattern) {
      case 'rapid-growth':
        probability += 0.3;
        factors.push('Rapid heap growth');
        break;
      case 'steady-growth':
        probability += 0.25;
        factors.push('Steady heap growth');
        break;
      case 'saw-tooth':
        probability += 0.2;
        factors.push('Ineffective garbage collection');
        break;
      case 'gc-pressure':
        probability += 0.15;
        factors.push('High GC frequency');
        break;
      case 'memory-threshold':
        probability += 0.1;
        factors.push('High memory usage');
        break;
      }
    });
    
    probability = Math.min(1, probability);
    
    return {
      probability,
      factors,
      timestamp: Date.now(),
      metrics: {
        heapUsed: metrics.heap.used,
        heapTotal: metrics.heap.total,
        heapLimit: metrics.heap.limit
      },
      recommendations: this._generateRecommendations(issues)
    };
  }
  
  _generateRecommendations(issues) {
    const recommendations = [];
    
    issues.forEach(issue => {
      switch (issue.pattern) {
      case 'rapid-growth':
        recommendations.push('Check for unbounded data structures (arrays, maps, sets)');
        recommendations.push('Look for accumulating event listeners');
        break;
      case 'steady-growth':
        recommendations.push('Investigate long-lived objects and closures');
        recommendations.push('Check for circular references');
        break;
      case 'saw-tooth':
        recommendations.push('Review object allocation patterns');
        recommendations.push('Consider object pooling for frequently created objects');
        break;
      case 'gc-pressure':
        recommendations.push('Reduce object allocation rate');
        recommendations.push('Optimize hot code paths');
        break;
      case 'memory-threshold':
        recommendations.push('Increase heap size limit if appropriate');
        recommendations.push('Implement memory usage limits and cleanup');
        break;
      }
    });
    
    return [...new Set(recommendations)]; // Remove duplicates
  }
  
  _getSensitivityThreshold() {
    const sensitivity = {
      low: 0.7,
      medium: 0.5,
      high: 0.3
    };
    
    return sensitivity[this.config.detection.sensitivity] || 0.5;
  }
  
  getLeaks() {
    return this.leaks;
  }
  
  reset() {
    this.baseline = null;
    this.baselineSamples = [];
    this.isBaselineEstablished = false;
    this.leaks = [];
  }
  
  configure(config) {
    this.config = config;
  }
  
  // Statistical helpers
  _average(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  _standardDeviation(values) {
    const avg = this._average(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    const variance = this._average(squaredDiffs);
    return Math.sqrt(variance);
  }
  
  _calculateTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const yPred = slope * x[i] + intercept;
      return sum + Math.pow(yi - yPred, 2);
    }, 0);
    
    const r2 = 1 - (ssResidual / ssTotal);
    
    return { slope, intercept, r2 };
  }
}

module.exports = Detector;
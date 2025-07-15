#!/usr/bin/env node
'use strict';

/**
 * Comprehensive Benchmark Suite for @oxog/sentinel
 * 
 * Tests performance impact and overhead measurements
 */

const { performance } = require('perf_hooks');
const Sentinel = require('../index');

// Benchmark configuration
const BENCHMARK_CONFIG = {
  iterations: 1000,
  warmupIterations: 100,
  memoryAllocations: 10000,
  monitoringDuration: 30000 // 30 seconds
};

class BenchmarkRunner {
  constructor() {
    this.results = {};
    this.baseline = null;
    this.sentinel = Sentinel.getInstance();
  }
  
  // Measure function execution time
  async measureExecution(name, fn, iterations = BENCHMARK_CONFIG.iterations) {
    // Warmup
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      await fn();
    }
    
    // Force GC before measurement
    if (global.gc) global.gc();
    
    const times = [];
    const memoryBefore = process.memoryUsage();
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      await fn();
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }
    
    const endTime = performance.now();
    const memoryAfter = process.memoryUsage();
    
    const result = {
      name,
      iterations,
      totalTime: endTime - startTime,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      medianTime: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
      memoryDelta: {
        heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
        rss: memoryAfter.rss - memoryBefore.rss
      },
      throughput: iterations / ((endTime - startTime) / 1000) // ops/sec
    };
    
    this.results[name] = result;
    return result;
  }
  
  // Benchmark without Sentinel (baseline)
  async benchmarkBaseline() {
    console.log('📊 Running baseline benchmarks (without Sentinel)...');
    
    // Ensure Sentinel is stopped
    if (this.sentinel.isRunning) {
      this.sentinel.stop();
    }
    
    // Test memory allocation performance
    await this.measureExecution('baseline-memory-allocation', () => {
      const data = new Array(1000).fill('benchmark-data');
      return data.length;
    });
    
    // Test object creation performance
    await this.measureExecution('baseline-object-creation', () => {
      const obj = {
        id: Math.random(),
        data: new Array(100).fill('test'),
        timestamp: Date.now()
      };
      return obj.id;
    });
    
    // Test function call performance
    await this.measureExecution('baseline-function-calls', () => {
      return Math.random() * 1000;
    });
    
    // Test async operation performance
    await this.measureExecution('baseline-async-operations', async () => {
      return new Promise(resolve => setImmediate(resolve));
    });
    
    this.baseline = { ...this.results };
  }
  
  // Benchmark with Sentinel enabled
  async benchmarkWithSentinel() {
    console.log('🔍 Running benchmarks with Sentinel enabled...');
    
    // Configure Sentinel for minimal impact
    this.sentinel.configure({
      monitoring: { interval: 10000 },
      threshold: { heap: 0.9 },
      reporting: { console: false }
    });
    
    // Start monitoring
    this.sentinel.start();
    
    // Wait for baseline to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test memory allocation performance with monitoring
    await this.measureExecution('sentinel-memory-allocation', () => {
      const data = new Array(1000).fill('benchmark-data');
      return data.length;
    });
    
    // Test object creation performance with monitoring
    await this.measureExecution('sentinel-object-creation', () => {
      const obj = {
        id: Math.random(),
        data: new Array(100).fill('test'),
        timestamp: Date.now()
      };
      return obj.id;
    });
    
    // Test function call performance with monitoring
    await this.measureExecution('sentinel-function-calls', () => {
      return Math.random() * 1000;
    });
    
    // Test async operation performance with monitoring
    await this.measureExecution('sentinel-async-operations', async () => {
      return new Promise(resolve => setImmediate(resolve));
    });
    
    // Test Sentinel API performance
    await this.measureExecution('sentinel-api-getMetrics', () => {
      return this.sentinel.getMetrics();
    });
    
    await this.measureExecution('sentinel-api-getLeaks', () => {
      return this.sentinel.getLeaks();
    });
    
    // Stop monitoring
    this.sentinel.stop();
  }
  
  // Benchmark memory monitoring overhead
  async benchmarkMonitoringOverhead() {
    console.log('📈 Measuring monitoring overhead...');
    
    const overheadResults = {
      cpuUsage: [],
      memoryUsage: [],
      intervals: []
    };
    
    // Test different monitoring intervals
    const intervals = [1000, 5000, 10000, 30000, 60000];
    
    for (const interval of intervals) {
      console.log(`  Testing interval: ${interval}ms`);
      
      this.sentinel.configure({
        interval,
        reporting: { console: false }
      });
      
      const startCpu = process.cpuUsage();
      const startMemory = process.memoryUsage();
      const startTime = Date.now();
      
      this.sentinel.start();
      
      // Run for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const endCpu = process.cpuUsage(startCpu);
      const endMemory = process.memoryUsage();
      const endTime = Date.now();
      
      this.sentinel.stop();
      
      const cpuPercent = ((endCpu.user + endCpu.system) / 1000) / (endTime - startTime) * 100;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      overheadResults.intervals.push({
        interval,
        cpuPercent,
        memoryDelta,
        duration: endTime - startTime
      });
    }
    
    this.results['monitoring-overhead'] = overheadResults;
  }
  
  // Benchmark leak detection performance
  async benchmarkLeakDetection() {
    console.log('🔍 Benchmarking leak detection performance...');
    
    this.sentinel.configure({
      interval: 1000,
      detection: { sensitivity: 'high' },
      reporting: { console: false }
    });
    
    this.sentinel.start();
    
    // Create memory leak scenarios
    const leakScenarios = [
      {
        name: 'rapid-allocation',
        fn: () => {
          const data = [];
          for (let i = 0; i < 1000; i++) {
            data.push(new Array(100).fill('leak'));
          }
          return data;
        }
      },
      {
        name: 'event-listeners',
        fn: () => {
          const EventEmitter = require('events');
          const emitter = new EventEmitter();
          for (let i = 0; i < 100; i++) {
            emitter.on('test', () => {});
          }
          return emitter;
        }
      },
      {
        name: 'closures',
        fn: () => {
          const closures = [];
          for (let i = 0; i < 100; i++) {
            const data = new Array(100).fill('closure');
            closures.push(() => data.length);
          }
          return closures;
        }
      }
    ];
    
    const detectionResults = {};
    
    for (const scenario of leakScenarios) {
      console.log(`  Testing scenario: ${scenario.name}`);
      
      const startTime = performance.now();
      const startMemory = process.memoryUsage();
      
      // Create leak scenario
      const leakData = [];
      for (let i = 0; i < 50; i++) {
        leakData.push(scenario.fn());
      }
      
      // Wait for detection
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      const leaks = this.sentinel.getLeaks();
      
      detectionResults[scenario.name] = {
        detectionTime: endTime - startTime,
        memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
        leaksDetected: leaks.length,
        leakData: leakData.length
      };
      
      // Cleanup
      leakData.length = 0;
      this.sentinel.reset();
    }
    
    this.sentinel.stop();
    this.results['leak-detection'] = detectionResults;
  }
  
  // Calculate overhead percentages
  calculateOverhead() {
    if (!this.baseline) {
      console.error('❌ Baseline results not available');
      return;
    }
    
    const overhead = {};
    
    Object.keys(this.baseline).forEach(testName => {
      const sentinelTestName = testName.replace('baseline-', 'sentinel-');
      if (this.results[sentinelTestName]) {
        const baselineResult = this.baseline[testName];
        const sentinelResult = this.results[sentinelTestName];
        
        overhead[testName] = {
          timeOverhead: ((sentinelResult.avgTime - baselineResult.avgTime) / baselineResult.avgTime) * 100,
          memoryOverhead: sentinelResult.memoryDelta.heapUsed - baselineResult.memoryDelta.heapUsed,
          throughputDelta: sentinelResult.throughput - baselineResult.throughput
        };
      }
    });
    
    this.results['overhead-analysis'] = overhead;
  }
  
  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SENTINEL PERFORMANCE BENCHMARK REPORT');
    console.log('='.repeat(60));
    
    // Performance overview
    if (this.results['overhead-analysis']) {
      console.log('\n🎯 PERFORMANCE OVERHEAD ANALYSIS:');
      Object.entries(this.results['overhead-analysis']).forEach(([test, overhead]) => {
        const timeOverheadStr = overhead.timeOverhead > 0 ? `+${overhead.timeOverhead.toFixed(2)}%` : `${overhead.timeOverhead.toFixed(2)}%`;
        const memOverheadKB = (overhead.memoryOverhead / 1024).toFixed(2);
        
        console.log(`  ${test}:`);
        console.log(`    Time Overhead: ${timeOverheadStr}`);
        console.log(`    Memory Overhead: ${memOverheadKB} KB`);
        console.log(`    Throughput Delta: ${overhead.throughputDelta.toFixed(2)} ops/sec`);
      });
    }
    
    // Monitoring overhead
    if (this.results['monitoring-overhead']) {
      console.log('\n📈 MONITORING OVERHEAD BY INTERVAL:');
      this.results['monitoring-overhead'].intervals.forEach(result => {
        console.log(`  ${result.interval}ms interval:`);
        console.log(`    CPU Usage: ${result.cpuPercent.toFixed(3)}%`);
        console.log(`    Memory Delta: ${(result.memoryDelta / 1024).toFixed(2)} KB`);
      });
    }
    
    // Leak detection performance
    if (this.results['leak-detection']) {
      console.log('\n🔍 LEAK DETECTION PERFORMANCE:');
      Object.entries(this.results['leak-detection']).forEach(([scenario, result]) => {
        console.log(`  ${scenario}:`);
        console.log(`    Detection Time: ${result.detectionTime.toFixed(2)}ms`);
        console.log(`    Memory Growth: ${(result.memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    Leaks Detected: ${result.leaksDetected}`);
      });
    }
    
    // Detailed results
    console.log('\n📋 DETAILED BENCHMARK RESULTS:');
    Object.entries(this.results).forEach(([testName, result]) => {
      if (testName.includes('overhead') || testName.includes('monitoring') || testName.includes('leak-detection')) {
        return; // Skip composite results
      }
      
      console.log(`\n  ${testName}:`);
      console.log(`    Avg Time: ${result.avgTime.toFixed(3)}ms`);
      console.log(`    Min Time: ${result.minTime.toFixed(3)}ms`);
      console.log(`    Max Time: ${result.maxTime.toFixed(3)}ms`);
      console.log(`    Throughput: ${result.throughput.toFixed(2)} ops/sec`);
      console.log(`    Memory Delta: ${(result.memoryDelta.heapUsed / 1024).toFixed(2)} KB`);
    });
    
    // Performance verdict
    console.log('\n' + '='.repeat(60));
    console.log('🎯 PERFORMANCE VERDICT:');
    
    if (this.results['overhead-analysis']) {
      const avgTimeOverhead = Object.values(this.results['overhead-analysis'])
        .reduce((sum, overhead) => sum + Math.abs(overhead.timeOverhead), 0) / 
        Object.keys(this.results['overhead-analysis']).length;
      
      const maxMemoryOverhead = Math.max(...Object.values(this.results['overhead-analysis'])
        .map(overhead => overhead.memoryOverhead));
      
      console.log(`Average Time Overhead: ${avgTimeOverhead.toFixed(2)}%`);
      console.log(`Maximum Memory Overhead: ${(maxMemoryOverhead / 1024).toFixed(2)} KB`);
      
      if (avgTimeOverhead < 1.0) {
        console.log('✅ EXCELLENT: <1% average performance impact');
      } else if (avgTimeOverhead < 5.0) {
        console.log('✅ GOOD: <5% average performance impact');
      } else {
        console.log('⚠️  WARNING: >5% performance impact detected');
      }
      
      if (maxMemoryOverhead < 10 * 1024 * 1024) { // 10MB
        console.log('✅ EXCELLENT: <10MB memory overhead');
      } else {
        console.log('⚠️  WARNING: >10MB memory overhead detected');
      }
    }
    
    console.log('='.repeat(60));
  }
  
  // Save results to file
  saveResults() {
    const fs = require('fs');
    const resultsFile = `benchmark-results-${Date.now()}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      config: BENCHMARK_CONFIG,
      results: this.results
    };
    
    fs.writeFileSync(resultsFile, JSON.stringify(report, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
  }
}

// Main benchmark execution
async function runBenchmarks() {
  console.log('🚀 Starting Sentinel Performance Benchmarks...');
  console.log(`Node.js: ${process.version} | Platform: ${process.platform} | Arch: ${process.arch}\n`);
  
  const runner = new BenchmarkRunner();
  
  try {
    await runner.benchmarkBaseline();
    await runner.benchmarkWithSentinel();
    await runner.benchmarkMonitoringOverhead();
    await runner.benchmarkLeakDetection();
    
    runner.calculateOverhead();
    runner.generateReport();
    runner.saveResults();
    
    console.log('\n✅ Benchmark suite completed successfully!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run benchmarks if this is the main module
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

module.exports = { BenchmarkRunner, runBenchmarks };
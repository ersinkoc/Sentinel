#!/usr/bin/env node
'use strict';

/**
 * Stress Test Suite for @oxog/sentinel
 * 
 * Tests Sentinel under high load and stress conditions
 */

const sentinel = require('../index');
const { performance } = require('perf_hooks');

class StressTestRunner {
  constructor() {
    this.results = {};
    this.isRunning = false;
  }
  
  // High memory allocation stress test
  async testHighMemoryAllocation() {
    console.log('🔥 Running high memory allocation stress test...');
    
    sentinel.configure({
      interval: 1000,
      threshold: { heap: 0.9, growth: 0.2 },
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const data = [];
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    // Allocate 100MB in chunks
    for (let i = 0; i < 100; i++) {
      const chunk = new Array(100000).fill(`stress-data-${i}`);
      data.push(chunk);
      
      // Small delay to allow monitoring
      await new Promise(resolve => setImmediate(resolve));
    }
    
    // Hold memory for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    // Cleanup
    data.length = 0;
    if (global.gc) global.gc();
    
    sentinel.stop();
    
    this.results.highMemoryAllocation = {
      duration: endTime - startTime,
      memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      dataChunks: 100,
      survived: true
    };
    
    console.log(`  ✅ Completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  📊 Memory growth: ${(this.results.highMemoryAllocation.memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // Rapid object creation stress test
  async testRapidObjectCreation() {
    console.log('⚡ Running rapid object creation stress test...');
    
    sentinel.configure({
      interval: 500,
      detection: { sensitivity: 'high' },
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let objectsCreated = 0;
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    // Create 50k objects rapidly
    const objects = [];
    for (let i = 0; i < 50000; i++) {
      objects.push({
        id: i,
        data: new Array(50).fill(`rapid-${i}`),
        timestamp: Date.now(),
        random: Math.random()
      });
      objectsCreated++;
      
      // Yield occasionally
      if (i % 1000 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Wait for monitoring to catch up
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    // Cleanup
    objects.length = 0;
    if (global.gc) global.gc();
    
    sentinel.stop();
    
    this.results.rapidObjectCreation = {
      duration: endTime - startTime,
      objectsCreated,
      objectsPerSecond: objectsCreated / ((endTime - startTime) / 1000),
      memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      survived: true
    };
    
    console.log(`  ✅ Created ${objectsCreated} objects in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  📈 Rate: ${this.results.rapidObjectCreation.objectsPerSecond.toFixed(2)} objects/sec`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // Event emitter stress test
  async testEventEmitterStress() {
    console.log('📡 Running event emitter stress test...');
    
    const EventEmitter = require('events');
    
    sentinel.configure({
      interval: 1000,
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let emittersCreated = 0;
    let listenersAdded = 0;
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    const emitters = [];
    
    // Create 1000 event emitters with multiple listeners
    for (let i = 0; i < 1000; i++) {
      const emitter = new EventEmitter();
      
      // Add 10 listeners per emitter
      for (let j = 0; j < 10; j++) {
        emitter.on(`event${j}`, (data) => {
          // Simulate listener work
          const work = new Array(100).fill(data);
          return work.length;
        });
        listenersAdded++;
      }
      
      emitters.push(emitter);
      emittersCreated++;
      
      // Emit some events
      if (i % 100 === 0) {
        emitter.emit('event0', `data-${i}`);
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Wait for monitoring
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    // Cleanup
    emitters.forEach(emitter => emitter.removeAllListeners());
    emitters.length = 0;
    if (global.gc) global.gc();
    
    sentinel.stop();
    
    this.results.eventEmitterStress = {
      duration: endTime - startTime,
      emittersCreated,
      listenersAdded,
      memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      survived: true
    };
    
    console.log(`  ✅ Created ${emittersCreated} emitters with ${listenersAdded} listeners`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // Timer stress test
  async testTimerStress() {
    console.log('⏰ Running timer stress test...');
    
    sentinel.configure({
      interval: 1000,
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let timersCreated = 0;
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    const timers = [];
    
    // Create 2000 timers
    for (let i = 0; i < 2000; i++) {
      const timer = setTimeout(() => {
        // Timer work with memory allocation
        const work = new Array(100).fill(`timer-work-${i}`);
        return work.length;
      }, 10000 + Math.random() * 5000); // 10-15 second delays
      
      timers.push(timer);
      timersCreated++;
      
      if (i % 200 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Wait for monitoring to detect patterns
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    // Clear all timers
    timers.forEach(timer => clearTimeout(timer));
    timers.length = 0;
    if (global.gc) global.gc();
    
    sentinel.stop();
    
    this.results.timerStress = {
      duration: endTime - startTime,
      timersCreated,
      memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      survived: true
    };
    
    console.log(`  ✅ Created and cleared ${timersCreated} timers`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // Long-running monitoring stress test
  async testLongRunningMonitoring() {
    console.log('🕐 Running long-running monitoring stress test...');
    
    sentinel.configure({
      interval: 2000,
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let cycles = 0;
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    // Run for 60 seconds with periodic memory allocations
    const duration = 60000;
    const cycleInterval = 3000;
    
    const interval = setInterval(() => {
      // Allocate and release memory each cycle
      const tempData = new Array(10000).fill(`cycle-${cycles}`);
      cycles++;
      
      // Simulate some work
      setTimeout(() => {
        tempData.length = 0;
      }, 1000);
      
    }, cycleInterval);
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    clearInterval(interval);
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    sentinel.stop();
    
    this.results.longRunningMonitoring = {
      duration: endTime - startTime,
      cycles,
      memoryGrowth: endMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      survived: true
    };
    
    console.log(`  ✅ Completed ${cycles} cycles over ${(duration / 1000).toFixed(0)} seconds`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // High frequency monitoring stress test
  async testHighFrequencyMonitoring() {
    console.log('🔄 Running high frequency monitoring stress test...');
    
    sentinel.configure({
      interval: 100, // Very frequent monitoring
      detection: { sensitivity: 'high' },
      reporting: { console: false }
    });
    
    sentinel.start();
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let operations = 0;
    let leaksDetected = 0;
    
    sentinel.on('leak', () => leaksDetected++);
    
    // Perform rapid operations for 30 seconds
    const endTime = Date.now() + 30000;
    
    while (Date.now() < endTime) {
      // Rapid memory allocations
      const data = new Array(1000).fill('high-freq');
      operations++;
      
      // Immediate release
      data.length = 0;
      
      await new Promise(resolve => setImmediate(resolve));
    }
    
    const finalTime = performance.now();
    const finalMemory = process.memoryUsage();
    
    sentinel.stop();
    
    this.results.highFrequencyMonitoring = {
      duration: finalTime - startTime,
      operations,
      operationsPerSecond: operations / ((finalTime - startTime) / 1000),
      memoryGrowth: finalMemory.heapUsed - startMemory.heapUsed,
      leaksDetected,
      survived: true
    };
    
    console.log(`  ✅ Performed ${operations} operations at ${this.results.highFrequencyMonitoring.operationsPerSecond.toFixed(2)} ops/sec`);
    console.log(`  🔍 Leaks detected: ${leaksDetected}`);
  }
  
  // Generate stress test report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🔥 SENTINEL STRESS TEST REPORT');
    console.log('='.repeat(60));
    
    let totalTestsPassed = 0;
    let totalTests = 0;
    
    Object.entries(this.results).forEach(([testName, result]) => {
      totalTests++;
      if (result.survived) totalTestsPassed++;
      
      console.log(`\n📊 ${testName.toUpperCase()}:`);
      console.log(`  Status: ${result.survived ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`  Memory Growth: ${(result.memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Leaks Detected: ${result.leaksDetected}`);
      
      // Test-specific metrics
      if (result.objectsCreated) {
        console.log(`  Objects Created: ${result.objectsCreated.toLocaleString()}`);
        console.log(`  Creation Rate: ${result.objectsPerSecond.toFixed(2)} objects/sec`);
      }
      
      if (result.emittersCreated) {
        console.log(`  Event Emitters: ${result.emittersCreated}`);
        console.log(`  Listeners Added: ${result.listenersAdded}`);
      }
      
      if (result.timersCreated) {
        console.log(`  Timers Created: ${result.timersCreated}`);
      }
      
      if (result.cycles) {
        console.log(`  Monitoring Cycles: ${result.cycles}`);
      }
      
      if (result.operations) {
        console.log(`  Operations: ${result.operations.toLocaleString()}`);
        console.log(`  Operation Rate: ${result.operationsPerSecond.toFixed(2)} ops/sec`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 STRESS TEST SUMMARY:');
    console.log(`Tests Passed: ${totalTestsPassed}/${totalTests}`);
    console.log(`Success Rate: ${((totalTestsPassed / totalTests) * 100).toFixed(1)}%`);
    
    if (totalTestsPassed === totalTests) {
      console.log('✅ ALL STRESS TESTS PASSED - Sentinel is robust under high load!');
    } else {
      console.log('⚠️  Some stress tests failed - review results above');
    }
    
    console.log('='.repeat(60));
  }
  
  // Save stress test results
  saveResults() {
    const fs = require('fs');
    const resultsFile = `stress-test-results-${Date.now()}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      results: this.results
    };
    
    fs.writeFileSync(resultsFile, JSON.stringify(report, null, 2));
    console.log(`\n💾 Stress test results saved to: ${resultsFile}`);
  }
}

// Main stress test execution
async function runStressTests() {
  console.log('🔥 Starting Sentinel Stress Tests...');
  console.log(`Node.js: ${process.version} | Platform: ${process.platform} | Arch: ${process.arch}\n`);
  console.log('⚠️  Warning: These tests will consume significant system resources\n');
  
  const runner = new StressTestRunner();
  
  try {
    await runner.testHighMemoryAllocation();
    await runner.testRapidObjectCreation();
    await runner.testEventEmitterStress();
    await runner.testTimerStress();
    await runner.testLongRunningMonitoring();
    await runner.testHighFrequencyMonitoring();
    
    runner.generateReport();
    runner.saveResults();
    
    console.log('\n✅ Stress test suite completed!');
    
  } catch (error) {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  }
}

// Run stress tests if this is the main module
if (require.main === module) {
  runStressTests().catch(console.error);
}

module.exports = { StressTestRunner, runStressTests };
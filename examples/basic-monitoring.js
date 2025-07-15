#!/usr/bin/env node
'use strict';

/**
 * Basic Sentinel Monitoring Demo
 * 
 * This example shows the simplest way to use Sentinel for memory monitoring
 * and leak detection in your Node.js applications.
 */

const Sentinel = require('../index');

// Create a basic Sentinel instance
const sentinel = new Sentinel({
  monitoring: {
    interval: 5000  // Monitor every 5 seconds
  },
  threshold: {
    heap: 0.75,     // Alert when heap usage exceeds 75%
    growth: 0.1     // Alert when memory grows by 10%
  }
});

// Listen for memory leak detection
sentinel.on('leak', (leak) => {
  console.log('\n🚨 MEMORY LEAK DETECTED!');
  console.log(`Type: ${leak.type}`);
  console.log(`Probability: ${(leak.probability * 100).toFixed(1)}%`);
  console.log(`Heap Used: ${(leak.metrics.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Growth Rate: ${(leak.metrics.growthRate * 100).toFixed(1)}% per minute`);
  
  if (leak.recommendations) {
    console.log('\nRecommendations:');
    leak.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
  }
});

// Listen for warnings
sentinel.on('warning', (warning) => {
  console.log(`\n⚠️  WARNING: ${warning.message}`);
});

// Listen for metrics updates
sentinel.on('metrics', (metric) => {
  if (metric && metric.memory) {
    const mem = metric.memory;
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
    const heapPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
    
    console.log(`📊 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`);
  }
});

// Start monitoring
sentinel.start();

console.log('🚀 Basic Sentinel Monitoring Demo Started!');
console.log('📊 Monitoring memory every 5 seconds...\n');

// Demo: Simulate different memory patterns
console.log('🎯 Simulating various memory patterns...\n');

// Pattern 1: Normal allocation (gets garbage collected)
let tempData = [];
setInterval(() => {
  // Allocate and release
  tempData = new Array(1000).fill('temporary-data');
  // Will be garbage collected on next allocation
}, 2000);

// Pattern 2: Memory leak (never released)
const leakyStorage = [];
let leakCounter = 0;

setInterval(() => {
  // This simulates a memory leak - data is added but never removed
  leakCounter++;
  leakyStorage.push({
    id: leakCounter,
    data: new Array(5000).fill(`leak-${leakCounter}`),
    timestamp: new Date(),
    metadata: {
      source: 'demo-leak',
      additionalData: new Array(1000).fill('metadata')
    }
  });
  
  console.log(`💧 Added leak object #${leakCounter} (Total: ${leakyStorage.length})`);
}, 3000);

// Pattern 3: Sudden spikes
setInterval(() => {
  // Create a large temporary allocation
  const spike = new Array(50000).fill('spike-data');
  console.log('📈 Created memory spike');
  
  // Release after 1 second
  setTimeout(() => {
    spike.length = 0;
    console.log('📉 Released memory spike');
  }, 1000);
}, 15000);

// Show current metrics
function showMetrics() {
  const metrics = sentinel.getMetrics();
  const summary = metrics.summary || {};
  
  console.log('\n--- Current Memory Status ---');
  if (summary.current) {
    console.log(`Heap Used: ${(summary.current.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Total: ${(summary.current.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`RSS: ${(summary.current.rss / 1024 / 1024).toFixed(2)} MB`);
  }
  if (summary.average) {
    console.log(`Average Heap: ${(summary.average.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  }
  if (summary.peak) {
    console.log(`Peak Heap: ${(summary.peak.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log(`Samples: ${metrics.heap ? metrics.heap.length : 0}`);
  console.log('----------------------------\n');
}

// Show metrics every 20 seconds
setInterval(showMetrics, 20000);

// Manual commands
console.log('\n📖 Commands you can run:');
console.log('sentinel.analyze() - Run heap analysis');
console.log('sentinel.forceGC() - Force garbage collection');
console.log('sentinel.getLeaks() - Get detected leaks');
console.log('sentinel.reset() - Reset monitoring data');
console.log('sentinel.stop() - Stop monitoring\n');

// Make sentinel available globally for manual testing
global.sentinel = sentinel;

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down monitoring...');
  showMetrics();
  
  const leaks = sentinel.getLeaks();
  if (leaks.length > 0) {
    console.log(`\n🔍 Detected ${leaks.length} memory leak(s) during session:`);
    leaks.forEach((leak, i) => {
      console.log(`${i + 1}. ${leak.type} - ${(leak.probability * 100).toFixed(1)}% probability`);
    });
  }
  
  sentinel.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  sentinel.stop();
  process.exit(0);
});
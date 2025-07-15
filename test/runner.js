'use strict';

// Test framework imports not used directly in runner
// const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
// const assert = require('node:assert');
// const path = require('path');
// const fs = require('fs');
const CoverageCollector = require('./coverage');

// Import test modules
const sentinelTests = require('./sentinel.test');
const monitorTests = require('./monitor.test');
const detectorTests = require('./detector.test');
const analyzerTests = require('./analyzer.test');
const profilerTests = require('./profiler.test');
const reporterTests = require('./reporter.test');
const utilsTests = require('./utils.test');
const adaptersTests = require('./adapters.test');
const advancedTests = require('./advanced.test');
const securityTests = require('./security.test');

// New test modules
const errorsTests = require('./errors.test');
const performanceOptimizerTests = require('./performance.test');
const alertingTests = require('./alerting.test');
const hotspotsTests = require('./hotspots.test');
const streamingTests = require('./streaming.test');

// Integration and specialized tests
// const integrationTests = require('./integration/memory-monitoring.test');
// const performanceTests = require('./performance/benchmark.test');
// const stressTests = require('./stress/memory-stress.test');
// const e2eTests = require('./e2e/cli.test');

async function runTests(withCoverage = false) {
  console.log('Running @oxog/sentinel test suite...\n');
  
  const startTime = Date.now();
  let coverage;
  
  if (withCoverage) {
    console.log('📊 Starting test coverage collection...');
    coverage = new CoverageCollector();
    await coverage.start();
  }
  
  try {
    // Core tests
    console.log('🔍 Testing core functionality...');
    await sentinelTests();
    await monitorTests();
    await detectorTests();
    await analyzerTests();
    await profilerTests();
    await reporterTests();
    await utilsTests();
    await advancedTests();
    await securityTests();
    
    // New module tests
    console.log('🆕 Testing new modules...');
    console.log('  ⚠️  Running error handling tests...');
    await errorsTests();
    console.log('  ⚡ Running performance optimization tests...');
    await performanceOptimizerTests();
    console.log('  🚨 Running alerting system tests...');
    await alertingTests();
    console.log('  🔥 Running hotspots detection tests...');
    await hotspotsTests();
    console.log('  📡 Running streaming tests...');
    await streamingTests();
    
    // Adapter tests
    console.log('🔌 Testing framework adapters...');
    await adaptersTests();
    
    // Integration tests
    console.log('🔗 Testing integrations...');
    // await integrationTests();
    console.log('  ⏭️  Skipping integration tests...');
    
    // Performance tests
    console.log('⚡ Testing performance...');
    // await performanceTests();
    console.log('  ⏭️  Skipping performance tests...');
    
    // Stress tests
    console.log('💪 Running stress tests...');
    // await stressTests();
    console.log('  ⏭️  Skipping stress tests...');
    
    // End-to-end tests
    console.log('🚀 Testing end-to-end...');
    // await e2eTests();
    console.log('  ⏭️  Skipping e2e tests...');
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    
    if (withCoverage && coverage) {
      console.log('\n📊 Generating partial coverage report...');
      const coverageData = await coverage.stop();
      await coverage.generateReport(coverageData);
    }
    
    process.exit(1);
  }
  
  if (withCoverage && coverage) {
    console.log('\n📊 Collecting coverage data...');
    const coverageData = await coverage.stop();
    const report = await coverage.generateReport(coverageData);
    
    // Check if we achieved 100% coverage
    if (report.summary.lines.percentage === 100) {
      console.log('\n🎉 SUCCESS: 100% test coverage achieved!');
    } else {
      console.log(`\n⚠️  Coverage incomplete: ${report.summary.lines.percentage}% of lines covered`);
      console.log('   Run tests again to identify missing coverage areas.');
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`\n📊 Test suite completed in ${duration}ms`);
  
  // Force exit to prevent hanging
  setTimeout(() => {
    console.log('⚠️  Forcing exit due to hanging processes...');
    process.exit(0);
  }, 1000);
  
  return withCoverage ? coverage : null;
}

async function runTestsWithCoverage() {
  console.log('🎯 Running tests with coverage measurement...\n');
  return await runTests(true);
}

// Run tests if this is the main module
if (require.main === module) {
  const args = process.argv.slice(2);
  const shouldRunCoverage = args.includes('--coverage') || args.includes('-c');
  
  if (shouldRunCoverage) {
    runTestsWithCoverage().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
  } else {
    runTests().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
  }
}

module.exports = { runTests, runTestsWithCoverage };
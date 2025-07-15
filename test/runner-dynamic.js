'use strict';

// const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
// const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { glob } = require('fs/promises');

async function discoverTests() {
  const testFiles = [];
  
  // Find all test files recursively
  const patterns = [
    'test/*.test.js',
    'test/**/*.test.js'
  ];
  
  for (const pattern of patterns) {
    try {
      const files = await glob(pattern, { cwd: process.cwd() });
      testFiles.push(...files);
    } catch {
      // Fallback to manual discovery if glob is not available
      const testDirs = ['test', 'test/integration', 'test/performance', 'test/stress', 'test/e2e'];
      
      for (const dir of testDirs) {
        try {
          const files = fs.readdirSync(dir);
          const testFilesInDir = files
            .filter(f => f.endsWith('.test.js'))
            .map(f => path.join(dir, f));
          testFiles.push(...testFilesInDir);
        } catch (e) {
          // Directory doesn't exist
        }
      }
    }
  }
  
  // Remove duplicates and sort
  return [...new Set(testFiles)].sort();
}

async function runTests(withCoverage = false) {
  console.log('Running @oxog/sentinel test suite with dynamic discovery...\n');
  
  const startTime = Date.now();
  let coverage;
  
  if (withCoverage) {
    console.log('📊 Starting test coverage collection...');
    const CoverageCollector = require('./coverage');
    coverage = new CoverageCollector();
    await coverage.start();
  }
  
  try {
    const testFiles = await discoverTests();
    console.log(`Found ${testFiles.length} test files\n`);
    
    const categories = {
      core: [],
      integration: [],
      performance: [],
      stress: [],
      e2e: [],
      new: []
    };
    
    // Categorize test files
    for (const file of testFiles) {
      if (file.includes('integration/')) categories.integration.push(file);
      else if (file.includes('performance/')) categories.performance.push(file);
      else if (file.includes('stress/')) categories.stress.push(file);
      else if (file.includes('e2e/')) categories.e2e.push(file);
      else if (['errors.test.js', 'performance.test.js', 'alerting.test.js', 'hotspots.test.js', 'streaming.test.js'].some(n => file.includes(n))) {
        categories.new.push(file);
      }
      else categories.core.push(file);
    }
    
    // Run tests by category
    if (categories.core.length > 0) {
      console.log('🔍 Testing core functionality...');
      for (const file of categories.core) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
    if (categories.new.length > 0) {
      console.log('\n🆕 Testing new modules...');
      for (const file of categories.new) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
    if (categories.integration.length > 0) {
      console.log('\n🔗 Testing integrations...');
      for (const file of categories.integration) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
    if (categories.performance.length > 0) {
      console.log('\n⚡ Testing performance...');
      for (const file of categories.performance) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
    if (categories.stress.length > 0) {
      console.log('\n💪 Running stress tests...');
      for (const file of categories.stress) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
    if (categories.e2e.length > 0) {
      console.log('\n🚀 Testing end-to-end...');
      for (const file of categories.e2e) {
        console.log(`  Running ${path.basename(file)}...`);
        const testModule = require(path.resolve(file));
        if (typeof testModule === 'function') {
          await testModule();
        }
      }
    }
    
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
  
  return withCoverage ? coverage : null;
}

// Run tests if this is the main module
if (require.main === module) {
  const args = process.argv.slice(2);
  const shouldRunCoverage = args.includes('--coverage') || args.includes('-c');
  const specificFile = args.find(arg => arg.endsWith('.test.js'));
  
  if (specificFile) {
    // Run specific test file
    console.log(`Running specific test: ${specificFile}\n`);
    const testModule = require(path.resolve('test', specificFile));
    if (typeof testModule === 'function') {
      testModule().catch((error) => {
        console.error('Test error:', error);
        process.exit(1);
      });
    }
  } else {
    // Run all tests
    runTests(shouldRunCoverage).catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
  }
}

module.exports = { runTests };
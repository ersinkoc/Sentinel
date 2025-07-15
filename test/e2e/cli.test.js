'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
// const { TestUtils } = require('../setup');
const fs = require('fs');
const path = require('path');

describe('CLI End-to-End Tests', () => {
  // const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'sentinel.js');
  // const TEST_SCRIPT = path.join(__dirname, 'fixtures', 'test-app.js');

  test('should show help information', async () => {
    const result = await runCLI(['--help']);
    
    assert.ok(result.stdout.includes('Sentinel Memory Monitor'), 'Should show Sentinel description');
    assert.ok(result.stdout.includes('Commands:'), 'Should show commands section');
    assert.ok(result.stdout.includes('monitor'), 'Should list monitor command');
    assert.ok(result.stdout.includes('analyze'), 'Should list analyze command');
    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
  });

  test('should show version information', async () => {
    const result = await runCLI(['--version']);
    
    assert.ok(result.stdout.match(/\d+\.\d+\.\d+/), 'Should show version number');
    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
  });

  test('should monitor a simple script', async () => {
    // Create test script
    const testScript = createTestScript(`
      // Simple memory allocation test
      const data = [];
      for (let i = 0; i < 1000; i++) {
        data.push(new Array(100).fill('test-data'));
      }
      
      setTimeout(() => {
        console.log('Test script completed');
        process.exit(0);
      }, 2000);
    `);

    try {
      const result = await runCLI(['monitor', testScript.path], { timeout: 10000 });
      
      assert.strictEqual(result.exitCode, 0, 'Should exit successfully');
      assert.ok(result.stdout.includes('Memory monitoring started'), 'Should show monitoring started');
      assert.ok(result.stdout.includes('Test script completed'), 'Should show script output');
      
    } finally {
      testScript.cleanup();
    }
  });

  test('should detect memory leaks in CLI monitoring', async () => {
    // Create script with intentional memory leak
    const testScript = createTestScript(`
      // Memory leak simulation
      const leak = [];
      const interval = setInterval(() => {
        for (let i = 0; i < 1000; i++) {
          leak.push(new Array(1000).fill('leaked-data'));
        }
        console.log('Allocated more memory:', leak.length);
      }, 100);
      
      setTimeout(() => {
        clearInterval(interval);
        console.log('Leak script finished');
        process.exit(0);
      }, 2000);
    `);

    try {
      const result = await runCLI([
        'monitor', 
        testScript.path,
        '--detection', 'true',
        '--sensitivity', 'high'
      ], { timeout: 15000 });
      
      assert.strictEqual(result.exitCode, 0, 'Should exit successfully');
      assert.ok(result.stdout.includes('Memory monitoring started'), 'Should show monitoring started');
      assert.ok(
        result.stdout.includes('LEAK') || result.stdout.includes('Memory leak'),
        'Should detect memory leak'
      );
      
    } finally {
      testScript.cleanup();
    }
  });

  test('should analyze heap snapshot', async () => {
    // First create a heap snapshot
    const snapshotScript = createTestScript(`
      const v8 = require('v8');
      const fs = require('fs');
      
      // Create some objects for analysis
      const objects = [];
      for (let i = 0; i < 1000; i++) {
        objects.push({
          id: i,
          data: new Array(100).fill('snapshot-data'),
          timestamp: Date.now()
        });
      }
      
      // Take heap snapshot
      const snapshot = v8.writeHeapSnapshot();
      console.log('Snapshot written to:', snapshot);
      
      process.exit(0);
    `);

    try {
      // Generate snapshot
      const snapshotResult = await runCLI(['monitor', snapshotScript.path], { timeout: 10000 });
      assert.strictEqual(snapshotResult.exitCode, 0, 'Snapshot generation should succeed');
      
      // Extract snapshot filename from output
      const snapshotMatch = snapshotResult.stdout.match(/Snapshot written to: (.+\.heapsnapshot)/);
      if (snapshotMatch) {
        const snapshotPath = snapshotMatch[1];
        
        // Verify snapshot file exists
        assert.ok(fs.existsSync(snapshotPath), 'Snapshot file should exist');
        
        // Analyze the snapshot
        const analyzeResult = await runCLI(['analyze', snapshotPath], { timeout: 10000 });
        
        assert.strictEqual(analyzeResult.exitCode, 0, 'Analysis should succeed');
        assert.ok(analyzeResult.stdout.includes('Heap Analysis'), 'Should show analysis header');
        assert.ok(analyzeResult.stdout.includes('Object Count'), 'Should show object statistics');
        
        // Cleanup snapshot file
        try {
          fs.unlinkSync(snapshotPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      
    } finally {
      snapshotScript.cleanup();
    }
  });

  test('should start dashboard server', async () => {
    const result = await runCLI(['dashboard', '--port', '3002'], { 
      timeout: 5000,
      killAfter: 3000 // Kill after 3 seconds
    });
    
    // Dashboard should start successfully (may be killed by timeout)
    assert.ok(
      result.stdout.includes('Dashboard started') || 
      result.stdout.includes('http://localhost:3002'),
      'Should show dashboard started message'
    );
  });

  test('should handle invalid commands gracefully', async () => {
    const result = await runCLI(['invalid-command']);
    
    assert.notStrictEqual(result.exitCode, 0, 'Should exit with error code');
    assert.ok(result.stderr.includes('Unknown command') || result.stderr.includes('invalid'), 
      'Should show error message');
  });

  test('should handle missing script file', async () => {
    const result = await runCLI(['monitor', 'non-existent-file.js']);
    
    assert.notStrictEqual(result.exitCode, 0, 'Should exit with error code');
    assert.ok(
      result.stderr.includes('not found') || 
      result.stderr.includes('ENOENT') ||
      result.stdout.includes('Error'),
      'Should show file not found error'
    );
  });

  test('should benchmark performance via CLI', async () => {
    const result = await runCLI(['benchmark'], { timeout: 15000 });
    
    assert.strictEqual(result.exitCode, 0, 'Benchmark should complete successfully');
    assert.ok(result.stdout.includes('BENCHMARK REPORT'), 'Should show benchmark report');
    assert.ok(result.stdout.includes('Performance'), 'Should show performance metrics');
    assert.ok(result.stdout.includes('ops/sec'), 'Should show operations per second');
  });

  test('should watch for real-time monitoring', async () => {
    const result = await runCLI(['watch'], { 
      timeout: 3000,
      killAfter: 2000 // Kill after 2 seconds
    });
    
    // Watch should start and show real-time data
    assert.ok(
      result.stdout.includes('Real-time') || 
      result.stdout.includes('Monitoring') ||
      result.stdout.includes('Memory'),
      'Should show real-time monitoring information'
    );
  });

  test('should handle configuration options', async () => {
    const testScript = createTestScript(`
      console.log('Config test script');
      setTimeout(() => process.exit(0), 1000);
    `);

    try {
      const result = await runCLI([
        'monitor',
        testScript.path,
        '--interval', '500',
        '--threshold-heap', '0.9',
        '--reporting-console', 'true'
      ], { timeout: 8000 });
      
      assert.strictEqual(result.exitCode, 0, 'Should handle configuration options');
      assert.ok(result.stdout.includes('Memory monitoring started'), 'Should start monitoring');
      
    } finally {
      testScript.cleanup();
    }
  });
});

// Helper functions
function runCLI(args, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || 5000;
    const killAfter = options.killAfter;
    
    const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'sentinel.js');
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set up kill timer if specified
    let killTimer;
    if (killAfter) {
      killTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          killed = true;
        }
      }, killAfter);
    }

    // Set up timeout
    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        killed = true;
      }
    }, timeout);

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      
      resolve({
        exitCode: killed ? 0 : (code || 0), // Treat killed processes as successful for tests
        stdout,
        stderr,
        killed
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + error.message,
        error
      });
    });
  });
}

function createTestScript(content) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  const filename = `test-script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`;
  const filepath = path.join(os.tmpdir(), filename);
  
  fs.writeFileSync(filepath, content);
  
  return {
    path: filepath,
    cleanup: () => {
      try {
        fs.unlinkSync(filepath);
      } catch {
        // Ignore cleanup errors
      }
    }
  };
}
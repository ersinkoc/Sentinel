#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readline = require('readline');
const { spawn } = require('child_process');

const readFile = promisify(fs.readFile);
const access = promisify(fs.access);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bright: '\x1b[1m'
};

function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

function printUsage() {
  console.log(colorize('Sentinel - Zero-dependency Node.js memory monitor', 'cyan'));
  console.log('');
  console.log(colorize('Usage:', 'bright'));
  console.log('  sentinel <command> [options]');
  console.log('');
  console.log(colorize('Commands:', 'bright'));
  console.log('  monitor <script>     Monitor a Node.js script');
  console.log('  analyze <dump>       Analyze a heap dump file');
  console.log('  compare <dump1> <dump2>  Compare two heap dumps');
  console.log('  watch               Real-time memory dashboard');
  console.log('  profile <script>     Profile memory allocations');
  console.log('  dashboard           Start web dashboard');
  console.log('  benchmark           Run performance benchmarks');
  console.log('  stress-test         Run stress tests');
  console.log('  help                Show this help message');
  console.log('');
  console.log(colorize('Options:', 'bright'));
  console.log('  --interval <ms>     Monitoring interval (default: 30000)');
  console.log('  --threshold <0-1>   Memory threshold (default: 0.8)');
  console.log('  --sensitivity <low|medium|high>  Detection sensitivity');
  console.log('  --output <file>     Output file for reports');
  console.log('  --webhook <url>     Webhook URL for alerts');
  console.log('  --gc                Enable garbage collection monitoring');
  console.log('  --profile           Enable allocation profiling');
  console.log('');
  console.log(colorize('Examples:', 'bright'));
  console.log('  sentinel monitor app.js');
  console.log('  sentinel monitor app.js --threshold 0.9 --output report.json');
  console.log('  sentinel analyze heap.heapsnapshot');
  console.log('  sentinel compare heap1.heapsnapshot heap2.heapsnapshot');
  console.log('  sentinel watch');
  console.log('  sentinel dashboard --port 3001');
  console.log('  sentinel benchmark');
  console.log('  sentinel stress-test');
}

async function monitorScript(scriptPath, options) {
  try {
    await access(scriptPath);
  } catch {
    console.error(colorize(`Error: Script not found: ${scriptPath}`, 'red'));
    process.exit(1);
  }
  
  console.log(colorize(`Starting memory monitoring for: ${scriptPath}`, 'green'));
  
  const sentinelPath = path.resolve(__dirname, '..', 'index.js');
  const nodeArgs = ['--expose-gc'];
  
  if (options.profile) {
    nodeArgs.push('--inspect');
  }
  
  // Set environment variables for Sentinel configuration with validation
  const env = { ...process.env };

  if (options.interval) {
    const interval = parseInt(options.interval, 10);
    if (interval >= 1000 && interval <= 300000) {
      env.SENTINEL_INTERVAL = interval.toString();
    } else {
      console.warn(colorize(`Warning: Interval must be between 1000 and 300000ms. Using default.`, 'yellow'));
    }
  }

  if (options.threshold) {
    const threshold = parseFloat(options.threshold);
    if (threshold >= 0 && threshold <= 1) {
      env.SENTINEL_THRESHOLD = threshold.toString();
    } else {
      console.warn(colorize(`Warning: Threshold must be between 0 and 1. Using default.`, 'yellow'));
    }
  }

  if (options.sensitivity) {
    if (['low', 'medium', 'high'].includes(options.sensitivity)) {
      env.SENTINEL_SENSITIVITY = options.sensitivity;
    } else {
      console.warn(colorize(`Warning: Sensitivity must be low, medium, or high. Using default.`, 'yellow'));
    }
  }
  if (options.output) env.SENTINEL_OUTPUT = options.output;
  if (options.webhook) env.SENTINEL_WEBHOOK = options.webhook;
  
  // Require Sentinel before the target script
  nodeArgs.push('-r', sentinelPath, scriptPath);
  
  const child = spawn('node', nodeArgs, {
    env,
    stdio: 'inherit'
  });
  
  child.on('exit', (code) => {
    console.log(colorize(`Script exited with code: ${code}`, code === 0 ? 'green' : 'red'));
  });
  
  child.on('error', (err) => {
    console.error(colorize(`Failed to start script: ${err.message}`, 'red'));
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(colorize('\nShutting down monitor...', 'yellow'));
    child.kill('SIGINT');
  });
}

async function analyzeHeapDump(dumpPath) {
  try {
    await access(dumpPath);
  } catch {
    console.error(colorize(`Error: Heap dump not found: ${dumpPath}`, 'red'));
    process.exit(1);
  }
  
  console.log(colorize(`Analyzing heap dump: ${dumpPath}`, 'blue'));
  
  try {
    const data = await readFile(dumpPath, 'utf8');
    const snapshot = JSON.parse(data);
    
    const analysis = analyzeSnapshot(snapshot);
    printAnalysis(analysis);
    
  } catch (error) {
    console.error(colorize(`Failed to analyze dump: ${error.message}`, 'red'));
    process.exit(1);
  }
}

function analyzeSnapshot(snapshot) {
  const nodes = snapshot.nodes || [];
  const strings = snapshot.strings || [];
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const nodeTypes = snapshot.snapshot.meta.node_types;
  
  const objects = new Map();
  const typeStats = new Map();
  let totalSize = 0;
  let nodeIndex = 0;
  
  for (let i = 0; i < nodes.length; i += nodeFields.length) {
    const type = nodeTypes[nodes[i]];
    const name = strings[nodes[i + 1]];
    const size = nodes[i + 3];
    
    totalSize += size;
    
    if (!typeStats.has(type)) {
      typeStats.set(type, { count: 0, size: 0 });
    }
    
    const stats = typeStats.get(type);
    stats.count++;
    stats.size += size;
    
    if (size > 1024 * 1024) { // Objects larger than 1MB
      objects.set(nodeIndex, {
        type,
        name,
        size,
        sizeMB: (size / 1024 / 1024).toFixed(2)
      });
    }
    
    nodeIndex++;
  }
  
  return {
    totalSize,
    totalObjects: nodeIndex,
    largeObjects: Array.from(objects.values()).sort((a, b) => b.size - a.size).slice(0, 10),
    typeDistribution: Array.from(typeStats.entries())
      .map(([type, stats]) => ({ type, ...stats }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
  };
}

function printAnalysis(analysis) {
  console.log('');
  console.log(colorize('=== Heap Analysis Results ===', 'bright'));
  console.log('');
  
  console.log(colorize('Summary:', 'yellow'));
  console.log(`  Total Objects: ${analysis.totalObjects.toLocaleString()}`);
  console.log(`  Total Size: ${(analysis.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('');
  
  if (analysis.largeObjects.length > 0) {
    console.log(colorize('Large Objects (>1MB):', 'yellow'));
    analysis.largeObjects.forEach((obj, i) => {
      console.log(`  ${i + 1}. ${obj.type} - ${obj.sizeMB} MB${obj.name ? ` (${obj.name})` : ''}`);
    });
    console.log('');
  }
  
  console.log(colorize('Type Distribution:', 'yellow'));
  analysis.typeDistribution.forEach((type, i) => {
    const sizeMB = (type.size / 1024 / 1024).toFixed(2);
    console.log(`  ${i + 1}. ${type.type}: ${type.count.toLocaleString()} objects, ${sizeMB} MB`);
  });
}

async function compareHeapDumps(dump1Path, dump2Path) {
  try {
    await access(dump1Path);
    await access(dump2Path);
  } catch {
    console.error(colorize('Error: One or both heap dumps not found', 'red'));
    process.exit(1);
  }
  
  console.log(colorize('Comparing heap dumps:', 'blue'));
  console.log(`  Before: ${dump1Path}`);
  console.log(`  After: ${dump2Path}`);
  console.log('');
  
  try {
    const data1 = await readFile(dump1Path, 'utf8');
    const data2 = await readFile(dump2Path, 'utf8');
    
    const snapshot1 = JSON.parse(data1);
    const snapshot2 = JSON.parse(data2);
    
    const analysis1 = analyzeSnapshot(snapshot1);
    const analysis2 = analyzeSnapshot(snapshot2);
    
    printComparison(analysis1, analysis2);
    
  } catch (error) {
    console.error(colorize(`Failed to compare dumps: ${error.message}`, 'red'));
    process.exit(1);
  }
}

function printComparison(before, after) {
  const sizeDiff = after.totalSize - before.totalSize;
  const objectDiff = after.totalObjects - before.totalObjects;
  
  console.log(colorize('=== Comparison Results ===', 'bright'));
  console.log('');
  
  console.log(colorize('Size Changes:', 'yellow'));
  console.log(`  Before: ${(before.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  After:  ${(after.totalSize / 1024 / 1024).toFixed(2)} MB`);
  
  const diffColor = sizeDiff > 0 ? 'red' : 'green';
  const diffSign = sizeDiff > 0 ? '+' : '';
  console.log(`  Diff:   ${colorize(`${diffSign}${(sizeDiff / 1024 / 1024).toFixed(2)} MB`, diffColor)}`);
  console.log('');
  
  console.log(colorize('Object Count Changes:', 'yellow'));
  console.log(`  Before: ${before.totalObjects.toLocaleString()}`);
  console.log(`  After:  ${after.totalObjects.toLocaleString()}`);
  
  const objDiffColor = objectDiff > 0 ? 'red' : 'green';
  const objDiffSign = objectDiff > 0 ? '+' : '';
  console.log(`  Diff:   ${colorize(`${objDiffSign}${objectDiff.toLocaleString()}`, objDiffColor)}`);
  
  if (sizeDiff > 10 * 1024 * 1024) { // 10MB growth
    console.log('');
    console.log(colorize('⚠️  Warning: Significant memory growth detected!', 'red'));
    console.log('   Consider investigating for memory leaks.');
  }
}

async function watchMemory() {
  console.log(colorize('Real-time Memory Dashboard', 'cyan'));
  console.log(colorize('Press Ctrl+C to exit', 'gray'));
  console.log('');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const displayMetrics = () => {
    const memUsage = process.memoryUsage();
    const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const external = (memUsage.external / 1024 / 1024).toFixed(2);
    const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
    
    // Clear screen and move cursor to top
    process.stdout.write('\x1b[2J\x1b[H');
    
    console.log(colorize('=== Sentinel Memory Dashboard ===', 'bright'));
    console.log('');
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colorize('Timestamp:', 'yellow')} ${timestamp}`);
    console.log(`${colorize('Process ID:', 'yellow')} ${process.pid}`);
    console.log(`${colorize('Uptime:', 'yellow')} ${Math.floor(process.uptime())}s`);
    console.log('');
    
    console.log(colorize('Memory Usage:', 'bright'));
    console.log(`  ${colorize('Heap Used:', 'cyan')} ${heapUsed} MB`);
    console.log(`  ${colorize('Heap Total:', 'cyan')} ${heapTotal} MB`);
    console.log(`  ${colorize('External:', 'cyan')} ${external} MB`);
    console.log(`  ${colorize('RSS:', 'cyan')} ${rss} MB`);
    
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(1);
    const bar = createProgressBar(parseFloat(heapPercent), 40);
    console.log(`  ${colorize('Heap Usage:', 'cyan')} ${bar} ${heapPercent}%`);
    
    if (global.gc) {
      console.log('');
      console.log(colorize('Actions:', 'yellow'));
      console.log('  Press "g" + Enter to trigger garbage collection');
    }
    
    console.log('');
    console.log(colorize('Press Ctrl+C to exit', 'gray'));
  };
  
  const interval = setInterval(displayMetrics, 1000);
  displayMetrics();
  
  rl.on('line', (input) => {
    if (input.trim().toLowerCase() === 'g' && global.gc) {
      console.log(colorize('Triggering garbage collection...', 'yellow'));
      global.gc();
    }
  });
  
  process.on('SIGINT', () => {
    clearInterval(interval);
    rl.close();
    console.log(colorize('\nDashboard closed.', 'green'));
    process.exit(0);
  });
}

function createProgressBar(percentage, width) {
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  
  let color = 'green';
  if (percentage > 80) color = 'red';
  else if (percentage > 60) color = 'yellow';
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return colorize(`[${bar}]`, color);
}

async function profileScript(scriptPath, _options) {
  try {
    await access(scriptPath);
  } catch {
    console.error(colorize(`Error: Script not found: ${scriptPath}`, 'red'));
    process.exit(1);
  }
  
  console.log(colorize(`Profiling memory allocations for: ${scriptPath}`, 'green'));
  console.log(colorize('This will take 30 seconds...', 'gray'));
  
  const sentinelPath = path.resolve(__dirname, '..', 'index.js');
  const nodeArgs = ['--expose-gc', '--inspect'];
  
  const env = { 
    ...process.env,
    SENTINEL_PROFILE_MODE: 'true',
    SENTINEL_PROFILE_DURATION: '30000'
  };
  
  nodeArgs.push('-r', sentinelPath, scriptPath);
  
  const child = spawn('node', nodeArgs, {
    env,
    stdio: 'pipe'
  });
  
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  child.on('exit', (code) => {
    if (code === 0) {
      console.log(colorize('Profiling completed!', 'green'));
      if (output) {
        console.log('\nProfile results:');
        console.log(output);
      }
    } else {
      console.error(colorize(`Profiling failed with code: ${code}`, 'red'));
    }
  });
}

async function startDashboard(options) {
  console.log(colorize('Starting Sentinel Web Dashboard...', 'cyan'));
  
  const sentinel = require(path.resolve(__dirname, '..', 'index.js'));
  const SentinelDashboard = require(path.resolve(__dirname, '..', 'packages', 'dashboard'));
  
  const port = options.port || 3001;
  const host = options.host || 'localhost';

  // Parse auth string if provided (format: username:password)
  let authConfig = null;
  if (options.auth) {
    const authParts = options.auth.split(':');
    authConfig = {
      username: authParts[0] || 'admin',
      password: authParts[1] || authParts[0] // If no colon, use entire string as password
    };
  }

  const dashboard = new SentinelDashboard(sentinel, {
    port: parseInt(port, 10),
    host,
    auth: authConfig
  });
  
  try {
    await dashboard.start();
    console.log(colorize(`🌐 Dashboard running at http://${host}:${port}`, 'green'));
    console.log(colorize('Press Ctrl+C to stop', 'gray'));
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(colorize('\nShutting down dashboard...', 'yellow'));
      await dashboard.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(colorize(`Failed to start dashboard: ${error.message}`, 'red'));
    process.exit(1);
  }
}

async function runBenchmark(options) {
  console.log(colorize('Running Sentinel benchmarks...', 'cyan'));
  
  const benchmarkPath = path.resolve(__dirname, '..', 'benchmark', 'index.js');
  
  try {
    await access(benchmarkPath);
  } catch {
    console.error(colorize('Benchmark suite not found', 'red'));
    process.exit(1);
  }
  
  const child = spawn('node', [benchmarkPath], {
    stdio: 'inherit',
    env: { ...process.env, ...options }
  });
  
  child.on('exit', (code) => {
    if (code === 0) {
      console.log(colorize('\n✅ Benchmark completed successfully!', 'green'));
    } else {
      console.error(colorize(`\n❌ Benchmark failed with code: ${code}`, 'red'));
      process.exit(code);
    }
  });
}

async function runStressTest(options) {
  console.log(colorize('Running Sentinel stress tests...', 'cyan'));
  console.log(colorize('⚠️  Warning: This will consume significant system resources', 'yellow'));
  
  const stressTestPath = path.resolve(__dirname, '..', 'benchmark', 'stress-test.js');
  
  try {
    await access(stressTestPath);
  } catch {
    console.error(colorize('Stress test suite not found', 'red'));
    process.exit(1);
  }
  
  const child = spawn('node', [stressTestPath], {
    stdio: 'inherit',
    env: { ...process.env, ...options }
  });
  
  child.on('exit', (code) => {
    if (code === 0) {
      console.log(colorize('\n✅ Stress tests completed!', 'green'));
    } else {
      console.error(colorize(`\n❌ Stress tests failed with code: ${code}`, 'red'));
      process.exit(code);
    }
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++; // Skip next arg as it's the value
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  
  return { positional, options };
}

async function main() {
  const { positional, options } = parseArgs();
  const command = positional[0];
  
  if (!command || command === 'help' || options.help) {
    printUsage();
    return;
  }
  
  switch (command) {
  case 'monitor':
    if (!positional[1]) {
      console.error(colorize('Error: Script path required for monitor command', 'red'));
      process.exit(1);
    }
    await monitorScript(positional[1], options);
    break;
      
  case 'analyze':
    if (!positional[1]) {
      console.error(colorize('Error: Heap dump path required for analyze command', 'red'));
      process.exit(1);
    }
    await analyzeHeapDump(positional[1]);
    break;
      
  case 'compare':
    if (!positional[1] || !positional[2]) {
      console.error(colorize('Error: Two heap dump paths required for compare command', 'red'));
      process.exit(1);
    }
    await compareHeapDumps(positional[1], positional[2]);
    break;
      
  case 'watch':
    await watchMemory();
    break;
      
  case 'profile':
    if (!positional[1]) {
      console.error(colorize('Error: Script path required for profile command', 'red'));
      process.exit(1);
    }
    await profileScript(positional[1], options);
    break;
      
  case 'dashboard':
    await startDashboard(options);
    break;
      
  case 'benchmark':
    await runBenchmark(options);
    break;
      
  case 'stress-test':
    await runStressTest(options);
    break;
      
  default:
    console.error(colorize(`Error: Unknown command: ${command}`, 'red'));
    console.log('Run "sentinel help" for usage information.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  });
}
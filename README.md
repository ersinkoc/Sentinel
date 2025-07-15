# 🛡️ Sentinel

**Zero-dependency memory monitoring and leak detection for Node.js applications**

[![npm version](https://badge.fury.io/js/%40oxog%2Fsentinel.svg)](https://badge.fury.io/js/%40oxog%2Fsentinel)
[![Node.js CI](https://github.com/ersinkoc/sentinel/workflows/Node.js%20CI/badge.svg)](https://github.com/ersinkoc/sentinel/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Security](https://img.shields.io/badge/Security-Hardened-green.svg)](docs/SECURITY.md)

Sentinel is a **production-ready**, enterprise-grade memory guardian that automatically detects and reports memory leaks in Node.js applications. Built using **only** Node.js built-in modules with absolutely zero external dependencies for maximum security and reliability.

## 🚀 Quick Start

```bash
npm install @oxog/sentinel
```

### Zero Configuration
```javascript
// Just require and forget - monitoring starts automatically
require('@oxog/sentinel');

// Your application code...
```

### Advanced Usage
```javascript
const sentinel = require('@oxog/sentinel');

sentinel.configure({
  threshold: { heap: 0.8, growth: 0.1 },
  interval: 30000,
  onLeak: (leak) => {
    console.error('Memory leak detected:', leak);
    // Send alert, restart process, etc.
  }
});
```

## ✨ Features

### Core Monitoring
- **🔍 Automatic Leak Detection** - Detects common memory leak patterns without configuration
- **📊 Real-time Monitoring** - Continuous heap tracking with configurable intervals  
- **🛡️ Production Safe** - Zero overhead when disabled, graceful degradation under load
- **📱 Framework Support** - Express, Fastify, Koa, Next.js adapters included
- **🔧 Zero Dependencies** - Built entirely with Node.js built-in modules
- **⚡ Minimal Overhead** - <1% CPU, <10MB memory footprint
- **📈 Smart Analysis** - Pattern recognition with actionable recommendations
- **🎯 CLI Tools** - Analyze heap dumps, real-time dashboard, profiling

### Advanced Features ✨
- **🔴 Real-time Streaming** - Live memory data via Server-Sent Events
- **🚨 Intelligent Alerting** - Smart alert system with escalation and throttling
- **🔥 Memory Hotspots** - Advanced analysis of memory usage patterns
- **📡 Live Dashboard** - Real-time web-based monitoring interface
- **🔔 Multi-channel Notifications** - Console, file, webhook, and custom channels
- **⚡ Performance Optimization** - Adaptive monitoring and resource management
- **🛡️ Security Features** - Input validation, access control, and threat detection

## 🏗️ Architecture

Sentinel's modular architecture is built entirely on Node.js built-ins:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Monitor       │    │   Detector      │    │   Analyzer      │
│   (v8, perf)    │───▶│   (algorithms)  │───▶│   (snapshots)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Reporter      │    │   Profiler      │    │   Adapters      │
│   (fs, http)    │    │   (inspector)   │    │   (framework)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📖 Usage Examples

### Express.js Integration
```javascript
const express = require('express');
const { wrapApp } = require('@oxog/sentinel/packages/adapters');

const app = express();

// Automatically detects Express and adds monitoring
wrapApp(app);

app.get('/api/users', (req, res) => {
  // Your route logic - memory usage automatically tracked
  res.json({ users: [] });
});
```

### Fastify Integration
```javascript
const fastify = require('fastify')();
const { FastifyAdapter } = require('@oxog/sentinel/packages/adapters');

const adapter = new FastifyAdapter();
adapter.wrapApp(fastify);

fastify.get('/api/data', async (request, reply) => {
  // Memory tracking included automatically
  return { data: [] };
});
```

### Manual Heap Analysis
```javascript
const sentinel = require('@oxog/sentinel');

async function checkMemory() {
  const snapshot = await sentinel.snapshot();
  const analysis = await sentinel.analyze();
  
  console.log('Leak candidates:', analysis.leakCandidates);
  console.log('Largest objects:', analysis.largestObjects);
  console.log('Recommendations:', analysis.recommendations);
}
```

### Memory Profiling
```javascript
const sentinel = require('@oxog/sentinel');

async function profileAllocation() {
  const profile = await sentinel.profile(30000); // 30 seconds
  
  console.log('Hot spots:', profile.hotSpots);
  console.log('Allocation patterns:', profile.patterns);
  console.log('Recommendations:', profile.summary.recommendations);
}
```

## 🚀 Advanced Features

### Real-time Streaming
Stream live memory data to clients using Server-Sent Events:

```javascript
const sentinel = new Sentinel({
  streaming: {
    enabled: true,
    port: 3001,
    channels: ['memory', 'alerts', 'hotspots']
  }
});

sentinel.start();
await sentinel.startStreaming();

// Client-side (browser)
const eventSource = new EventSource('http://localhost:3001/stream?channels=memory,alerts');
eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Memory update:', data);
};
```

### Intelligent Alerting
Advanced alert system with escalation and smart filtering:

```javascript
const sentinel = new Sentinel({
  alerting: {
    enabled: true,
    throttling: { enabled: true, maxAlertsPerWindow: 10 },
    escalation: { enabled: true },
    channels: {
      console: { type: 'console', minLevel: 'warning' },
      webhook: { 
        type: 'webhook', 
        url: 'https://hooks.slack.com/services/...',
        minLevel: 'error'
      }
    }
  }
});

// Create custom alerts
sentinel.createAlert({
  level: 'critical',
  title: 'High Memory Usage',
  message: 'Memory usage exceeded 90%',
  category: 'memory',
  recommendations: ['Restart service', 'Check for leaks']
});

// Handle alert events
sentinel.on('alert-created', (alert) => {
  console.log(`Alert: [${alert.level}] ${alert.title}`);
});

sentinel.on('alert-escalated', (alert) => {
  console.log(`Alert escalated to ${alert.level}`);
});
```

### Memory Hotspots Analysis
Identify memory usage patterns and hotspots:

```javascript
const sentinel = new Sentinel({
  hotspots: {
    enabled: true,
    sampleInterval: 10000,
    thresholds: {
      growth: 0.05,    // 5% growth threshold
      frequency: 5,    // Must occur 5+ times
      size: 1024 * 1024 // 1MB minimum size
    }
  }
});

// Start hotspot analysis
sentinel.startHotspotAnalysis();

// Get current hotspots
const hotspots = sentinel.getMemoryHotspots();
console.log('Active hotspots:', hotspots);

// Get memory map
const memoryMap = sentinel.getMemoryMap();
console.log('Memory distribution:', memoryMap.objects);

// Handle hotspot events
sentinel.on('hotspot-detected', (hotspot) => {
  console.log(`Hotspot detected: ${hotspot.type} (${hotspot.severity})`);
  console.log('Recommendations:', hotspot.recommendations);
});
```

### Multi-channel Notifications
Configure multiple notification channels:

```javascript
const sentinel = new Sentinel({
  alerting: {
    enabled: true,
    channels: {
      // Console notifications
      console: {
        type: 'console',
        minLevel: 'info'
      },
      
      // File logging
      logFile: {
        type: 'file',
        path: './logs/alerts.log',
        minLevel: 'warning'
      },
      
      // Webhook integration
      slack: {
        type: 'webhook',
        url: 'https://hooks.slack.com/services/...',
        minLevel: 'error',
        filters: {
          categories: ['memory-leak', 'critical-error']
        }
      },
      
      // Email notifications (custom handler)
      email: {
        type: 'email',
        recipients: ['admin@company.com'],
        minLevel: 'critical'
      }
    }
  }
});

// Handle custom notification types
sentinel.alerts.on('email-notification', ({ emailData }) => {
  // Send email using your preferred email service
  sendEmail(emailData.to, emailData.subject, emailData.body);
});
```

## 🛠️ CLI Usage

### Real-time Monitoring
```bash
# Monitor a Node.js script
npx @oxog/sentinel monitor app.js

# With custom settings
npx @oxog/sentinel monitor app.js --threshold 0.9 --interval 10000
```

### Heap Analysis
```bash
# Analyze a heap dump
npx @oxog/sentinel analyze heap.heapsnapshot

# Compare two heap dumps
npx @oxog/sentinel compare before.heapsnapshot after.heapsnapshot
```

### Live Dashboard
```bash
# Real-time memory dashboard
npx @oxog/sentinel watch
```

### Memory Profiling
```bash
# Profile memory allocations
npx @oxog/sentinel profile app.js
```

## ⚙️ Configuration

```javascript
const sentinel = require('@oxog/sentinel');

sentinel.configure({
  // Enable/disable monitoring
  enabled: true,
  
  // Monitoring interval (ms)
  interval: 30000,
  
  // Memory thresholds
  threshold: {
    heap: 0.8,        // 80% of heap limit
    growth: 0.1,      // 10% growth rate
    gcFrequency: 10   // GCs per minute
  },
  
  // Detection settings
  detection: {
    sensitivity: 'medium',  // 'low' | 'medium' | 'high'
    patterns: ['all'],      // Leak patterns to detect
    baseline: {
      duration: 60000,      // Baseline duration
      samples: 10           // Samples for baseline
    }
  },
  
  // Reporting configuration
  reporting: {
    console: true,          // Console output
    file: false,           // File logging
    webhook: null          // Webhook URL
  },
  
  // Production safety
  production: {
    maxCpuUsage: 0.7,      // Skip monitoring if CPU > 70%
    maxMemoryUsage: 0.9    // Skip monitoring if memory > 90%
  },
  
  // Leak callback
  onLeak: (leak) => {
    // Custom leak handling
    console.error('Leak detected:', leak);
  }
});
```

## 🔍 Leak Detection Patterns

Sentinel automatically detects these memory leak patterns:

### Rapid Growth
```javascript
// Detected: Sudden heap size increases
const data = [];
setInterval(() => {
  data.push(new Array(10000).fill('leak'));
}, 100);
```

### Event Listener Accumulation
```javascript
// Detected: Growing event listener count
const emitter = new EventEmitter();
setInterval(() => {
  emitter.on('data', () => {});
}, 1000);
```

### Closure Retention
```javascript
// Detected: Closures holding references
function createClosure() {
  const largeData = new Array(100000);
  return () => largeData.length;
}
const closures = [];
setInterval(() => {
  closures.push(createClosure());
}, 1000);
```

### Timer Leaks
```javascript
// Detected: Accumulating timers
setInterval(() => {
  setTimeout(() => {
    // Timer never cleared
  }, 60000);
}, 1000);
```

## 📊 Framework Monitoring

### Express Route Tracking
```javascript
const { ExpressAdapter } = require('@oxog/sentinel/packages/adapters');
const adapter = new ExpressAdapter();

app.use(adapter.middleware());

// Get route performance metrics
const metrics = adapter.getRouteMetrics();
console.log(metrics);
// [{ route: 'GET /api/users', avgMemoryDelta: 1024, requests: 150 }]
```

### Next.js SSR Monitoring
```javascript
const { NextAdapter } = require('@oxog/sentinel/packages/adapters');
const adapter = new NextAdapter();

// Wrap getServerSideProps
export const getServerSideProps = adapter.wrapSSRFunction(
  async (context) => {
    // Your SSR logic
    return { props: {} };
  },
  'getServerSideProps',
  'UserPage'
);
```

## 🧪 Testing

```bash
# Run test suite
npm test

# Run with coverage
npm run test:coverage

# Run benchmarks
npm run benchmark
```

## 🔧 Development

```bash
# Clone repository
git clone https://github.com/ersinkoc/sentinel.git
cd sentinel

# Install dev dependencies (TypeScript only)
npm install

# Build TypeScript definitions
npm run build:types

# Run tests
npm test
```

## 📈 Performance Impact

Sentinel is designed for production use with minimal overhead:

- **CPU Usage**: <1% under normal load
- **Memory Overhead**: <10MB
- **Collection Time**: <5ms per sample
- **GC Impact**: Negligible

### Benchmarks
```
Memory Monitoring:    0.3ms per collection
Leak Detection:       1.2ms per analysis  
Heap Snapshot:        50ms (depending on heap size)
Framework Middleware: 0.1ms per request
```

## 🚫 Zero Dependencies Philosophy

Sentinel proves that modern Node.js built-ins are powerful enough to build professional monitoring tools:

- **v8**: Heap statistics, snapshots, sampling profiler
- **perf_hooks**: Performance timing, GC events
- **inspector**: Allocation profiling, debugger protocol  
- **fs**: File operations, log writing
- **http/https**: Webhook notifications
- **events**: Event-driven architecture
- **worker_threads**: Isolation and threading
- **process**: System metrics, signals

No external packages means:
- ✅ No supply chain attacks
- ✅ No breaking dependency updates  
- ✅ Minimal package size
- ✅ Maximum compatibility
- ✅ Easy security audits

## 🛡️ Security

- **No External Dependencies**: Zero third-party packages to audit
- **Read-only by Default**: No file system modifications unless configured
- **Safe Inspector Usage**: Graceful fallback if debugging not available
- **Production Hardened**: Automatic monitoring suspension under high load
- **Environment Aware**: Respects NODE_ENV and process signals

## 📝 Common Memory Leak Fixes

### Event Listeners
```javascript
// ❌ Leak: Event listeners not removed
emitter.on('data', handler);

// ✅ Fix: Remove listeners
emitter.on('data', handler);
process.on('exit', () => emitter.removeListener('data', handler));

// ✅ Better: Use once for one-time events
emitter.once('data', handler);
```

### Timers
```javascript
// ❌ Leak: Timer not cleared
const timer = setInterval(callback, 1000);

// ✅ Fix: Clear timers
const timer = setInterval(callback, 1000);
process.on('exit', () => clearInterval(timer));
```

### Closures
```javascript
// ❌ Leak: Closure retains large object
function processData(largeData) {
  return (input) => {
    return input + largeData.length; // Retains entire largeData
  };
}

// ✅ Fix: Extract only needed data
function processData(largeData) {
  const length = largeData.length; // Extract just the length
  return (input) => {
    return input + length;
  };
}
```

### Caching
```javascript
// ❌ Leak: Unbounded cache
const cache = new Map();
function getData(key) {
  if (!cache.has(key)) {
    cache.set(key, expensiveOperation(key));
  }
  return cache.get(key);
}

// ✅ Fix: LRU cache with size limit
const LRU = require('lru-cache'); // Or implement simple LRU
const cache = new LRU({ max: 1000 });
```

## 📚 API Reference

### Core API

#### `sentinel.configure(config)`
Configure monitoring settings.

#### `sentinel.start()` / `sentinel.stop()`
Start/stop memory monitoring.

#### `sentinel.snapshot()`
Create heap snapshot for analysis.

#### `sentinel.analyze(options)`
Analyze current memory state.

#### `sentinel.compare(snapshot1, snapshot2)`
Compare two heap snapshots.

#### `sentinel.profile(duration)`
Profile memory allocations.

#### `sentinel.forceGC()`
Trigger garbage collection if available.

### Events

- `leak` - Memory leak detected
- `warning` - Memory warning
- `metrics` - New metrics collected
- `start` - Monitoring started
- `stop` - Monitoring stopped

### Framework Adapters

- `ExpressAdapter` - Express.js integration
- `FastifyAdapter` - Fastify integration  
- `KoaAdapter` - Koa.js integration
- `NextAdapter` - Next.js integration

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Node.js team for powerful built-in modules
- V8 team for excellent heap inspection APIs
- Community feedback and testing

---

**Built with ❤️ and zero dependencies**

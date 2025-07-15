#!/usr/bin/env node
'use strict';

/**
 * Sentinel Streaming Demo
 * 
 * This example demonstrates real-time memory monitoring with Server-Sent Events
 * streaming to provide live updates to connected clients.
 */

const Sentinel = require('../index');

// Create Sentinel instance with streaming enabled
const sentinel = new Sentinel({
  monitoring: {
    interval: 2000, // Update every 2 seconds for demo
    detailed: true
  },
  streaming: {
    enabled: true,
    port: 3101,
    cors: {
      enabled: true,
      origin: '*'
    },
    auth: {
      enabled: false // Disable auth for demo
    },
    maxConnections: 10
  },
  threshold: {
    heap: 0.8,
    growth: 0.1
  }
});

// Start monitoring and streaming
sentinel.start();

console.log('🚀 Sentinel Streaming Demo started!');
console.log('📡 SSE endpoint: http://localhost:3101/stream');
console.log('📊 Metrics endpoint: http://localhost:3101/metrics');
console.log('🔍 Info endpoint: http://localhost:3101/\n');

// HTML client page
const clientHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Sentinel Memory Monitor</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #1a1a1a;
            color: #e0e0e0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .metric-card {
            background: #2a2a2a;
            border-radius: 8px;
            padding: 20px;
            margin: 10px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .metric-title {
            font-size: 18px;
            color: #4a9eff;
            margin-bottom: 10px;
        }
        .metric-value {
            font-size: 36px;
            font-weight: bold;
            color: #fff;
        }
        .metric-unit {
            font-size: 18px;
            color: #888;
        }
        .alert {
            background: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
            animation: pulse 1s infinite;
        }
        .warning {
            background: #ff8844;
            color: white;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        #log {
            background: #1a1a1a;
            border: 1px solid #333;
            padding: 10px;
            height: 200px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
        }
        .status {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .connected {
            background: #44ff44;
            color: #000;
        }
        .disconnected {
            background: #ff4444;
            color: #fff;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚨 Sentinel Memory Monitor</h1>
        <div id="status" class="status disconnected">Disconnected</div>
        
        <div id="alerts"></div>
        
        <div class="grid">
            <div class="metric-card">
                <div class="metric-title">Heap Used</div>
                <div>
                    <span id="heapUsed" class="metric-value">-</span>
                    <span class="metric-unit">MB</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Heap Total</div>
                <div>
                    <span id="heapTotal" class="metric-value">-</span>
                    <span class="metric-unit">MB</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-title">RSS Memory</div>
                <div>
                    <span id="rss" class="metric-value">-</span>
                    <span class="metric-unit">MB</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-title">External Memory</div>
                <div>
                    <span id="external" class="metric-value">-</span>
                    <span class="metric-unit">MB</span>
                </div>
            </div>
        </div>
        
        <h2>Event Log</h2>
        <div id="log"></div>
    </div>

    <script>
        const eventSource = new EventSource('http://localhost:3101/stream?channels=metrics,leak,warning');
        const status = document.getElementById('status');
        const log = document.getElementById('log');
        const alerts = document.getElementById('alerts');
        
        function addLog(message) {
            const time = new Date().toLocaleTimeString();
            log.innerHTML = \`[\${time}] \${message}<br>\` + log.innerHTML;
            if (log.children.length > 100) {
                log.removeChild(log.lastChild);
            }
        }
        
        function updateMetric(id, value) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }
        
        eventSource.onopen = () => {
            status.textContent = 'Connected';
            status.className = 'status connected';
            addLog('Connected to Sentinel streaming server');
        };
        
        eventSource.onerror = (error) => {
            status.textContent = 'Disconnected';
            status.className = 'status disconnected';
            addLog('Connection error: ' + error);
        };
        
        eventSource.addEventListener('metrics', (event) => {
            const data = JSON.parse(event.data);
            updateMetric('heapUsed', (data.heapUsed / 1024 / 1024).toFixed(2));
            updateMetric('heapTotal', (data.heapTotal / 1024 / 1024).toFixed(2));
            updateMetric('rss', (data.rss / 1024 / 1024).toFixed(2));
            updateMetric('external', (data.external / 1024 / 1024).toFixed(2));
            addLog(\`Memory update: Heap \${((data.heapUsed / data.heapTotal) * 100).toFixed(1)}% used\`);
        });
        
        eventSource.addEventListener('leak', (event) => {
            const data = JSON.parse(event.data);
            const alert = document.createElement('div');
            alert.className = 'alert';
            alert.innerHTML = \`
                <strong>🚨 MEMORY LEAK DETECTED!</strong><br>
                Type: \${data.type}<br>
                Probability: \${(data.probability * 100).toFixed(1)}%<br>
                Growth Rate: \${data.metrics.growthRate ? (data.metrics.growthRate * 100).toFixed(1) + '%/min' : 'N/A'}
            \`;
            alerts.insertBefore(alert, alerts.firstChild);
            addLog(\`LEAK: \${data.type} - \${(data.probability * 100).toFixed(1)}% probability\`);
            
            // Remove old alerts
            while (alerts.children.length > 3) {
                alerts.removeChild(alerts.lastChild);
            }
        });
        
        eventSource.addEventListener('warning', (event) => {
            const data = JSON.parse(event.data);
            const warning = document.createElement('div');
            warning.className = 'warning';
            warning.innerHTML = \`
                <strong>⚠️ WARNING</strong><br>
                \${data.message}
            \`;
            alerts.insertBefore(warning, alerts.firstChild);
            addLog(\`WARNING: \${data.message}\`);
            
            // Remove old alerts
            while (alerts.children.length > 3) {
                alerts.removeChild(alerts.lastChild);
            }
        });
    </script>
</body>
</html>
`;

// Serve the client page
const http = require('http');
const clientServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(clientHTML);
});

clientServer.listen(3103, () => {
  console.log('📱 Client UI available at: http://localhost:3103');
});

// Simulate memory patterns
let dataStore = [];
let leakyArray = [];
let counter = 0;

setInterval(() => {
  counter++;
  
  // Normal allocation (cleaned up)
  dataStore = new Array(1000).fill(`data-${counter}`);
  
  // Simulate memory leak (never cleaned)
  if (counter % 5 === 0) {
    leakyArray.push(new Array(10000).fill(`leak-${counter}`));
    console.log(`\n💉 Injected memory leak #${leakyArray.length}`);
  }
  
  // Simulate spike
  if (counter % 20 === 0) {
    const spike = new Array(100000).fill('spike');
    console.log('\n📈 Created memory spike');
    // This will be garbage collected
  }
  
  // Force GC occasionally
  if (counter % 30 === 0 && global.gc) {
    global.gc();
    console.log('\n♻️  Forced garbage collection');
  }
}, 1000);

// Show streaming info
console.log('\n📖 How to test streaming:');
console.log('1. Open http://localhost:3103 in your browser to see the live dashboard');
console.log('2. Use curl to connect directly:');
console.log('   curl http://localhost:3101/stream');
console.log('3. Filter specific channels:');
console.log('   curl "http://localhost:3101/stream?channels=leak,warning"');
console.log('4. Check current metrics:');
console.log('   curl http://localhost:3101/metrics\n');

// Listen for specific events
sentinel.on('leak', (leak) => {
  console.log(`\n🚨 Leak detected: ${leak.type} (${(leak.probability * 100).toFixed(1)}% probability)`);
});

sentinel.on('warning', (warning) => {
  console.log(`\n⚠️  Warning: ${warning.message}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down streaming demo...');
  sentinel.stop();
  clientServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down streaming demo...');
  sentinel.stop();
  clientServer.close();
  process.exit(0);
});
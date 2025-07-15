'use strict';

const http = require('http');
const { URL } = require('url');
// const path = require('path');
// const fs = require('fs');

/**
 * Sentinel Web Dashboard
 * Real-time web interface for monitoring memory usage
 */
class SentinelDashboard {
  constructor(sentinel, options = {}) {
    this.sentinel = sentinel;
    this.config = {
      port: options.port || 3001,
      host: options.host || 'localhost',
      auth: options.auth || null, // Example: { username: 'admin', password: process.env.DASHBOARD_PASSWORD }
      cors: options.cors !== false,
      updateInterval: options.updateInterval || 5000
    };
    
    this.server = null;
    this.clients = new Set();
    this.isRunning = false;
    this.updateTimer = null;
  }
  
  async start() {
    if (this.isRunning) {
      throw new Error('Dashboard is already running');
    }
    
    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (err) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = true;
          this._startPeriodicUpdates();
          resolve({
            port: this.config.port,
            host: this.config.host,
            url: `http://${this.config.host}:${this.config.port}`
          });
        }
      });
    });
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Close all client connections
    this.clients.clear();
    
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Handle CORS
    if (this.config.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
    }
    
    // Simple auth check
    if (this.config.auth && !this._checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    
    // Route handling
    switch (url.pathname) {
    case '/':
      this._serveHomePage(res);
      break;
    case '/api/status':
      this._serveStatus(res);
      break;
    case '/api/metrics':
      this._serveMetrics(res);
      break;
    case '/api/leaks':
      this._serveLeaks(res);
      break;
    case '/api/health':
      this._serveHealth(res);
      break;
    case '/stream':
      this._handleSSE(req, res);
      break;
    default:
      this._serve404(res);
    }
  }
  
  _checkAuth(req) {
    if (!this.config.auth) return true;
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }
    
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    return username === this.config.auth.username && 
           password === this.config.auth.password;
  }
  
  _serveHomePage(res) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sentinel Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: #1a1a1a; 
            color: #fff; 
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #4CAF50; font-size: 2.5em; margin-bottom: 10px; }
        .header p { color: #ccc; font-size: 1.1em; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: #2d2d2d; 
            border-radius: 8px; 
            padding: 20px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .card h3 { color: #4CAF50; margin-bottom: 15px; }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            margin-bottom: 10px;
            padding: 10px;
            background: #333;
            border-radius: 4px;
        }
        .metric-value { font-weight: bold; color: #4CAF50; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 0.9em; }
        .status.running { background: #4CAF50; color: white; }
        .status.stopped { background: #f44336; color: white; }
        .alert { 
            background: #ff5722; 
            color: white; 
            padding: 10px; 
            border-radius: 4px; 
            margin-bottom: 10px;
        }
        .chart-container { height: 200px; background: #333; border-radius: 4px; margin-top: 15px; }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #333;
            border-radius: 10px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Sentinel Dashboard</h1>
            <p>Real-time Memory Monitoring & Leak Detection</p>
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>System Status</h3>
                <div class="metric">
                    <span>Monitoring Status</span>
                    <span class="status" id="monitoring-status">Loading...</span>
                </div>
                <div class="metric">
                    <span>Uptime</span>
                    <span class="metric-value" id="uptime">Loading...</span>
                </div>
                <div class="metric">
                    <span>Memory Used</span>
                    <span class="metric-value" id="memory-used">Loading...</span>
                </div>
                <div class="metric">
                    <span>Heap Usage</span>
                    <div style="flex: 1; margin-left: 10px;">
                        <div class="progress-bar">
                            <div class="progress-fill" id="heap-progress" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h3>Memory Metrics</h3>
                <div class="metric">
                    <span>Heap Total</span>
                    <span class="metric-value" id="heap-total">Loading...</span>
                </div>
                <div class="metric">
                    <span>Heap Used</span>
                    <span class="metric-value" id="heap-used">Loading...</span>
                </div>
                <div class="metric">
                    <span>External Memory</span>
                    <span class="metric-value" id="external-memory">Loading...</span>
                </div>
                <div class="metric">
                    <span>RSS</span>
                    <span class="metric-value" id="rss">Loading...</span>
                </div>
            </div>
            
            <div class="card">
                <h3>Leak Detection</h3>
                <div class="metric">
                    <span>Total Leaks Detected</span>
                    <span class="metric-value" id="total-leaks">Loading...</span>
                </div>
                <div class="metric">
                    <span>Detection Sensitivity</span>
                    <span class="metric-value" id="sensitivity">Loading...</span>
                </div>
                <div id="leak-alerts"></div>
            </div>
            
            <div class="card">
                <h3>Performance</h3>
                <div class="metric">
                    <span>GC Events</span>
                    <span class="metric-value" id="gc-events">Loading...</span>
                </div>
                <div class="metric">
                    <span>Monitoring Interval</span>
                    <span class="metric-value" id="monitor-interval">Loading...</span>
                </div>
                <div class="metric">
                    <span>Error Count</span>
                    <span class="metric-value" id="error-count">Loading...</span>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Format bytes to human readable format
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Format duration
        function formatDuration(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
            if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
            return seconds + 's';
        }
        
        // Update dashboard
        function updateDashboard() {
            Promise.all([
                fetch('/api/status').then(r => r.json()),
                fetch('/api/metrics').then(r => r.json()),
                fetch('/api/leaks').then(r => r.json()),
                fetch('/api/health').then(r => r.json())
            ]).then(([status, metrics, leaks, health]) => {
                // Update status
                const statusEl = document.getElementById('monitoring-status');
                statusEl.textContent = status.isRunning ? 'Running' : 'Stopped';
                statusEl.className = 'status ' + (status.isRunning ? 'running' : 'stopped');
                
                // Update metrics
                if (metrics.memory) {
                    document.getElementById('uptime').textContent = formatDuration(health.uptime || 0);
                    document.getElementById('memory-used').textContent = formatBytes(metrics.memory.heapUsed);
                    document.getElementById('heap-total').textContent = formatBytes(metrics.memory.heapTotal);
                    document.getElementById('heap-used').textContent = formatBytes(metrics.memory.heapUsed);
                    document.getElementById('external-memory').textContent = formatBytes(metrics.memory.external);
                    document.getElementById('rss').textContent = formatBytes(metrics.memory.rss);
                    
                    // Update progress bar
                    const heapPercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
                    document.getElementById('heap-progress').style.width = heapPercent + '%';
                }
                
                // Update leak detection
                document.getElementById('total-leaks').textContent = leaks.length;
                document.getElementById('sensitivity').textContent = status.sensitivity || 'medium';
                
                // Update leak alerts
                const alertsContainer = document.getElementById('leak-alerts');
                alertsContainer.textContent = ''; // Clear existing content safely
                leaks.slice(0, 3).forEach(leak => {
                    const alert = document.createElement('div');
                    alert.className = 'alert';
                    
                    const title = document.createElement('strong');
                    title.textContent = 'Leak Detected';
                    alert.appendChild(title);
                    
                    alert.appendChild(document.createElement('br'));
                    
                    const probability = document.createElement('span');
                    probability.textContent = \`Probability: \${Math.round(leak.probability * 100)}%\`;
                    alert.appendChild(probability);
                    
                    alert.appendChild(document.createElement('br'));
                    
                    const timestamp = document.createElement('small');
                    timestamp.textContent = new Date(leak.timestamp).toLocaleTimeString();
                    alert.appendChild(timestamp);
                    
                    alertsContainer.appendChild(alert);
                });
                
                // Update performance
                document.getElementById('gc-events').textContent = metrics.gc ? metrics.gc.length : '0';
                document.getElementById('monitor-interval').textContent = status.interval ? (status.interval/1000) + 's' : 'N/A';
                document.getElementById('error-count').textContent = health.errorStats ? Object.values(health.errorStats).reduce((a,b) => a+b, 0) : '0';
                
            }).catch(err => {
                console.error('Dashboard update failed:', err);
            });
        }
        
        // Start updates
        updateDashboard();
        setInterval(updateDashboard, 5000);
        
        // Setup SSE for real-time updates
        const eventSource = new EventSource('/stream');
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log('Real-time update:', data);
            updateDashboard();
        };
    </script>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
  
  _serveStatus(res) {
    try {
      const status = {
        isRunning: this.sentinel.isRunning,
        uptime: Date.now() - (this.sentinel._startupTime || Date.now()),
        interval: this.sentinel.config.monitoring?.interval,
        sensitivity: this.sentinel.config.detection?.sensitivity,
        timestamp: Date.now()
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (error) {
      this._serveError(res, error);
    }
  }
  
  _serveMetrics(res) {
    try {
      const metrics = this.sentinel.getMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics));
    } catch (error) {
      this._serveError(res, error);
    }
  }
  
  _serveLeaks(res) {
    try {
      const leaks = this.sentinel.getLeaks();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(leaks));
    } catch (error) {
      this._serveError(res, error);
    }
  }
  
  _serveHealth(res) {
    try {
      const health = this.sentinel.getHealth();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } catch (error) {
      this._serveError(res, error);
    }
  }
  
  _handleSSE(req, res) {
    // Setup SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // Add client
    this.clients.add(res);
    
    // Send initial data
    this._sendSSEData(res, { type: 'connected', timestamp: Date.now() });
    
    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(res);
    });
  }
  
  _sendSSEData(res, data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }
  
  _startPeriodicUpdates() {
    this.updateTimer = setInterval(() => {
      try {
        const metrics = this.sentinel.getMetrics();
        const data = {
          type: 'metrics',
          data: metrics,
          timestamp: Date.now()
        };
        
        // Send to all connected clients
        for (const client of this.clients) {
          this._sendSSEData(client, data);
        }
      } catch (error) {
        console.error('Dashboard update error:', error);
      }
    }, this.config.updateInterval);
  }
  
  _serveError(res, error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal Server Error',
      message: error.message
    }));
  }
  
  _serve404(res) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}

module.exports = SentinelDashboard;
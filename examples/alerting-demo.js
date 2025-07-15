#!/usr/bin/env node
'use strict';

/**
 * Sentinel Alerting Demo
 * 
 * This example demonstrates the advanced alerting system with multiple
 * notification channels, alert levels, and intelligent filtering.
 */

const Sentinel = require('../index');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create Sentinel with alerting configuration
const sentinel = new Sentinel({
  monitoring: {
    interval: 5000, // Check every 5 seconds
    detailed: true
  },
  alerting: {
    enabled: true,
    channels: {
      console: {
        type: 'console',
        minLevel: 'info'
      },
      criticalWebhook: {
        type: 'webhook',
        url: 'http://localhost:6002/webhook',
        minLevel: 'error',
        filters: {
          categories: ['memory', 'leak']
        }
      },
      logFile: {
        type: 'file',
        path: './alerts.log',
        minLevel: 'warning'
      }
    },
    throttling: {
      enabled: true,
      windowMs: 60000,
      maxAlertsPerWindow: 5
    },
    escalation: {
      enabled: true,
      timeouts: {
        warning: 30000,  // Escalate after 30s
        error: 15000     // Escalate after 15s
      }
    },
    smartFiltering: {
      enabled: true,
      duplicateWindow: 300000
    }
  },
  threshold: {
    heap: 0.7,    // Alert at 70% heap usage
    growth: 0.05  // Alert at 5% growth rate
  }
});

// Create webhook server to receive alerts
const webhookServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const alert = JSON.parse(body);
      console.log('\n📨 Webhook received:');
      console.log(`   Level: ${alert.alert.level}`);
      console.log(`   Title: ${alert.alert.title}`);
      console.log(`   Message: ${alert.alert.message}`);
      console.log(`   Severity: ${alert.alert.severity}`);
      res.writeHead(200);
      res.end('OK');
    });
  } else if (req.url === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashboardHTML);
  } else if (req.url === '/alerts') {
    const alerts = sentinel.getActiveAlerts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(alerts));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Dashboard HTML
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Sentinel Alert Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-label {
            color: #666;
            font-size: 14px;
        }
        .alerts {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .alert-item {
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid;
        }
        .alert-info {
            border-color: #4a9eff;
            background: #e8f4ff;
        }
        .alert-warning {
            border-color: #ff9800;
            background: #fff3e0;
        }
        .alert-error {
            border-color: #f44336;
            background: #ffebee;
        }
        .alert-critical {
            border-color: #9c27b0;
            background: #f3e5f5;
        }
        .alert-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .alert-meta {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        .actions {
            margin: 20px 0;
        }
        button {
            padding: 10px 20px;
            margin: 0 5px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background: #4a9eff;
            color: white;
        }
        .btn-danger {
            background: #f44336;
            color: white;
        }
        .btn-warning {
            background: #ff9800;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚨 Sentinel Alert Dashboard</h1>
        
        <div class="stats" id="stats">
            <div class="stat-card">
                <div class="stat-label">Active Alerts</div>
                <div class="stat-value" id="activeAlerts">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Alerts</div>
                <div class="stat-value" id="totalAlerts">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Resolved</div>
                <div class="stat-value" id="resolved">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Suppressed</div>
                <div class="stat-value" id="suppressed">0</div>
            </div>
        </div>
        
        <div class="actions">
            <button class="btn-primary" onclick="triggerMemorySpike()">Trigger Memory Spike</button>
            <button class="btn-warning" onclick="triggerGrowth()">Trigger Gradual Growth</button>
            <button class="btn-danger" onclick="triggerLeak()">Trigger Memory Leak</button>
        </div>
        
        <div class="alerts">
            <h2>Active Alerts</h2>
            <div id="alertList"></div>
        </div>
    </div>

    <script>
        function updateDashboard() {
            fetch('/alerts')
                .then(res => res.json())
                .then(alerts => {
                    const alertList = document.getElementById('alertList');
                    alertList.innerHTML = '';
                    
                    if (alerts.length === 0) {
                        alertList.innerHTML = '<p>No active alerts</p>';
                    } else {
                        alerts.forEach(alert => {
                            const alertEl = document.createElement('div');
                            alertEl.className = 'alert-item alert-' + alert.level;
                            alertEl.innerHTML = \`
                                <div class="alert-title">\${alert.title}</div>
                                <div>\${alert.enhancedMessage || alert.message}</div>
                                <div class="alert-meta">
                                    Level: \${alert.level} | 
                                    Severity: \${alert.severity} | 
                                    Created: \${new Date(alert.createdAt).toLocaleTimeString()}
                                    \${alert.escalated ? '| ESCALATED' : ''}
                                </div>
                            \`;
                            alertList.appendChild(alertEl);
                        });
                    }
                });
        }
        
        function triggerMemorySpike() {
            console.log('Triggering memory spike...');
            // This would normally make an API call to trigger the spike
        }
        
        function triggerGrowth() {
            console.log('Triggering gradual growth...');
            // This would normally make an API call
        }
        
        function triggerLeak() {
            console.log('Triggering memory leak...');
            // This would normally make an API call
        }
        
        // Update every 2 seconds
        setInterval(updateDashboard, 2000);
        updateDashboard();
    </script>
</body>
</html>
`;

webhookServer.listen(6002, () => {
  console.log('🌐 Webhook server listening on port 6002');
  console.log('📊 Alert dashboard available at: http://localhost:6002/dashboard');
});

// Start monitoring
sentinel.start();

// Listen for alert events
sentinel.on('alert-created', (alert) => {
  console.log(`\n✨ New alert created: ${alert.title}`);
});

sentinel.on('alert-escalated', (alert, oldLevel) => {
  console.log(`\n⬆️  Alert escalated from ${oldLevel} to ${alert.level}: ${alert.title}`);
});

sentinel.on('alert-resolved', (alert) => {
  console.log(`\n✅ Alert resolved: ${alert.title}`);
});

sentinel.on('alert-suppressed', (alert) => {
  console.log(`\n🔇 Alert suppressed: ${alert.title || alert.alertId}`);
});

// Demo: Create different types of alerts
let memoryHog = [];
let gradualLeak = [];

console.log('\n🚀 Sentinel Alerting Demo Started!');
console.log('\n📖 Alert Channels:');
console.log('   - Console: All alerts');
console.log('   - Webhook: Critical alerts only (http://localhost:6002/webhook)');
console.log('   - File: Warnings and above (./alerts.log)');
console.log('\n🎯 Triggering various alert scenarios...\n');

// Scenario 1: Info alert (console only)
setTimeout(() => {
  sentinel.createAlert({
    level: 'info',
    title: 'System Started',
    message: 'Sentinel monitoring system has been initialized',
    category: 'system'
  });
}, 2000);

// Scenario 2: Warning alert (console + file)
setTimeout(() => {
  sentinel.createAlert({
    level: 'warning',
    title: 'Memory Usage Rising',
    message: 'Memory usage is approaching threshold',
    category: 'memory',
    metrics: {
      heapUsed: 500 * 1024 * 1024,
      heapTotal: 1000 * 1024 * 1024,
      growthRate: 0.03
    }
  });
}, 5000);

// Scenario 3: Error alert (all channels)
setTimeout(() => {
  sentinel.createAlert({
    level: 'error',
    title: 'High Memory Pressure',
    message: 'Memory usage exceeded safe threshold',
    category: 'memory',
    metrics: {
      heapUsed: 800 * 1024 * 1024,
      heapTotal: 1000 * 1024 * 1024,
      growthRate: 0.08,
      gcFrequency: 15
    },
    recommendations: [
      'Investigate recent memory allocations',
      'Check for potential memory leaks',
      'Consider increasing heap size'
    ]
  });
}, 8000);

// Scenario 4: Simulate memory growth
setInterval(() => {
  // Gradual memory growth
  gradualLeak.push(new Array(10000).fill('gradual-leak-data'));
  
  // Occasional spikes
  if (Math.random() < 0.1) {
    memoryHog = new Array(1000000).fill('spike-data');
    setTimeout(() => {
      memoryHog = []; // Clean up spike
    }, 5000);
  }
}, 3000);

// Scenario 5: Test alert escalation
setTimeout(() => {
  const alert = sentinel.createAlert({
    level: 'warning',
    title: 'Unresolved Memory Issue',
    message: 'This alert will escalate if not resolved',
    category: 'memory'
  });
  
  console.log(`\n⏰ Alert created that will escalate in 30 seconds if not resolved`);
  console.log(`   To resolve it, use: sentinel.resolveAlert('${alert.id}')`);
}, 15000);

// Scenario 6: Test throttling
setTimeout(() => {
  console.log('\n🔥 Testing throttling - creating multiple alerts...');
  for (let i = 0; i < 10; i++) {
    sentinel.createAlert({
      level: 'warning',
      title: `Throttle Test ${i}`,
      message: `This is alert number ${i}`,
      category: 'test'
    });
  }
}, 20000);

// Show alert statistics periodically
setInterval(() => {
  const stats = sentinel.getAlertStats();
  console.log('\n📈 Alert Statistics:');
  console.log(`   Active: ${stats.activeAlerts}`);
  console.log(`   Total: ${stats.totalAlerts}`);
  console.log(`   Resolved: ${stats.resolved}`);
  console.log(`   Suppressed: ${stats.suppressed}`);
  console.log(`   Escalations: ${stats.activeEscalations}`);
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down alerting demo...');
  sentinel.stop();
  webhookServer.close();
  
  // Clean up log file
  try {
    fs.unlinkSync('./alerts.log');
  } catch (e) {
    // Ignore
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down alerting demo...');
  sentinel.stop();
  webhookServer.close();
  process.exit(0);
});
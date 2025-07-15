#!/usr/bin/env node
'use strict';

/**
 * Express.js Monitoring Example
 * 
 * This example demonstrates how to integrate Sentinel with Express.js
 * applications for automatic memory monitoring and leak detection.
 */

const express = require('express');
const { ExpressAdapter } = require('../packages/adapters');
const Sentinel = require('../index');

// Create Sentinel instance for Express monitoring
const sentinel = new Sentinel({
  monitoring: {
    interval: 15000, // Check every 15 seconds
  },
  threshold: {
    heap: 0.8,
    growth: 0.1
  }
});

// Listen for memory leaks
sentinel.on('leak', (leak) => {
  console.log('\n🚨 MEMORY LEAK DETECTED IN EXPRESS APP!');
  console.log(`Route causing issues might be in the recent requests.`);
  console.log(`Probability: ${Math.round(leak.probability * 100)}%`);
  console.log(`Heap Usage: ${(leak.metrics.heapUsed / 1024 / 1024).toFixed(2)} MB\n`);
});

// Create Express adapter with custom options
const adapter = new ExpressAdapter({
  sentinel: sentinel,
  trackRoutes: true,
  trackMiddleware: true,
  excludePaths: ['/health', '/metrics', '/favicon.ico'],
});

// Create Express app
const app = express();

// Add body parser middleware
app.use(express.json());

// Wrap app with Sentinel monitoring
adapter.wrapApp(app);

// Simulate some data storage
let users = [];
let posts = [];
let sessions = new Map();

// Health check endpoint (excluded from monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Metrics endpoint to show monitoring data
app.get('/metrics', (req, res) => {
  const metrics = sentinel.getMetrics();
  const routeMetrics = adapter.getRouteMetrics();
  
  res.json({
    memory: {
      current: metrics.heap[metrics.heap.length - 1],
      summary: metrics.summary
    },
    routes: routeMetrics,
    leaks: sentinel.getLeaks().length
  });
});

// Route that demonstrates normal memory usage
app.get('/api/users', (req, res) => {
  // Simulate database query
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  
  const result = users.slice(offset, offset + limit);
  res.json({
    users: result,
    total: users.length,
    offset,
    limit
  });
});

// Route that creates users (memory growth)
app.post('/api/users', (req, res) => {
  const user = {
    id: users.length + 1,
    name: req.body.name || `User${users.length + 1}`,
    email: req.body.email || `user${users.length + 1}@example.com`,
    created: new Date(),
    // Simulate some user data
    profile: {
      preferences: new Array(100).fill('pref'),
      history: new Array(50).fill({ action: 'login', timestamp: new Date() })
    }
  };
  
  users.push(user);
  res.status(201).json(user);
});

// Route that demonstrates memory leak (growing sessions)
app.post('/api/sessions', (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random()}`;
  
  // Simulate session data that grows over time
  const sessionData = {
    id: sessionId,
    user: req.body.userId || 'anonymous',
    created: new Date(),
    data: new Array(1000).fill('session-data'), // Simulated large session data
    // This accumulates and is never cleaned up - potential memory leak!
  };
  
  sessions.set(sessionId, sessionData);
  
  res.json({ sessionId, created: sessionData.created });
});

// Route that demonstrates slow memory allocation
app.get('/api/reports/:type', (req, res) => {
  const type = req.params.type;
  
  // Simulate report generation with varying memory usage
  let reportData;
  
  switch (type) {
    case 'small':
      reportData = new Array(1000).fill('data');
      break;
    case 'medium':
      reportData = new Array(10000).fill('data');
      break;
    case 'large':
      // This creates a large report that might trigger memory warnings
      reportData = new Array(100000).fill({
        id: Math.random(),
        content: 'Lorem ipsum dolor sit amet',
        metadata: new Array(100).fill('meta')
      });
      break;
    default:
      reportData = ['No data'];
  }
  
  res.json({
    type,
    reportSize: reportData.length,
    generated: new Date(),
    data: reportData.slice(0, 10) // Only send first 10 items
  });
});

// Route that simulates event listener leaks
app.post('/api/subscribe/:topic', (req, res) => {
  const topic = req.params.topic;
  const EventEmitter = require('events');
  
  // Create new emitter for each subscription (potential leak)
  const emitter = new EventEmitter();
  
  // Add listeners that hold references to large data
  emitter.on('message', (data) => {
    // This function closes over large data
    const largeData = new Array(5000).fill(`${topic}-data`);
    console.log(`Message for ${topic}:`, data, largeData.length);
  });
  
  // Store emitter (simulating subscription storage)
  if (!global.subscriptions) {
    global.subscriptions = [];
  }
  global.subscriptions.push({ topic, emitter, created: new Date() });
  
  res.json({
    topic,
    subscribed: true,
    totalSubscriptions: global.subscriptions.length
  });
});

// Route to trigger cleanup (simulate proper memory management)
app.post('/api/cleanup', (req, res) => {
  let cleaned = 0;
  
  // Clean old sessions
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions) {
    if (session.created < oneHourAgo) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  
  // Clean old subscriptions
  if (global.subscriptions) {
    const oldCount = global.subscriptions.length;
    global.subscriptions = global.subscriptions.filter(sub => {
      if (sub.created < oneHourAgo) {
        sub.emitter.removeAllListeners();
        return false;
      }
      return true;
    });
    cleaned += oldCount - global.subscriptions.length;
  }
  
  // Force garbage collection if available
  const gcTriggered = sentinel.forceGC();
  
  res.json({
    cleaned,
    sessionsRemaining: sessions.size,
    subscriptionsRemaining: global.subscriptions?.length || 0,
    gcTriggered
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3100;
const server = app.listen(PORT, () => {
  console.log(`🚀 Express server with Sentinel monitoring running on port ${PORT}`);
  console.log(`📊 Metrics available at: http://localhost:${PORT}/metrics`);
  console.log(`🏥 Health check at: http://localhost:${PORT}/health`);
  console.log('\n📖 Try these commands to test memory monitoring:');
  console.log(`curl http://localhost:${PORT}/api/users`);
  console.log(`curl -X POST http://localhost:${PORT}/api/users -H "Content-Type: application/json" -d '{"name":"John","email":"john@example.com"}'`);
  console.log(`curl -X POST http://localhost:${PORT}/api/sessions -H "Content-Type: application/json" -d '{"userId":"123"}'`);
  console.log(`curl http://localhost:${PORT}/api/reports/large`);
  console.log(`curl -X POST http://localhost:${PORT}/api/subscribe/notifications`);
  console.log(`curl -X POST http://localhost:${PORT}/api/cleanup`);
  console.log('');
});

// Simulate some background activity that might cause memory leaks
function simulateBackgroundActivity() {
  // Create some users
  for (let i = 0; i < 10; i++) {
    users.push({
      id: i + 1,
      name: `User${i + 1}`,
      email: `user${i + 1}@example.com`,
      profile: { data: new Array(50).fill('background-data') }
    });
  }
  
  // Create some sessions periodically
  setInterval(() => {
    if (sessions.size < 100) { // Limit to prevent too much memory usage
      const sessionData = {
        id: `bg_session_${Date.now()}`,
        data: new Array(500).fill('background-session'),
        created: new Date()
      };
      sessions.set(sessionData.id, sessionData);
    }
  }, 5000);
  
  // Periodically show route metrics
  setInterval(() => {
    const routeMetrics = adapter.getRouteMetrics();
    if (routeMetrics.length > 0) {
      console.log('\n📈 Route Memory Usage:');
      routeMetrics.slice(0, 5).forEach(route => {
        console.log(`  ${route.route}: ${route.requests} requests, avg ${(route.avgMemoryDelta / 1024).toFixed(2)}KB, ${route.errorRate.toFixed(1)}% errors`);
      });
    }
  }, 30000);
}

// Start background activity after a delay
setTimeout(simulateBackgroundActivity, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down Express server...');
  server.close(() => {
    sentinel.stop();
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down Express server...');
  server.close(() => {
    sentinel.stop();
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  sentinel.stop();
  process.exit(1);
});

// Export for testing
module.exports = { app, adapter, sentinel };
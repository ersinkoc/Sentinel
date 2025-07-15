'use strict';

const EventEmitter = require('events');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

/**
 * Real-time memory streaming service
 * Provides WebSocket-like functionality using Server-Sent Events
 */
class MemoryStreamer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      port: config.port !== undefined ? config.port : 3001,
      host: config.host || 'localhost',
      cors: config.cors !== false,
      authentication: config.authentication || null,
      compression: config.compression !== false,
      maxConnections: config.maxConnections || 100,
      bufferSize: config.bufferSize || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000
    };
    
    this.server = null;
    this.connections = new Map();
    this.dataBuffer = [];
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesTransmitted: 0,
      bytesTransmitted: 0
    };
    
    this.channels = new Map(); // Channel-based broadcasting
    this.filters = new Map(); // Client-specific data filters
    
    this._setupServer();
  }
  
  _setupServer() {
    this.server = http.createServer((req, res) => {
      this._handleHttpRequest(req, res);
    });
    
    this.server.on('error', (error) => {
      this.emit('error', error);
    });
  }
  
  _handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Handle CORS
    if (this.config.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Route handling
    switch (url.pathname) {
    case '/stream':
      this._handleStreamConnection(req, res, url);
      break;
    case '/stats':
      this._handleStatsRequest(req, res);
      break;
    case '/channels':
      this._handleChannelsRequest(req, res);
      break;
    default:
      res.writeHead(404);
      res.end('Not Found');
    }
  }
  
  _handleStreamConnection(req, res, url) {
    // Check authentication
    if (this.config.authentication && !this._authenticate(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    
    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      res.writeHead(503);
      res.end('Too Many Connections');
      return;
    }
    
    // Setup Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    
    const clientId = crypto.randomUUID();
    const searchParams = url.searchParams;
    
    const client = {
      id: clientId,
      response: res,
      channels: searchParams.get('channels')?.split(',') || ['default'],
      filters: this._parseFilters(searchParams.get('filters')),
      lastHeartbeat: Date.now(),
      connected: Date.now()
    };
    
    this.connections.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.activeConnections++;
    
    // Send initial connection message
    this._sendToClient(client, {
      type: 'connected',
      clientId: clientId,
      timestamp: Date.now(),
      channels: client.channels
    });
    
    // Send buffered data
    this._sendBufferedData(client);
    
    // Handle client disconnect
    req.on('close', () => {
      this._handleClientDisconnect(clientId);
    });
    
    req.on('error', () => {
      this._handleClientDisconnect(clientId);
    });
    
    this.emit('client-connected', client);
  }
  
  _authenticate(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    
    const token = authHeader.replace('Bearer ', '');
    return this.config.authentication(token);
  }
  
  _parseFilters(filtersStr) {
    if (!filtersStr) return {};
    
    try {
      return JSON.parse(filtersStr);
    } catch {
      return {};
    }
  }
  
  _handleStatsRequest(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...this.stats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeChannels: Array.from(this.channels.keys()),
      bufferSize: this.dataBuffer.length
    }));
  }
  
  _handleChannelsRequest(req, res) {
    const channelStats = {};
    for (const [channel, subscribers] of this.channels.entries()) {
      channelStats[channel] = {
        subscribers: subscribers.length,
        lastMessage: subscribers.lastMessage || null
      };
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(channelStats));
  }
  
  _sendToClient(client, data) {
    if (!client.response || client.response.destroyed) {
      return false;
    }
    
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      client.response.write(message);
      
      this.stats.messagesTransmitted++;
      this.stats.bytesTransmitted += Buffer.byteLength(message);
      
      return true;
    } catch {
      this._handleClientDisconnect(client.id);
      return false;
    }
  }
  
  _sendBufferedData(client) {
    const relevantData = this.dataBuffer.filter(item => 
      this._shouldSendToClient(client, item)
    );
    
    for (const data of relevantData.slice(-50)) { // Send last 50 messages
      this._sendToClient(client, data);
    }
  }
  
  _shouldSendToClient(client, data) {
    // Check channel subscription
    if (!client.channels.includes(data.channel || 'default')) {
      return false;
    }
    
    // Apply filters
    if (client.filters.minSeverity && data.severity < client.filters.minSeverity) {
      return false;
    }
    
    if (client.filters.types && !client.filters.types.includes(data.type)) {
      return false;
    }
    
    if (client.filters.tags) {
      const dataTags = data.tags || [];
      const hasRequiredTag = client.filters.tags.some(tag => dataTags.includes(tag));
      if (!hasRequiredTag) return false;
    }
    
    return true;
  }
  
  _handleClientDisconnect(clientId) {
    const client = this.connections.get(clientId);
    if (client) {
      this.connections.delete(clientId);
      this.stats.activeConnections--;
      this.emit('client-disconnected', client);
    }
  }
  
  // Public API methods
  broadcast(data, channel = 'default') {
    const message = {
      ...data,
      channel: channel,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    };
    
    // Add to buffer
    this.dataBuffer.push(message);
    if (this.dataBuffer.length > this.config.bufferSize) {
      this.dataBuffer.shift();
    }
    
    // Send to all relevant clients
    let sentCount = 0;
    for (const client of this.connections.values()) {
      if (this._shouldSendToClient(client, message)) {
        if (this._sendToClient(client, message)) {
          sentCount++;
        }
      }
    }
    
    // Update channel tracking
    if (!this.channels.has(channel)) {
      this.channels.set(channel, []);
    }
    this.channels.get(channel).lastMessage = Date.now();
    
    return sentCount;
  }
  
  broadcastToChannel(channel, data) {
    return this.broadcast(data, channel);
  }
  
  sendToClient(clientId, data) {
    const client = this.connections.get(clientId);
    if (client) {
      return this._sendToClient(client, {
        ...data,
        timestamp: Date.now(),
        id: crypto.randomUUID()
      });
    }
    return false;
  }
  
  getConnectedClients() {
    return Array.from(this.connections.values()).map(client => ({
      id: client.id,
      channels: client.channels,
      connected: client.connected,
      lastHeartbeat: client.lastHeartbeat
    }));
  }
  
  getStats() {
    return { ...this.stats };
  }
  
  start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          // Update port if it was 0 (dynamic allocation)
          if (this.config.port === 0) {
            this.config.port = this.server.address().port;
          }
          this._startHeartbeat();
          this.emit('started', {
            host: this.config.host,
            port: this.config.port
          });
          resolve();
        }
      });
    });
  }
  
  stop() {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
      }
      
      // Close all connections
      for (const client of this.connections.values()) {
        try {
          client.response.end();
        } catch {
          // Ignore errors when closing
        }
      }
      this.connections.clear();
      
      if (this.server) {
        this.server.close(() => {
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const heartbeatData = {
        type: 'heartbeat',
        timestamp: now,
        stats: this.getStats()
      };
      
      // Send heartbeat to all clients
      for (const client of this.connections.values()) {
        client.lastHeartbeat = now;
        this._sendToClient(client, heartbeatData);
      }
      
      this.emit('heartbeat', heartbeatData);
    }, this.config.heartbeatInterval);
  }
}

module.exports = MemoryStreamer;
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const MemoryStreamer = require('../src/streaming');
const http = require('http');
const { URL } = require('url');

describe('MemoryStreamer', () => {
  test('Constructor and configuration', () => {
    const defaultStreamer = new MemoryStreamer();
    assert.ok(defaultStreamer instanceof MemoryStreamer, 'Creates instance with default config');
    assert.strictEqual(defaultStreamer.config.port, 3001, 'Default port is 3001');
    assert.strictEqual(defaultStreamer.config.host, 'localhost', 'Default host is localhost');
    assert.strictEqual(defaultStreamer.config.cors, true, 'CORS enabled by default');
    assert.strictEqual(defaultStreamer.config.compression, true, 'Compression enabled by default');
    assert.strictEqual(defaultStreamer.config.maxConnections, 100, 'Default max connections is 100');
    assert.strictEqual(defaultStreamer.config.bufferSize, 1000, 'Default buffer size is 1000');
    assert.strictEqual(defaultStreamer.config.heartbeatInterval, 30000, 'Default heartbeat is 30 seconds');
    
    const customConfig = {
      port: 4000,
      host: '0.0.0.0',
      cors: false,
      authentication: (token) => token === 'valid-token',
      compression: false,
      maxConnections: 50,
      bufferSize: 500,
      heartbeatInterval: 10000
    };
    
    const customStreamer = new MemoryStreamer(customConfig);
    assert.strictEqual(customStreamer.config.port, 4000, 'Custom port');
    assert.strictEqual(customStreamer.config.host, '0.0.0.0', 'Custom host');
    assert.strictEqual(customStreamer.config.cors, false, 'CORS disabled');
    assert.ok(typeof customStreamer.config.authentication === 'function', 'Authentication function set');
    assert.strictEqual(customStreamer.config.compression, false, 'Compression disabled');
    assert.strictEqual(customStreamer.config.maxConnections, 50, 'Custom max connections');
    
    // Test properties initialization
    assert.ok(customStreamer.server instanceof http.Server, 'HTTP server created');
    assert.ok(customStreamer.connections instanceof Map, 'Connections map initialized');
    assert.ok(Array.isArray(customStreamer.dataBuffer), 'Data buffer initialized');
    assert.ok(customStreamer.channels instanceof Map, 'Channels map initialized');
    assert.ok(customStreamer.filters instanceof Map, 'Filters map initialized');
    
    // Test stats initialization
    assert.strictEqual(customStreamer.stats.totalConnections, 0, 'Total connections starts at 0');
    assert.strictEqual(customStreamer.stats.activeConnections, 0, 'Active connections starts at 0');
    assert.strictEqual(customStreamer.stats.messagesTransmitted, 0, 'Messages transmitted starts at 0');
    assert.strictEqual(customStreamer.stats.bytesTransmitted, 0, 'Bytes transmitted starts at 0');
    
    // Note: MemoryStreamer doesn't have destroy(), but we don't need to clean up
    // since these instances were never started
  });

  test('Start and stop server', async () => {
    const streamer = new MemoryStreamer({ port: 0 }); // Use random port
    
    let startEmitted = false;
    let stopEmitted = false;
    
    streamer.on('started', (info) => {
      startEmitted = info;
    });
    
    streamer.on('stopped', () => {
      stopEmitted = true;
    });
    
    // Start server
    await streamer.start();
    assert.ok(startEmitted, 'Started event emitted');
    assert.strictEqual(startEmitted.host, 'localhost', 'Start event has host');
    assert.ok(startEmitted.port, 'Start event has port');
    assert.ok(streamer.heartbeatTimer, 'Heartbeat timer started');
    
    // Stop server
    await streamer.stop();
    assert.ok(stopEmitted, 'Stopped event emitted');
    assert.ok(!streamer.heartbeatTimer || streamer.heartbeatTimer._destroyed, 'Heartbeat timer cleared');
  });

  test('Server error handling', () => {
    const streamer = new MemoryStreamer({ port: 0 });
    
    let errorEmitted = null;
    streamer.on('error', (error) => {
      errorEmitted = error;
    });
    
    // Emit server error
    const testError = new Error('Test server error');
    streamer.server.emit('error', testError);
    
    assert.strictEqual(errorEmitted, testError, 'Server error propagated');
  });

  test('HTTP request routing', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Test /stats endpoint
    const statsResponse = await makeRequest(`http://localhost:${port}/stats`);
    assert.strictEqual(statsResponse.statusCode, 200, 'Stats endpoint returns 200');
    const stats = JSON.parse(statsResponse.body);
    assert.ok(stats.totalConnections !== undefined, 'Stats has totalConnections');
    assert.ok(stats.uptime !== undefined, 'Stats has uptime');
    assert.ok(stats.memory !== undefined, 'Stats has memory');
    
    // Test /channels endpoint
    const channelsResponse = await makeRequest(`http://localhost:${port}/channels`);
    assert.strictEqual(channelsResponse.statusCode, 200, 'Channels endpoint returns 200');
    const channels = JSON.parse(channelsResponse.body);
    assert.ok(typeof channels === 'object', 'Channels returns object');
    
    // Test 404
    const notFoundResponse = await makeRequest(`http://localhost:${port}/invalid`);
    assert.strictEqual(notFoundResponse.statusCode, 404, 'Invalid endpoint returns 404');
    
    await streamer.stop();
  });

  test('CORS handling', async () => {
    const streamer = new MemoryStreamer({ port: 0, cors: true });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Test OPTIONS request
    const optionsResponse = await makeRequest(`http://localhost:${port}/stream`, {
      method: 'OPTIONS'
    });
    
    assert.strictEqual(optionsResponse.statusCode, 200, 'OPTIONS returns 200');
    assert.strictEqual(optionsResponse.headers['access-control-allow-origin'], '*', 'CORS origin header set');
    assert.ok(optionsResponse.headers['access-control-allow-methods'], 'CORS methods header set');
    assert.ok(optionsResponse.headers['access-control-allow-headers'], 'CORS headers header set');
    
    // Test with CORS disabled
    await streamer.stop();
    
    const noCorsStreamer = new MemoryStreamer({ port: 0, cors: false });
    await noCorsStreamer.start();
    
    const noCorsPort = noCorsStreamer.server.address().port;
    const noCorsResponse = await makeRequest(`http://localhost:${noCorsPort}/stats`);
    
    assert.strictEqual(noCorsResponse.headers['access-control-allow-origin'], undefined, 'No CORS headers when disabled');
    
    await noCorsStreamer.stop();
  });

  test('Stream connection handling', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    
    let clientConnected = null;
    streamer.on('client-connected', (client) => {
      clientConnected = client;
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    // Connect to stream
    const streamResponse = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    assert.strictEqual(streamResponse.statusCode, 200, 'Stream endpoint returns 200');
    assert.strictEqual(streamResponse.headers['content-type'], 'text/event-stream', 'SSE content type');
    assert.strictEqual(streamResponse.headers['cache-control'], 'no-cache', 'No cache header');
    assert.strictEqual(streamResponse.headers['connection'], 'keep-alive', 'Keep-alive header');
    
    // Wait for connection event
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.ok(clientConnected, 'Client connected event emitted');
    assert.ok(clientConnected.id, 'Client has ID');
    assert.ok(clientConnected.channels.includes('default'), 'Client subscribed to default channel');
    assert.ok(clientConnected.lastHeartbeat, 'Client has heartbeat timestamp');
    
    assert.strictEqual(streamer.connections.size, 1, 'Connection added to map');
    assert.strictEqual(streamer.stats.totalConnections, 1, 'Total connections incremented');
    assert.strictEqual(streamer.stats.activeConnections, 1, 'Active connections incremented');
    
    streamResponse.destroy();
    await streamer.stop();
  });

  test('Authentication', async () => {
    const authFunction = (token) => token === 'valid-token';
    const streamer = new MemoryStreamer({ 
      port: 0,
      authentication: authFunction
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    // Test without authentication
    const noAuthResponse = await makeRequest(`http://localhost:${port}/stream`);
    assert.strictEqual(noAuthResponse.statusCode, 401, 'Returns 401 without auth');
    
    // Test with invalid token
    const invalidAuthResponse = await makeRequest(`http://localhost:${port}/stream`, {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    assert.strictEqual(invalidAuthResponse.statusCode, 401, 'Returns 401 with invalid token');
    
    // Test with valid token
    const validAuthResponse = await makeStreamRequest(`http://localhost:${port}/stream`, {
      headers: { 'Authorization': 'Bearer valid-token' }
    });
    assert.strictEqual(validAuthResponse.statusCode, 200, 'Returns 200 with valid token');
    
    validAuthResponse.destroy();
    await streamer.stop();
  });

  test('Connection limit', async () => {
    const streamer = new MemoryStreamer({ 
      port: 0,
      maxConnections: 2
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    // Create max connections
    const conn1 = await makeStreamRequest(`http://localhost:${port}/stream`);
    const conn2 = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    assert.strictEqual(conn1.statusCode, 200, 'First connection successful');
    assert.strictEqual(conn2.statusCode, 200, 'Second connection successful');
    
    // Try to exceed limit
    const conn3 = await makeRequest(`http://localhost:${port}/stream`);
    assert.strictEqual(conn3.statusCode, 503, 'Third connection rejected with 503');
    assert.strictEqual(conn3.body, 'Too Many Connections', 'Correct error message');
    
    conn1.destroy();
    conn2.destroy();
    await streamer.stop();
  });

  test('Client channels and filters', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Connect with channels and filters
    const filters = { minSeverity: 5, types: ['error', 'warning'] };
    const url = `http://localhost:${port}/stream?channels=alerts,metrics&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    
    let client = null;
    streamer.on('client-connected', (c) => { client = c; });
    
    const conn = await makeStreamRequest(url);
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.deepStrictEqual(client.channels, ['alerts', 'metrics'], 'Client channels parsed correctly');
    assert.deepStrictEqual(client.filters, filters, 'Client filters parsed correctly');
    
    // Test invalid filters
    const invalidFiltersUrl = `http://localhost:${port}/stream?filters=invalid-json`;
    const conn2 = await makeStreamRequest(invalidFiltersUrl);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const client2 = Array.from(streamer.connections.values()).find(c => c.response === conn2);
    assert.ok(client2, 'Client 2 connected');
    assert.deepStrictEqual(client2.filters, {}, 'Invalid filters default to empty object');
    
    conn.destroy();
    conn2.destroy();
    await streamer.stop();
  });

  test('Broadcast messages', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    const messages = [];
    
    // Connect client
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    // Collect messages
    conn.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            messages.push(data);
          } catch {
            // Ignore parsing errors
          }
        }
      });
    });
    
    // Wait for initial connection message
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Broadcast a message
    const testData = { type: 'test', value: 42 };
    const sentCount = streamer.broadcast(testData);
    
    assert.strictEqual(sentCount, 1, 'Message sent to 1 client');
    
    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const testMessage = messages.find(m => m.type === 'test');
    assert.ok(testMessage, 'Test message received');
    assert.strictEqual(testMessage.value, 42, 'Message data preserved');
    assert.ok(testMessage.timestamp, 'Message has timestamp');
    assert.ok(testMessage.id, 'Message has ID');
    assert.strictEqual(testMessage.channel, 'default', 'Message has default channel');
    
    // Check buffer
    assert.strictEqual(streamer.dataBuffer.length, 1, 'Message added to buffer');
    
    // Check stats
    assert.ok(streamer.stats.messagesTransmitted > 0, 'Messages transmitted incremented');
    assert.ok(streamer.stats.bytesTransmitted > 0, 'Bytes transmitted incremented');
    
    conn.destroy();
    await streamer.stop();
  });

  test('Channel broadcasting', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Connect clients to different channels
    const client1Messages = [];
    const client2Messages = [];
    
    const conn1 = await makeStreamRequest(`http://localhost:${port}/stream?channels=alerts`);
    const conn2 = await makeStreamRequest(`http://localhost:${port}/stream?channels=metrics`);
    
    conn1.on('data', (chunk) => {
      parseSSEData(chunk, client1Messages);
    });
    
    conn2.on('data', (chunk) => {
      parseSSEData(chunk, client2Messages);
    });
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Broadcast to specific channels
    streamer.broadcastToChannel('alerts', { type: 'alert', message: 'High memory' });
    streamer.broadcastToChannel('metrics', { type: 'metric', value: 100 });
    
    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const alertMessage = client1Messages.find(m => m.type === 'alert');
    const metricMessage = client2Messages.find(m => m.type === 'metric');
    
    assert.ok(alertMessage, 'Alert message received by alerts channel subscriber');
    assert.strictEqual(client1Messages.find(m => m.type === 'metric'), undefined, 'Metric message not received by alerts subscriber');
    
    assert.ok(metricMessage, 'Metric message received by metrics channel subscriber');
    assert.strictEqual(client2Messages.find(m => m.type === 'alert'), undefined, 'Alert message not received by metrics subscriber');
    
    // Check channel tracking
    assert.ok(streamer.channels.has('alerts'), 'Alerts channel tracked');
    assert.ok(streamer.channels.has('metrics'), 'Metrics channel tracked');
    
    conn1.destroy();
    conn2.destroy();
    await streamer.stop();
  });

  test('Message filtering', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    const messages = [];
    
    // Connect with filters
    const filters = {
      minSeverity: 5,
      types: ['error'],
      tags: ['critical']
    };
    
    const conn = await makeStreamRequest(
      `http://localhost:${port}/stream?filters=${encodeURIComponent(JSON.stringify(filters))}`
    );
    
    conn.on('data', (chunk) => {
      parseSSEData(chunk, messages);
    });
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send various messages
    streamer.broadcast({ type: 'info', severity: 3 }); // Should be filtered out
    streamer.broadcast({ type: 'error', severity: 7, tags: ['critical'] }); // Should pass
    streamer.broadcast({ type: 'error', severity: 3, tags: ['critical'] }); // Filtered by severity
    streamer.broadcast({ type: 'warning', severity: 7, tags: ['critical'] }); // Filtered by type
    streamer.broadcast({ type: 'error', severity: 7, tags: ['normal'] }); // Filtered by tags
    
    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const errorMessages = messages.filter(m => m.type === 'error' && m.severity === 7 && m.tags?.includes('critical'));
    assert.strictEqual(errorMessages.length, 1, 'Only matching message received');
    
    conn.destroy();
    await streamer.stop();
  });

  test('Send to specific client', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    const client1Messages = [];
    const client2Messages = [];
    
    let client1Id = null;
    let clientCount = 0;
    
    streamer.on('client-connected', (client) => {
      if (clientCount === 0) {
        client1Id = client.id;
      }
      clientCount++;
    });
    
    const conn1 = await makeStreamRequest(`http://localhost:${port}/stream`);
    const conn2 = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    conn1.on('data', (chunk) => parseSSEData(chunk, client1Messages));
    conn2.on('data', (chunk) => parseSSEData(chunk, client2Messages));
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send to specific client
    const result = streamer.sendToClient(client1Id, { type: 'private', message: 'For client 1 only' });
    assert.ok(result, 'Message sent successfully');
    
    // Try sending to non-existent client
    const invalidResult = streamer.sendToClient('invalid-id', { type: 'test' });
    assert.strictEqual(invalidResult, false, 'Returns false for invalid client');
    
    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const privateMessage = client1Messages.find(m => m.type === 'private');
    assert.ok(privateMessage, 'Private message received by client 1');
    assert.strictEqual(client2Messages.find(m => m.type === 'private'), undefined, 'Private message not received by client 2');
    
    conn1.destroy();
    conn2.destroy();
    await streamer.stop();
  });

  test('Client disconnect handling', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    
    let clientDisconnected = null;
    streamer.on('client-disconnected', (client) => {
      clientDisconnected = client;
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.strictEqual(streamer.stats.activeConnections, 1, 'Active connection count is 1');
    
    // Disconnect
    conn.destroy();
    
    // Wait for disconnect event
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.ok(clientDisconnected, 'Client disconnected event emitted');
    assert.strictEqual(streamer.connections.size, 0, 'Client removed from connections');
    assert.strictEqual(streamer.stats.activeConnections, 0, 'Active connections decremented');
    assert.strictEqual(streamer.stats.totalConnections, 1, 'Total connections unchanged');
    
    await streamer.stop();
  });

  test('Heartbeat functionality', async () => {
    const streamer = new MemoryStreamer({ 
      port: 0,
      heartbeatInterval: 100 // Fast heartbeat for testing
    });
    
    let heartbeatEmitted = null;
    streamer.on('heartbeat', (data) => {
      heartbeatEmitted = data;
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    const messages = [];
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    conn.on('data', (chunk) => parseSSEData(chunk, messages));
    
    // Wait for heartbeat
    await new Promise(resolve => setTimeout(resolve, 200));
    
    assert.ok(heartbeatEmitted, 'Heartbeat event emitted');
    assert.strictEqual(heartbeatEmitted.type, 'heartbeat', 'Heartbeat has correct type');
    assert.ok(heartbeatEmitted.timestamp, 'Heartbeat has timestamp');
    assert.ok(heartbeatEmitted.stats, 'Heartbeat includes stats');
    
    const heartbeatMessage = messages.find(m => m.type === 'heartbeat');
    assert.ok(heartbeatMessage, 'Heartbeat message sent to client');
    
    conn.destroy();
    await streamer.stop();
  });

  test('Buffer management', async () => {
    const streamer = new MemoryStreamer({ 
      port: 0,
      bufferSize: 5
    });
    
    await streamer.start();
    
    // Fill buffer beyond limit
    for (let i = 0; i < 10; i++) {
      streamer.broadcast({ index: i });
    }
    
    assert.strictEqual(streamer.dataBuffer.length, 5, 'Buffer size limited');
    assert.strictEqual(streamer.dataBuffer[0].index, 5, 'Old messages removed');
    assert.strictEqual(streamer.dataBuffer[4].index, 9, 'New messages retained');
    
    await streamer.stop();
  });

  test('Buffered data on connection', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Add messages to buffer before client connects
    for (let i = 0; i < 5; i++) {
      streamer.broadcast({ index: i });
    }
    
    const messages = [];
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    
    conn.on('data', (chunk) => parseSSEData(chunk, messages));
    
    // Wait for buffered messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const bufferedMessages = messages.filter(m => m.index !== undefined);
    assert.ok(bufferedMessages.length > 0, 'Buffered messages sent to new client');
    
    conn.destroy();
    await streamer.stop();
  });

  test('Get connected clients', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Connect multiple clients
    const conn1 = await makeStreamRequest(`http://localhost:${port}/stream?channels=alerts`);
    const conn2 = await makeStreamRequest(`http://localhost:${port}/stream?channels=metrics,alerts`);
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const clients = streamer.getConnectedClients();
    
    assert.strictEqual(clients.length, 2, 'Returns all connected clients');
    
    const client1 = clients.find(c => c.channels.length === 1);
    const client2 = clients.find(c => c.channels.length === 2);
    
    assert.ok(client1, 'Client 1 found');
    assert.deepStrictEqual(client1.channels, ['alerts'], 'Client 1 channels correct');
    assert.ok(client1.id, 'Client 1 has ID');
    assert.ok(client1.connected, 'Client 1 has connected timestamp');
    assert.ok(client1.lastHeartbeat, 'Client 1 has heartbeat timestamp');
    
    assert.ok(client2, 'Client 2 found');
    assert.deepStrictEqual(client2.channels, ['metrics', 'alerts'], 'Client 2 channels correct');
    
    conn1.destroy();
    conn2.destroy();
    await streamer.stop();
  });

  test('Get stats', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    
    // Initial stats
    let stats = streamer.getStats();
    assert.strictEqual(stats.totalConnections, 0, 'Initial total connections is 0');
    assert.strictEqual(stats.activeConnections, 0, 'Initial active connections is 0');
    assert.strictEqual(stats.messagesTransmitted, 0, 'Initial messages transmitted is 0');
    assert.strictEqual(stats.bytesTransmitted, 0, 'Initial bytes transmitted is 0');
    
    // Connect client and send message
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    streamer.broadcast({ test: true });
    await new Promise(resolve => setTimeout(resolve, 50));
    
    stats = streamer.getStats();
    assert.strictEqual(stats.totalConnections, 1, 'Total connections incremented');
    assert.strictEqual(stats.activeConnections, 1, 'Active connections incremented');
    assert.ok(stats.messagesTransmitted > 0, 'Messages transmitted incremented');
    assert.ok(stats.bytesTransmitted > 0, 'Bytes transmitted incremented');
    
    conn.destroy();
    await streamer.stop();
  });

  test('Error handling in send', async () => {
    const streamer = new MemoryStreamer({ port: 0 });
    await streamer.start();
    
    const port = streamer.server.address().port;
    let clientId = null;
    
    streamer.on('client-connected', (client) => {
      clientId = client.id;
    });
    
    const conn = await makeStreamRequest(`http://localhost:${port}/stream`);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Destroy connection but keep client in map
    conn.destroy();
    
    // Try to send to disconnected client
    const client = streamer.connections.get(clientId);
    client.response.destroyed = true; // Mark as destroyed
    
    const result = streamer._sendToClient(client, { test: true });
    assert.strictEqual(result, false, 'Returns false when client response is destroyed');
    
    // Client should be removed
    assert.strictEqual(streamer.connections.has(clientId), false, 'Client removed after send error');
    
    await streamer.stop();
  });

  test('Complex scenario with multiple clients', async () => {
    const streamer = new MemoryStreamer({ 
      port: 0,
      heartbeatInterval: 200
    });
    
    await streamer.start();
    const port = streamer.server.address().port;
    
    const client1Messages = [];
    const client2Messages = [];
    const client3Messages = [];
    
    // Connect clients with different configurations
    const conn1 = await makeStreamRequest(`http://localhost:${port}/stream?channels=default,alerts`);
    const conn2 = await makeStreamRequest(`http://localhost:${port}/stream?channels=metrics&filters=${encodeURIComponent(JSON.stringify({ minSeverity: 5 }))}`);
    const conn3 = await makeStreamRequest(`http://localhost:${port}/stream?channels=alerts`);
    
    conn1.on('data', (chunk) => parseSSEData(chunk, client1Messages));
    conn2.on('data', (chunk) => parseSSEData(chunk, client2Messages));
    conn3.on('data', (chunk) => parseSSEData(chunk, client3Messages));
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send various messages
    streamer.broadcast({ type: 'info', severity: 3 }, 'default');
    streamer.broadcast({ type: 'alert', severity: 7 }, 'alerts');
    streamer.broadcast({ type: 'metric', severity: 6, value: 100 }, 'metrics');
    streamer.broadcast({ type: 'metric', severity: 3, value: 50 }, 'metrics');
    
    // Wait for messages and heartbeat
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Check client 1 (default + alerts channels)
    assert.ok(client1Messages.find(m => m.type === 'info'), 'Client 1 received default channel message');
    assert.ok(client1Messages.find(m => m.type === 'alert'), 'Client 1 received alerts channel message');
    assert.strictEqual(client1Messages.find(m => m.type === 'metric'), undefined, 'Client 1 did not receive metrics message');
    
    // Check client 2 (metrics with severity filter)
    const client2Metrics = client2Messages.filter(m => m.type === 'metric');
    assert.strictEqual(client2Metrics.length, 1, 'Client 2 received only high severity metric');
    assert.strictEqual(client2Metrics[0].value, 100, 'Correct metric received');
    
    // Check client 3 (alerts only)
    assert.ok(client3Messages.find(m => m.type === 'alert'), 'Client 3 received alert');
    assert.strictEqual(client3Messages.find(m => m.type === 'info'), undefined, 'Client 3 did not receive default message');
    
    // Check heartbeats
    assert.ok(client1Messages.find(m => m.type === 'heartbeat'), 'Client 1 received heartbeat');
    assert.ok(client2Messages.find(m => m.type === 'heartbeat'), 'Client 2 received heartbeat');
    assert.ok(client3Messages.find(m => m.type === 'heartbeat'), 'Client 3 received heartbeat');
    
    // Check stats
    const stats = streamer.getStats();
    assert.strictEqual(stats.activeConnections, 3, 'Three active connections');
    assert.ok(stats.messagesTransmitted > 10, 'Multiple messages transmitted');
    
    conn1.destroy();
    conn2.destroy();
    conn3.destroy();
    await streamer.stop();
  });
});

// Helper functions
function makeRequest(url, options = {}) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    
    req.on('error', (error) => {
      resolve({
        statusCode: 0,
        headers: {},
        body: error.message
      });
    });
    
    req.end();
  });
}

function makeStreamRequest(url, options = {}) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = http.request(reqOptions, (res) => {
      resolve(res);
    });
    
    req.on('error', (_error) => {
      const mockRes = {
        statusCode: 0,
        headers: {},
        on: () => {},
        destroy: () => {}
      };
      resolve(mockRes);
    });
    
    req.end();
  });
}

function parseSSEData(chunk, messages) {
  const lines = chunk.toString().split('\n');
  lines.forEach(line => {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.substring(6));
        messages.push(data);
      } catch {
        // Ignore parsing errors
      }
    }
  });
}

// Export for test runner
module.exports = () => describe('MemoryStreamer', () => {});
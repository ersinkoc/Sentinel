'use strict';

const { Session } = require('inspector');
const EventEmitter = require('events');

class Profiler extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.session = null;
    this.isProfiled = false;
    this.profileData = null;
  }
  
  async profile(duration = 10000) {
    if (this.isProfiled) {
      throw new Error('Profiling already in progress');
    }
    
    this.isProfiled = true;
    this.session = new Session();
    this.session.connect();
    
    try {
      // Enable profiler
      await this._post('Profiler.enable');
      await this._post('HeapProfiler.enable');
      
      // Start sampling
      await this._post('HeapProfiler.startSampling', {
        samplingInterval: 512 * 1024 // Sample every 512KB
      });
      
      this.emit('profiling-started');
      
      // Collect samples for the specified duration
      await new Promise(resolve => setTimeout(resolve, duration));
      
      // Stop sampling and get results
      const { profile } = await this._post('HeapProfiler.stopSampling');
      
      // Disable profilers
      await this._post('HeapProfiler.disable');
      await this._post('Profiler.disable');
      
      this.profileData = this._processProfile(profile);
      this.emit('profiling-completed', this.profileData);
      
      return this.profileData;
    } catch (error) {
      throw new Error(`Profiling failed: ${error.message}`);
    } finally {
      this.isProfiled = false;
      if (this.session) {
        this.session.disconnect();
        this.session = null;
      }
    }
  }
  
  async startTrackingAllocations() {
    if (!this.session) {
      this.session = new Session();
      this.session.connect();
    }
    
    await this._post('HeapProfiler.enable');
    await this._post('HeapProfiler.startTrackingHeapObjects', {
      trackAllocations: true
    });
    
    this.emit('allocation-tracking-started');
  }
  
  async stopTrackingAllocations() {
    if (!this.session) {
      throw new Error('No tracking session active');
    }
    
    await this._post('HeapProfiler.stopTrackingHeapObjects');
    await this._post('HeapProfiler.disable');
    
    this.session.disconnect();
    this.session = null;
    
    this.emit('allocation-tracking-stopped');
  }
  
  async takeAllocationSnapshot() {
    if (!this.session) {
      throw new Error('No tracking session active');
    }

    const chunks = [];

    // Set up event listener for heap snapshot chunks
    const chunkHandler = (message) => {
      chunks.push(message.params.chunk);
    };

    try {
      this.session.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler);

      // Take snapshot
      await this._post('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false
      });

      // Parse snapshot data
      const snapshotData = chunks.join('');
      const snapshot = JSON.parse(snapshotData);

      return this._analyzeAllocationSnapshot(snapshot);
    } finally {
      // Always cleanup the event listener
      this.session.removeListener('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
    }
  }
  
  _processProfile(profile) {
    const { head, samples, timestamps } = profile;
    
    // Build call tree
    const callTree = this._buildCallTree(head);
    
    // Analyze allocation patterns
    const patterns = this._analyzeAllocationPatterns(samples, timestamps);
    
    // Find hot spots
    const hotSpots = this._findHotSpots(callTree);
    
    // Calculate statistics
    const stats = this._calculateProfileStats(profile);
    
    return {
      callTree,
      patterns,
      hotSpots,
      stats,
      summary: this._generateProfileSummary(callTree, patterns, hotSpots)
    };
  }
  
  _buildCallTree(node, parent = null) {
    const tree = {
      id: node.id,
      functionName: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      columnNumber: node.callFrame.columnNumber,
      selfSize: node.selfSize || 0,
      totalSize: 0,
      children: [],
      parent
    };
    
    // Process children
    if (node.children) {
      for (const child of node.children) {
        const childTree = this._buildCallTree(child, tree);
        tree.children.push(childTree);
        tree.totalSize += childTree.totalSize;
      }
    }
    
    tree.totalSize += tree.selfSize;
    
    return tree;
  }
  
  _analyzeAllocationPatterns(samples, timestamps) {
    const patterns = {
      allocationRate: [],
      peakAllocations: [],
      steadyGrowth: false,
      burstPatterns: []
    };
    
    // Calculate allocation rate over time
    const windowSize = 1000; // 1 second windows
    let windowStart = timestamps[0];
    let windowAllocations = 0;
    
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] - windowStart >= windowSize) {
        patterns.allocationRate.push({
          timestamp: windowStart,
          rate: windowAllocations
        });
        windowStart = timestamps[i];
        windowAllocations = 0;
      }
      windowAllocations++;
    }
    
    // Detect steady growth
    if (patterns.allocationRate.length > 5) {
      const rates = patterns.allocationRate.map(r => r.rate);
      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - avgRate, 2), 0) / rates.length;
      const stdDev = Math.sqrt(variance);
      
      patterns.steadyGrowth = stdDev < avgRate * 0.2; // Low variance indicates steady growth
    }
    
    // Find burst patterns
    const threshold = patterns.allocationRate.reduce((a, b) => a + b.rate, 0) / patterns.allocationRate.length * 2;
    patterns.burstPatterns = patterns.allocationRate.filter(r => r.rate > threshold);
    
    return patterns;
  }
  
  _findHotSpots(callTree) {
    const hotSpots = [];
    const threshold = callTree.totalSize * 0.05; // 5% of total allocations
    
    const traverse = (node) => {
      if (node.selfSize > threshold) {
        hotSpots.push({
          functionName: node.functionName,
          url: node.url,
          lineNumber: node.lineNumber,
          selfSize: node.selfSize,
          totalSize: node.totalSize,
          percentage: (node.selfSize / callTree.totalSize) * 100
        });
      }
      
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(callTree);
    
    return hotSpots.sort((a, b) => b.selfSize - a.selfSize).slice(0, 10);
  }
  
  _calculateProfileStats(profile) {
    const { samples, timestamps } = profile;
    
    const duration = timestamps[timestamps.length - 1] - timestamps[0];
    const totalSamples = samples.length;
    const samplesPerSecond = (totalSamples / duration) * 1000;
    
    return {
      duration,
      totalSamples,
      samplesPerSecond,
      startTime: timestamps[0],
      endTime: timestamps[timestamps.length - 1]
    };
  }
  
  _generateProfileSummary(callTree, patterns, hotSpots) {
    const summary = {
      totalAllocations: callTree.totalSize,
      topAllocators: hotSpots.slice(0, 5).map(hs => ({
        function: hs.functionName,
        size: hs.selfSize,
        percentage: hs.percentage.toFixed(2) + '%'
      })),
      allocationBehavior: patterns.steadyGrowth ? 'steady' : 'variable',
      burstCount: patterns.burstPatterns.length,
      recommendations: []
    };
    
    // Generate recommendations
    if (patterns.steadyGrowth) {
      summary.recommendations.push('Steady allocation growth detected - possible memory leak');
    }
    
    if (patterns.burstPatterns.length > 5) {
      summary.recommendations.push('Frequent allocation bursts detected - consider object pooling');
    }
    
    if (hotSpots.length > 0 && hotSpots[0].percentage > 20) {
      summary.recommendations.push(`Function "${hotSpots[0].functionName}" accounts for ${hotSpots[0].percentage.toFixed(2)}% of allocations`);
    }
    
    return summary;
  }
  
  _analyzeAllocationSnapshot(snapshot) {
    // Extract allocation information from snapshot
    const allocations = new Map();
    
    if (snapshot.nodes && snapshot.edges) {
      // Process nodes to find allocation sites
      const nodeFields = snapshot.snapshot.meta.node_fields;
      const nodeTypes = snapshot.snapshot.meta.node_types;
      const strings = snapshot.strings;
      
      for (let i = 0; i < snapshot.nodes.length; i += nodeFields.length) {
        const type = nodeTypes[snapshot.nodes[i]];
        const name = strings[snapshot.nodes[i + 1]];
        const size = snapshot.nodes[i + 3];
        
        const key = `${type}:${name}`;
        
        if (!allocations.has(key)) {
          allocations.set(key, {
            type,
            name,
            count: 0,
            totalSize: 0
          });
        }
        
        const alloc = allocations.get(key);
        alloc.count++;
        alloc.totalSize += size;
      }
    }
    
    // Sort by total size
    const sorted = Array.from(allocations.values())
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20);
    
    return {
      topAllocations: sorted,
      totalObjects: allocations.size,
      timestamp: Date.now()
    };
  }
  
  async _post(method, params = {}) {
    return new Promise((resolve, reject) => {
      this.session.post(method, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
  
  configure(config) {
    this.config = config;
  }
}

module.exports = Profiler;
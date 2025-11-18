'use strict';

const { writeHeapSnapshot } = require('v8');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class Analyzer {
  constructor(config) {
    this.config = config;
    this.snapshotCache = new Map();
    this.tempDir = process.env.TEMP || process.env.TMP || '/tmp';
  }
  
  async createSnapshot() {
    const filename = path.join(this.tempDir, `heap-${Date.now()}-${process.pid}.heapsnapshot`);
    
    try {
      // Trigger GC before snapshot if available
      if (global.gc) {
        global.gc();
      }
      
      // Write heap snapshot
      writeHeapSnapshot(filename);
      
      // Read and parse snapshot
      const data = await readFile(filename, 'utf8');
      const snapshot = JSON.parse(data);
      
      // Clean up temp file
      await unlink(filename).catch(() => {}); // Ignore errors
      
      // Process snapshot
      const processed = this._processSnapshot(snapshot);
      
      // Cache for comparison
      const id = crypto.randomBytes(16).toString('hex');
      this.snapshotCache.set(id, processed);
      
      // Clean old cache entries (keep last 10)
      if (this.snapshotCache.size > 10) {
        const firstKey = this.snapshotCache.keys().next().value;
        this.snapshotCache.delete(firstKey);
      }
      
      return {
        id,
        timestamp: Date.now(),
        stats: processed.stats,
        summary: processed.summary
      };
    } catch (error) {
      throw new Error(`Failed to create heap snapshot: ${error.message}`);
    }
  }
  
  async analyzeSnapshot(snapshot, options = {}) {
    const cached = this.snapshotCache.get(snapshot.id);
    if (!cached) {
      throw new Error('Snapshot not found in cache');
    }
    
    const analysis = {
      timestamp: snapshot.timestamp,
      leakCandidates: this._findLeakCandidates(cached),
      largestObjects: this._findLargestObjects(cached, options.limit || 10),
      retainerPaths: options.includePaths ? this._analyzeRetainerPaths(cached) : null,
      objectGroups: this._groupObjects(cached),
      recommendations: []
    };
    
    // Generate recommendations based on findings
    analysis.recommendations = this._generateRecommendations(analysis);
    
    return analysis;
  }
  
  async compareSnapshots(snapshot1, snapshot2) {
    const cached1 = this.snapshotCache.get(snapshot1.id);
    const cached2 = this.snapshotCache.get(snapshot2.id);
    
    if (!cached1 || !cached2) {
      throw new Error('One or both snapshots not found in cache');
    }
    
    const comparison = {
      timeDelta: snapshot2.timestamp - snapshot1.timestamp,
      heapGrowth: cached2.stats.totalSize - cached1.stats.totalSize,
      objectCountDelta: cached2.stats.objectCount - cached1.stats.objectCount,
      newObjects: this._findNewObjects(cached1, cached2),
      grownObjects: this._findGrownObjects(cached1, cached2),
      deletedObjects: this._findDeletedObjects(cached1, cached2)
    };
    
    comparison.leakProbability = this._calculateLeakProbability(comparison);
    
    return comparison;
  }
  
  _processSnapshot(snapshot) {
    const nodes = snapshot.nodes || [];
    const edges = snapshot.edges || [];
    const strings = snapshot.strings || [];
    const nodeFields = snapshot.snapshot.meta.node_fields;
    const edgeFields = snapshot.snapshot.meta.edge_fields;
    const nodeTypes = snapshot.snapshot.meta.node_types;
    const edgeTypes = snapshot.snapshot.meta.edge_types;
    
    // Build object map
    const objects = new Map();
    const nodeFieldCount = nodeFields.length;
    const edgeFieldCount = edgeFields.length;

    let edgeIndex = 0;
    
    for (let i = 0; i < nodes.length; i += nodeFieldCount) {
      const type = nodeTypes[nodes[i]];
      const name = strings[nodes[i + 1]];
      const id = nodes[i + 2];
      const size = nodes[i + 3];
      const edgeCount = nodes[i + 4];
      
      const obj = {
        type,
        name,
        id,
        size,
        edges: [],
        retainers: []
      };
      
      // Process edges for this node
      for (let j = 0; j < edgeCount; j++) {
        const edgeType = edgeTypes[edges[edgeIndex]];
        const edgeName = strings[edges[edgeIndex + 1]];
        const toNode = edges[edgeIndex + 2];
        
        obj.edges.push({
          type: edgeType,
          name: edgeName,
          to: toNode
        });
        
        edgeIndex += edgeFieldCount;
      }
      
      objects.set(id, obj);
    }
    
    // Calculate statistics
    const stats = {
      objectCount: objects.size,
      totalSize: Array.from(objects.values()).reduce((sum, obj) => sum + obj.size, 0),
      typeDistribution: this._calculateTypeDistribution(objects)
    };
    
    // Build retainer information
    for (const obj of objects.values()) {
      for (const edge of obj.edges) {
        const target = objects.get(edge.to);
        if (target) {
          target.retainers.push({
            from: obj.id,
            type: edge.type,
            name: edge.name
          });
        }
      }
    }
    
    return {
      objects,
      stats,
      summary: this._generateSummary(objects)
    };
  }
  
  _findLeakCandidates(processed) {
    const candidates = [];
    const { objects } = processed;
    
    // Common leak patterns
    const patterns = [
      {
        name: 'Large Arrays',
        check: (obj) => obj.type === 'Array' && obj.size > 1024 * 1024 // 1MB
      },
      {
        name: 'Large Strings',
        check: (obj) => obj.type === 'String' && obj.size > 100 * 1024 // 100KB
      },
      {
        name: 'Detached DOM',
        check: (obj) => obj.name && obj.name.includes('Detached') && obj.name.includes('DOM')
      },
      {
        name: 'Event Listeners',
        check: (obj) => obj.name && (obj.name.includes('EventListener') || obj.name.includes('EventEmitter'))
      },
      {
        name: 'Timers',
        check: (obj) => obj.name && (obj.name.includes('Timer') || obj.name.includes('Timeout'))
      },
      {
        name: 'Closures',
        check: (obj) => obj.type === 'Closure' && obj.retainers.length > 10
      }
    ];
    
    for (const obj of objects.values()) {
      for (const pattern of patterns) {
        if (pattern.check(obj)) {
          candidates.push({
            pattern: pattern.name,
            object: {
              id: obj.id,
              type: obj.type,
              name: obj.name,
              size: obj.size,
              retainerCount: obj.retainers.length
            }
          });
        }
      }
    }
    
    return candidates.sort((a, b) => b.object.size - a.object.size);
  }
  
  _findLargestObjects(processed, limit) {
    const { objects } = processed;
    const sorted = Array.from(objects.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
    
    return sorted.map(obj => ({
      id: obj.id,
      type: obj.type,
      name: obj.name,
      size: obj.size,
      sizeInMB: (obj.size / 1024 / 1024).toFixed(2),
      retainerCount: obj.retainers.length
    }));
  }
  
  _analyzeRetainerPaths(processed) {
    const { objects } = processed;
    const paths = new Map();
    
    // Find GC roots
    // Array.from(objects.values()).filter(obj => obj.retainers.length === 0);
    
    // Simple path finding (limited depth to avoid performance issues)
    const findPaths = (objId, depth = 0, maxDepth = 5) => {
      if (depth > maxDepth) return [];
      
      const obj = objects.get(objId);
      if (!obj) return [];
      
      if (obj.retainers.length === 0) {
        return [[obj]]; // Root object
      }
      
      const allPaths = [];
      for (const retainer of obj.retainers.slice(0, 3)) { // Limit retainers examined
        const parentPaths = findPaths(retainer.from, depth + 1, maxDepth);
        for (const parentPath of parentPaths) {
          allPaths.push([obj, ...parentPath]);
        }
      }
      
      return allPaths;
    };
    
    // Analyze paths for largest objects
    const largestObjects = this._findLargestObjects(processed, 5);
    
    for (const obj of largestObjects) {
      const objPaths = findPaths(obj.id);
      paths.set(obj.id, objPaths.slice(0, 3)); // Keep top 3 paths
    }
    
    return paths;
  }
  
  _groupObjects(processed) {
    const { objects } = processed;
    const groups = new Map();
    
    for (const obj of objects.values()) {
      const key = `${obj.type}:${obj.name || 'unnamed'}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          type: obj.type,
          name: obj.name || 'unnamed',
          count: 0,
          totalSize: 0,
          instances: []
        });
      }
      
      const group = groups.get(key);
      group.count++;
      group.totalSize += obj.size;
      
      // Keep a few instances for inspection
      if (group.instances.length < 5) {
        group.instances.push({
          id: obj.id,
          size: obj.size
        });
      }
    }
    
    // Sort by total size
    return Array.from(groups.values())
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20); // Top 20 groups
  }
  
  _generateSummary(objects) {
    const summary = {
      totalObjects: objects.size,
      totalSize: 0,
      largestObject: null,
      typeBreakdown: {}
    };
    
    let largest = null;
    
    for (const obj of objects.values()) {
      summary.totalSize += obj.size;
      
      if (!largest || obj.size > largest.size) {
        largest = obj;
      }
      
      if (!summary.typeBreakdown[obj.type]) {
        summary.typeBreakdown[obj.type] = {
          count: 0,
          size: 0
        };
      }
      
      summary.typeBreakdown[obj.type].count++;
      summary.typeBreakdown[obj.type].size += obj.size;
    }
    
    summary.largestObject = largest ? {
      type: largest.type,
      name: largest.name,
      size: largest.size
    } : null;
    
    return summary;
  }
  
  _calculateTypeDistribution(objects) {
    const distribution = {};
    
    for (const obj of objects.values()) {
      if (!distribution[obj.type]) {
        distribution[obj.type] = 0;
      }
      distribution[obj.type]++;
    }
    
    return distribution;
  }
  
  _findNewObjects(snapshot1, snapshot2) {
    const newObjects = [];
    
    for (const [id, obj] of snapshot2.objects) {
      if (!snapshot1.objects.has(id)) {
        newObjects.push({
          id: obj.id,
          type: obj.type,
          name: obj.name,
          size: obj.size
        });
      }
    }
    
    return newObjects.sort((a, b) => b.size - a.size).slice(0, 20);
  }
  
  _findGrownObjects(snapshot1, snapshot2) {
    const grownObjects = [];
    
    for (const [id, obj2] of snapshot2.objects) {
      const obj1 = snapshot1.objects.get(id);
      if (obj1 && obj2.size > obj1.size) {
        grownObjects.push({
          id: obj2.id,
          type: obj2.type,
          name: obj2.name,
          oldSize: obj1.size,
          newSize: obj2.size,
          growth: obj2.size - obj1.size,
          growthPercent: ((obj2.size - obj1.size) / obj1.size) * 100
        });
      }
    }
    
    return grownObjects.sort((a, b) => b.growth - a.growth).slice(0, 20);
  }
  
  _findDeletedObjects(snapshot1, snapshot2) {
    const deletedObjects = [];
    
    for (const [id, obj] of snapshot1.objects) {
      if (!snapshot2.objects.has(id)) {
        deletedObjects.push({
          id: obj.id,
          type: obj.type,
          name: obj.name,
          size: obj.size
        });
      }
    }
    
    return deletedObjects.sort((a, b) => b.size - a.size).slice(0, 20);
  }
  
  _calculateLeakProbability(comparison) {
    let probability = 0;
    
    // Significant heap growth
    if (comparison.heapGrowth > 10 * 1024 * 1024) { // 10MB
      probability += 0.3;
    }
    
    // Many new objects
    if (comparison.newObjects.length > 100) {
      probability += 0.2;
    }
    
    // Large grown objects
    const totalGrowth = comparison.grownObjects.reduce((sum, obj) => sum + obj.growth, 0);
    if (totalGrowth > 5 * 1024 * 1024) { // 5MB
      probability += 0.3;
    }
    
    // Few deleted objects relative to new
    if (comparison.deletedObjects.length < comparison.newObjects.length * 0.5) {
      probability += 0.2;
    }
    
    return Math.min(1, probability);
  }
  
  _generateRecommendations(analysis) {
    const recommendations = [];
    
    // Check for large arrays
    const largeArrays = analysis.leakCandidates.filter(c => c.pattern === 'Large Arrays');
    if (largeArrays.length > 0) {
      recommendations.push({
        type: 'large-arrays',
        severity: 'high',
        message: 'Large arrays detected. Consider implementing pagination or data windowing.',
        details: `Found ${largeArrays.length} large arrays consuming significant memory.`
      });
    }
    
    // Check for event listeners
    const eventListeners = analysis.leakCandidates.filter(c => c.pattern === 'Event Listeners');
    if (eventListeners.length > 5) {
      recommendations.push({
        type: 'event-listeners',
        severity: 'medium',
        message: 'Multiple event listeners detected. Ensure listeners are properly removed.',
        details: 'Use removeEventListener() or once() for one-time events.'
      });
    }
    
    // Check for closures
    const closures = analysis.leakCandidates.filter(c => c.pattern === 'Closures');
    if (closures.length > 0) {
      recommendations.push({
        type: 'closures',
        severity: 'medium',
        message: 'Closures with many retainers found. Review closure scope and references.',
        details: 'Consider using WeakMap/WeakSet for object references.'
      });
    }
    
    return recommendations;
  }
  
  configure(config) {
    this.config = config;
  }
  
  clearCache() {
    this.snapshotCache.clear();
  }
  
  reset() {
    this.clearCache();
  }
}

module.exports = Analyzer;
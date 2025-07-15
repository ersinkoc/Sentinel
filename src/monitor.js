'use strict';

const v8 = require('v8');
const { PerformanceObserver } = require('perf_hooks');
const EventEmitter = require('events');
const os = require('os');

class Monitor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.metrics = {
      heap: [],
      gc: [],
      cpu: [],
      eventLoop: []
    };
    this.gcObserver = null;
    this.eventLoopInterval = null;
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
    this.lastEventLoopCheck = Date.now();
  }
  
  start() {
    this._setupGCObserver();
    this._setupEventLoopMonitor();
    this.collect();
  }
  
  stop() {
    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = null;
    }
    if (this.eventLoopInterval) {
      clearInterval(this.eventLoopInterval);
      this.eventLoopInterval = null;
    }
  }
  
  _setupGCObserver() {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const gcMetric = {
            timestamp: Date.now(),
            type: this._getGCType(entry.detail ? entry.detail.kind : entry.kind),
            duration: entry.duration,
            flags: entry.detail ? entry.detail.flags : entry.flags
          };
          this.metrics.gc.push(gcMetric);
          this._trimMetrics('gc', 100);
        });
      });
      
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      // GC monitoring might not be available in all environments
      this.emit('warning', {
        type: 'gc-monitoring-unavailable',
        message: 'GC monitoring is not available in this environment'
      });
    }
  }
  
  _setupEventLoopMonitor() {
    let lastCheck = process.hrtime.bigint();
    
    const checkEventLoop = () => {
      const now = process.hrtime.bigint();
      const delay = Number(now - lastCheck) / 1000000; // Convert to ms
      
      const interval = this.config.monitoring?.interval || 30000;
      if (delay > interval + 100) { // 100ms tolerance
        this.metrics.eventLoop.push({
          timestamp: Date.now(),
          delay: delay - interval
        });
        this._trimMetrics('eventLoop', 50);
      }
      
      lastCheck = process.hrtime.bigint();
    };
    
    this.eventLoopInterval = setInterval(checkEventLoop, 1000); // Check every second
  }
  
  collect() {
    const heapStats = v8.getHeapStatistics();
    const heapSpaceStats = v8.getHeapSpaceStatistics();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    
    const metric = {
      timestamp: Date.now(),
      heap: {
        used: heapStats.used_heap_size,
        total: heapStats.total_heap_size,
        limit: heapStats.heap_size_limit,
        available: heapStats.total_available_size,
        physical: heapStats.total_physical_size,
        malloced: heapStats.malloced_memory,
        peakMalloced: heapStats.peak_malloced_memory,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
        spaces: heapSpaceStats.map(space => ({
          name: space.space_name,
          size: space.space_size,
          used: space.space_used_size,
          available: space.space_available_size,
          physical: space.physical_space_size
        }))
      },
      cpu: {
        user: cpuUsage.user / 1000, // Convert to ms
        system: cpuUsage.system / 1000,
        percent: this._calculateCpuPercent(cpuUsage)
      },
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      system: {
        platform: os.platform(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        loadAvg: os.loadavg(),
        uptime: process.uptime()
      }
    };
    
    this.metrics.heap.push(metric);
    this._trimMetrics('heap', 60); // Keep last 60 samples
    
    this.lastCpuUsage = process.cpuUsage();
    this.emit('metrics', metric);
    
    return metric;
  }
  
  getMetrics() {
    return {
      heap: this.metrics.heap.slice(-30), // Last 30 samples
      gc: this.metrics.gc.slice(-50),
      eventLoop: this.metrics.eventLoop.slice(-20),
      summary: this._calculateSummary()
    };
  }
  
  reset() {
    this.metrics = {
      heap: [],
      gc: [],
      cpu: [],
      eventLoop: []
    };
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
  }
  
  configure(config) {
    this.config = config;
  }
  
  _calculateCpuPercent(cpuUsage) {
    const totalTime = cpuUsage.user + cpuUsage.system;
    const elapsedTime = (Date.now() - this.lastEventLoopCheck) * 1000; // Convert to microseconds
    const numCpus = os.cpus().length;
    
    this.lastEventLoopCheck = Date.now();
    return Math.min(100, (totalTime / elapsedTime) * 100 / numCpus);
  }
  
  _calculateSummary() {
    if (this.metrics.heap.length === 0) {
      return null;
    }
    
    const recent = this.metrics.heap.slice(-10);
    const heapUsed = recent.map(m => m.heap.used);
    const gcCount = this.metrics.gc.length;
    const gcTime = this.metrics.gc.reduce((sum, gc) => sum + gc.duration, 0);
    
    return {
      avgHeapUsed: heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length,
      maxHeapUsed: Math.max(...heapUsed),
      minHeapUsed: Math.min(...heapUsed),
      heapGrowthRate: this._calculateGrowthRate(heapUsed),
      gcCount,
      gcTotalTime: gcTime,
      gcAvgTime: gcCount > 0 ? gcTime / gcCount : 0,
      uptime: Date.now() - this.startTime
    };
  }
  
  _calculateGrowthRate(values) {
    if (values.length < 2) return 0;
    
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    
    return ((lastValue - firstValue) / firstValue) * 100;
  }
  
  _trimMetrics(type, maxLength) {
    if (this.metrics[type].length > maxLength) {
      this.metrics[type] = this.metrics[type].slice(-maxLength);
    }
  }
  
  _getGCType(kind) {
    const gcTypes = {
      1: 'scavenge',
      2: 'mark-sweep-compact',
      4: 'incremental-marking',
      8: 'weak-processing',
      16: 'all'
    };
    
    return gcTypes[kind] || 'unknown';
  }
}

module.exports = Monitor;
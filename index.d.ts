declare module '@oxog/sentinel' {
  import { EventEmitter } from 'events';

  // Main Sentinel class
  export default class Sentinel extends EventEmitter {
    constructor(config?: SentinelConfig);
    
    static getInstance(config?: SentinelConfig): Sentinel;
    
    configure(config: Partial<SentinelConfig>): this;
    start(): this;
    stop(): this;
    
    snapshot(): Promise<HeapSnapshot>;
    analyze(options?: AnalysisOptions): Promise<AnalysisResult>;
    compare(snapshot1: HeapSnapshot, snapshot2: HeapSnapshot): Promise<ComparisonResult>;
    forceGC(): boolean;
    
    getMetrics(): MetricsData;
    getLeaks(): MemoryLeak[];
    reset(): this;
    profile(duration?: number): Promise<ProfileResult>;
    
    enableDebug(): this;
    disableDebug(): this;
    
    // Events
    on(event: 'leak', listener: (leak: MemoryLeak) => void): this;
    on(event: 'warning', listener: (warning: Warning) => void): this;
    on(event: 'metrics', listener: (metrics: MetricsSnapshot) => void): this;
    on(event: 'start', listener: () => void): this;
    on(event: 'stop', listener: () => void): this;
    on(event: 'baseline-established', listener: (baseline: Baseline) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  // Configuration interfaces
  export interface SentinelConfig {
    enabled: boolean;
    interval: number;
    threshold: ThresholdConfig;
    detection: DetectionConfig;
    reporting: ReportingConfig;
    production: ProductionConfig;
    onLeak?: (leak: MemoryLeak) => void;
    debug?: boolean;
  }

  export interface ThresholdConfig {
    heap: number;
    growth: number;
    gcFrequency: number;
  }

  export interface DetectionConfig {
    sensitivity: 'low' | 'medium' | 'high';
    patterns: string[];
    baseline: {
      duration: number;
      samples: number;
    };
  }

  export interface ReportingConfig {
    console: boolean;
    file: boolean;
    webhook?: string;
  }

  export interface ProductionConfig {
    maxCpuUsage: number;
    maxMemoryUsage: number;
  }

  // Memory and metrics interfaces
  export interface HeapSnapshot {
    id: string;
    timestamp: number;
    stats: HeapStats;
    summary: HeapSummary;
  }

  export interface HeapStats {
    objectCount: number;
    totalSize: number;
    typeDistribution: Record<string, number>;
  }

  export interface HeapSummary {
    totalObjects: number;
    totalSize: number;
    largestObject: {
      type: string;
      name: string;
      size: number;
    } | null;
    typeBreakdown: Record<string, { count: number; size: number }>;
  }

  export interface MetricsSnapshot {
    timestamp: number;
    heap: {
      used: number;
      total: number;
      limit: number;
      available: number;
      physical: number;
      malloced: number;
      peakMalloced: number;
      external: number;
      arrayBuffers: number;
      spaces: HeapSpace[];
    };
    cpu: {
      user: number;
      system: number;
      percent: number;
    };
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    system: {
      platform: string;
      totalMemory: number;
      freeMemory: number;
      cpus: number;
      loadAvg: number[];
      uptime: number;
    };
  }

  export interface HeapSpace {
    name: string;
    size: number;
    used: number;
    available: number;
    physical: number;
  }

  export interface MetricsData {
    heap: MetricsSnapshot[];
    gc: GCMetric[];
    eventLoop: EventLoopMetric[];
    summary: MetricsSummary | null;
  }

  export interface GCMetric {
    timestamp: number;
    type: string;
    duration: number;
    flags: number;
  }

  export interface EventLoopMetric {
    timestamp: number;
    delay: number;
  }

  export interface MetricsSummary {
    avgHeapUsed: number;
    maxHeapUsed: number;
    minHeapUsed: number;
    heapGrowthRate: number;
    gcCount: number;
    gcTotalTime: number;
    gcAvgTime: number;
    uptime: number;
  }

  // Leak detection interfaces
  export interface MemoryLeak {
    probability: number;
    factors: string[];
    timestamp: number;
    metrics: {
      heapUsed: number;
      heapTotal: number;
      heapLimit: number;
    };
    recommendations: string[];
  }

  export interface Warning {
    type: string;
    message: string;
    timestamp?: number;
    [key: string]: any;
  }

  export interface Baseline {
    avgHeapSize: number;
    stdDevHeapSize: number;
    avgGCFrequency: number;
    samples: number;
    established: number;
  }

  // Analysis interfaces
  export interface AnalysisOptions {
    limit?: number;
    includePaths?: boolean;
  }

  export interface AnalysisResult {
    timestamp: number;
    leakCandidates: LeakCandidate[];
    largestObjects: LargeObject[];
    retainerPaths?: Map<number, any[]> | null;
    objectGroups: ObjectGroup[];
    recommendations: Recommendation[];
  }

  export interface LeakCandidate {
    pattern: string;
    object: {
      id: number;
      type: string;
      name: string;
      size: number;
      retainerCount: number;
    };
  }

  export interface LargeObject {
    id: number;
    type: string;
    name: string;
    size: number;
    sizeInMB: string;
    retainerCount: number;
  }

  export interface ObjectGroup {
    type: string;
    name: string;
    count: number;
    totalSize: number;
    instances: { id: number; size: number }[];
  }

  export interface Recommendation {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: string;
  }

  export interface ComparisonResult {
    timeDelta: number;
    heapGrowth: number;
    objectCountDelta: number;
    newObjects: ObjectDelta[];
    grownObjects: ObjectGrowth[];
    deletedObjects: ObjectDelta[];
    leakProbability: number;
  }

  export interface ObjectDelta {
    id: number;
    type: string;
    name: string;
    size: number;
  }

  export interface ObjectGrowth extends ObjectDelta {
    oldSize: number;
    newSize: number;
    growth: number;
    growthPercent: number;
  }

  // Profiling interfaces
  export interface ProfileResult {
    callTree: CallTreeNode;
    patterns: AllocationPatterns;
    hotSpots: HotSpot[];
    stats: ProfileStats;
    summary: ProfileSummary;
  }

  export interface CallTreeNode {
    id: number;
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    selfSize: number;
    totalSize: number;
    children: CallTreeNode[];
    parent: CallTreeNode | null;
  }

  export interface AllocationPatterns {
    allocationRate: { timestamp: number; rate: number }[];
    peakAllocations: any[];
    steadyGrowth: boolean;
    burstPatterns: { timestamp: number; rate: number }[];
  }

  export interface HotSpot {
    functionName: string;
    url: string;
    lineNumber: number;
    selfSize: number;
    totalSize: number;
    percentage: number;
  }

  export interface ProfileStats {
    duration: number;
    totalSamples: number;
    samplesPerSecond: number;
    startTime: number;
    endTime: number;
  }

  export interface ProfileSummary {
    totalAllocations: number;
    topAllocators: {
      function: string;
      size: number;
      percentage: string;
    }[];
    allocationBehavior: 'steady' | 'variable';
    burstCount: number;
    recommendations: string[];
  }

  // Framework adapter interfaces
  export interface ExpressAdapter {
    middleware(): (req: any, res: any, next: any) => void;
    wrapApp(app: any): any;
    getRouteMetrics(): RouteMetric[];
    getMiddlewareMetrics(): MiddlewareMetric[];
    reset(): void;
  }

  export interface FastifyAdapter {
    plugin(fastify: any, options: any, done: any): void;
    wrapApp(fastify: any): any;
    getRouteMetrics(): RouteMetric[];
    getHookMetrics(): HookMetric[];
    reset(): void;
  }

  export interface KoaAdapter {
    middleware(): (ctx: any, next: any) => Promise<void>;
    wrapApp(app: any): any;
    getRouteMetrics(): RouteMetric[];
    reset(): void;
  }

  export interface NextAdapter {
    middleware(): (req: any, res: any, next: any) => void;
    wrapApp(app: any): any;
    createPlugin(): (nextConfig?: any) => any;
    wrapSSRFunction(fn: any, functionName: string, pageName: string): any;
    getPageMetrics(): RouteMetric[];
    getAPIMetrics(): RouteMetric[];
    getSSRMetrics(): SSRMetric[];
    reset(): void;
  }

  export interface RouteMetric {
    route: string;
    requests: number;
    avgDuration: number;
    avgMemoryDelta: number;
    maxMemoryDelta: number;
    errorRate: number;
    lastAccess: string;
  }

  export interface MiddlewareMetric {
    name: string;
    calls: number;
    avgDuration: number;
    avgMemoryDelta: number;
    errorRate: number;
  }

  export interface HookMetric {
    name: string;
    calls: number;
    avgDuration: number;
    avgMemoryDelta: number;
    errorRate: number;
  }

  export interface SSRMetric {
    function: string;
    calls: number;
    avgDuration: number;
    avgMemoryDelta: number;
    errorRate: number;
  }

  // Framework detector and utilities
  export class FrameworkDetector {
    static detect(): string[];
    static createAdapter(framework: string, options?: any): any;
    static autoDetectAndCreate(options?: any): any;
  }

  export function createSentinelMiddleware(
    frameworkOrOptions?: string | any,
    options?: any
  ): any;

  export function wrapApp(
    app: any,
    frameworkOrOptions?: string | any,
    options?: any
  ): any;

  // Utility functions
  export function formatBytes(bytes: number): string;
  export function formatDuration(ms: number): string;
  export function parseSize(sizeStr: string): number;
}
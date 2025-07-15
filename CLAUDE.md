# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
- `npm test` - Run the complete test suite using custom test runner
- `npm run test:coverage` - Run tests with Node.js experimental coverage reporting
- Single test: `node test/runner.js <test-name>` (e.g., `node test/runner.js monitor.test.js`)

### Building & Development
- `npm run build:types` - Generate TypeScript declaration files
- `npm run benchmark` - Run performance benchmarks
- `npm run prepublishOnly` - Pre-publish checks (tests + type generation)

### CLI Tools
- `npx @oxog/sentinel monitor <script>` - Monitor a Node.js script
- `npx @oxog/sentinel analyze <heapsnapshot>` - Analyze heap dump
- `npx @oxog/sentinel watch` - Real-time memory dashboard
- `npx @oxog/sentinel profile <script>` - Profile memory allocations

## Architecture Overview

Sentinel is a zero-dependency Node.js memory monitoring library built with a modular, event-driven architecture. The main entry point is `index.js` which exports the `Sentinel` class from `src/sentinel.js`.

### Core Architecture Components

#### Central Orchestrator (`src/sentinel.js`)
- Main class that coordinates all subsystems using EventEmitter pattern
- Implements singleton pattern for global instances
- Manages configuration normalization, validation, and distribution
- Provides comprehensive error handling with circuit breakers and retry mechanisms
- Handles lifecycle management (start/stop/graceful shutdown) with health monitoring

#### Monitoring Pipeline
1. **Monitor** (`src/monitor.js`) - Collects V8 heap stats, GC events, and system metrics
2. **Detector** (`src/detector.js`) - Analyzes metrics for leak patterns using multiple algorithms
3. **Analyzer** (`src/analyzer.js`) - Deep heap analysis via V8 snapshots and object inspection
4. **Profiler** (`src/profiler.js`) - Advanced profiling using V8 Inspector API
5. **Reporter** (`src/reporter.js`) - Multi-channel output (console, file, webhook)

#### Infrastructure
- **Performance Optimizer** (`src/performance.js`) - Adaptive tuning and resource management
- **Error Handling** (`src/errors.js`) - Specialized error types, circuit breakers, retry logic
- **Utilities** (`src/utils.js`) - Configuration management, validation, helper functions

### Event-Driven Communication
- All components emit/listen to events for loose coupling
- Key events: `metrics`, `leak`, `warning`, `error`, `health-check`
- Central event coordination through the main Sentinel class

### Configuration System
- Hierarchical configuration with deep merging and validation
- Runtime reconfiguration support via `configure()` methods
- Environment-aware defaults with legacy configuration normalization

## Framework Integration

The `packages/adapters` directory contains framework-specific integrations:
- `ExpressAdapter` - Express.js route monitoring
- `FastifyAdapter` - Fastify integration
- `KoaAdapter` - Koa.js support
- `NextAdapter` - Next.js SSR monitoring

Usage pattern:
```javascript
const { ExpressAdapter } = require('@oxog/sentinel/packages/adapters');
const adapter = new ExpressAdapter();
app.use(adapter.middleware());
```

## Zero Dependencies Philosophy

Built entirely with Node.js built-ins:
- **v8**: Heap statistics, snapshots, sampling profiler
- **perf_hooks**: Performance timing, GC events
- **inspector**: Allocation profiling, debugger protocol
- **events**: Event-driven architecture
- **fs/http**: File operations and webhook notifications

## Key Patterns & Conventions

### Error Handling
- All operations wrapped in try-catch with specialized error types
- Circuit breaker pattern for fault tolerance
- Automatic retry with exponential backoff
- Graceful degradation under high load

### Performance Considerations
- Adaptive monitoring intervals based on system load
- Intelligent sampling and caching with TTL
- Memory-aware operations with automatic GC triggering
- Operation queuing and throttling to prevent overload

### Configuration Structure
```javascript
{
  monitoring: { interval: 30000, detailed: false, gc: true },
  threshold: { heap: 0.8, growth: 0.1, gcFrequency: 10 },
  detection: { enabled: true, sensitivity: 'medium', patterns: ['all'] },
  reporting: { console: true, file: null, webhook: null }
}
```

## Development Guidelines

### Working with Core Components
- Monitor components extend EventEmitter
- Always use error handling wrappers for V8 operations
- Respect the configuration hierarchy and validation
- Use circuit breakers for external operations (webhooks, file I/O)

### Testing Strategy
- Custom test runner in `test/runner.js` with coverage support
- Test files follow `*.test.js` naming convention
- Stress testing available in `benchmark/` directory
- Memory profiling tests included for self-validation

### Adding New Features
1. Extend configuration schema in `src/utils.js`
2. Add validation rules for new config options
3. Implement feature as EventEmitter-based module
4. Integrate via Sentinel class event handlers
5. Add comprehensive error handling and recovery
6. Update TypeScript definitions in `index.d.ts`

## Common Troubleshooting

### Memory Analysis
- Use `sentinel.analyze()` for deep heap inspection
- Compare snapshots with `sentinel.compare(snap1, snap2)`
- Enable detailed monitoring for granular metrics
- Check GC effectiveness and frequency patterns

### Performance Issues
- Monitor overhead with `measureOverhead()` method
- Adjust sensitivity levels for different environments
- Use adaptive performance optimization features
- Consider disabling detailed monitoring in production

### Integration Problems
- Verify Node.js version (>=14.0.0 required)
- Check V8 flag availability for advanced features
- Validate configuration schema and required permissions
- Review error logs for circuit breaker states
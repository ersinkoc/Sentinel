# Contributing to @oxog/sentinel

Thank you for your interest in contributing to Sentinel! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Performance Guidelines](#performance-guidelines)
- [Security Considerations](#security-considerations)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We are committed to providing a welcoming and inclusive environment for all contributors.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your feature or bug fix
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/sentinel.git
cd sentinel

# Install dependencies
npm install

# Run tests to ensure everything is working
npm test

# Run benchmarks to verify performance
npm run benchmark
```

## Making Changes

### Branch Naming

Use descriptive branch names that indicate the type of change:

- `feature/memory-leak-detection` - New features
- `fix/reporter-crash` - Bug fixes
- `perf/analyzer-optimization` - Performance improvements
- `docs/api-reference` - Documentation updates
- `test/detector-coverage` - Test improvements

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `perf`: Performance improvement
- `docs`: Documentation changes
- `test`: Test changes
- `refactor`: Code refactoring
- `style`: Code style changes
- `chore`: Maintenance tasks

Examples:
```
feat(detector): add circular reference detection
fix(monitor): resolve memory leak in event listeners
perf(analyzer): optimize heap analysis algorithm
docs(api): update memory profiling examples
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- test/detector.test.js

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Write unit tests for all new functionality
- Ensure tests are deterministic and don't depend on timing
- Use descriptive test names that explain the expected behavior
- Include edge cases and error conditions
- Maintain test coverage above 90%

### Test Structure

```javascript
const { describe, it, expect, beforeEach, afterEach } = require('./test/runner');
const Sentinel = require('../index');

describe('Feature Name', () => {
  let sentinel;

  beforeEach(() => {
    sentinel = new Sentinel();
  });

  afterEach(() => {
    sentinel.stop();
  });

  it('should handle normal operation', () => {
    // Test implementation
  });

  it('should handle edge cases', () => {
    // Test implementation
  });
});
```

## Pull Request Process

### Before Submitting

1. Ensure all tests pass: `npm test`
2. Run benchmarks to verify performance: `npm run benchmark`
3. Update documentation if needed
4. Add or update tests for your changes
5. Ensure your code follows the coding standards

### PR Requirements

- **Title**: Clear, descriptive title following conventional commit format
- **Description**: Detailed description of changes and motivation
- **Testing**: Describe how the changes were tested
- **Breaking Changes**: Clearly mark any breaking changes
- **Documentation**: Update relevant documentation

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Performance improvement
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Benchmarks show no performance regression
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

## Coding Standards

### General Principles

- **Zero dependencies**: Maintain the library's zero-dependency philosophy
- **Performance first**: All code must be optimized for minimal overhead
- **Memory efficiency**: Avoid unnecessary allocations and leaks
- **Error handling**: Comprehensive error handling with meaningful messages
- **Type safety**: Use JSDoc comments for type information

### Code Style

```javascript
// Use const for immutable values, let for mutable
const DEFAULT_CONFIG = { interval: 1000 };
let currentState = 'idle';

// Function naming: descriptive verbs
function analyzeMemoryUsage(snapshot) {
  // Implementation
}

// Class naming: PascalCase
class MemoryDetector {
  constructor(options = {}) {
    this.options = { ...DEFAULT_CONFIG, ...options };
  }

  // Method naming: camelCase verbs
  detectLeaks() {
    // Implementation
  }
}

// Constants: UPPER_SNAKE_CASE
const MAX_HEAP_SIZE = 1024 * 1024 * 1024;

// Error handling: explicit and informative
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new TypeError('Configuration must be an object');
  }
}
```

### Documentation

- Use JSDoc comments for all public APIs
- Include examples in documentation
- Document performance characteristics
- Explain memory implications

```javascript
/**
 * Analyzes memory usage patterns and detects potential leaks
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Memory threshold in MB (default: 100)
 * @param {number} options.interval - Analysis interval in ms (default: 5000)
 * @returns {Promise<AnalysisResult>} Analysis results
 * @throws {TypeError} When options are invalid
 * @example
 * const analysis = await analyzeMemory({
 *   threshold: 50,
 *   interval: 10000
 * });
 */
async function analyzeMemory(options = {}) {
  // Implementation
}
```

## Performance Guidelines

### Memory Management

- Avoid creating unnecessary objects in hot paths
- Use object pooling for frequently created objects
- Clean up event listeners and timers
- Monitor memory usage in your changes

### Timing Considerations

- Use `process.hrtime.bigint()` for high-precision timing
- Minimize synchronous operations in monitoring code
- Use async/await for better performance profiling

### Benchmarking

Run benchmarks before and after changes:

```bash
npm run benchmark

# Compare with baseline
npm run benchmark:compare
```

## Security Considerations

### Code Security

- Validate all inputs
- Avoid eval() and similar dynamic code execution
- Sanitize file paths and user inputs
- Use secure defaults

### Memory Security

- Avoid exposing sensitive data in heap snapshots
- Clear sensitive data from memory when possible
- Be cautious with debugging information

### Dependency Security

- This project maintains zero runtime dependencies
- Any development dependencies must be security audited
- Regular security updates for development tools

## Architecture Guidelines

### Module Structure

```
src/
├── sentinel.js      # Main entry point
├── monitor.js       # Core monitoring functionality
├── detector.js      # Memory leak detection
├── analyzer.js      # Heap analysis
├── reporter.js      # Result reporting
├── profiler.js      # Performance profiling
├── security.js      # Security utilities
├── performance.js   # Performance optimizations
├── utils.js         # Utility functions
└── errors.js        # Error definitions
```

### API Design

- Keep APIs simple and intuitive
- Provide sensible defaults
- Support both callback and Promise patterns
- Maintain backward compatibility

## Getting Help

- **Issues**: Report bugs and request features on GitHub Issues
- **Discussions**: General questions and discussions on GitHub Discussions
- **Security**: Report security issues privately to the maintainers

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for their contributions
- GitHub contributors page
- Annual contributor recognition

Thank you for contributing to Sentinel!
'use strict';

/**
 * Framework Detection Utility
 * Automatically detects which framework is being used
 */

class FrameworkDetector {
  /**
   * Detect available frameworks in the current environment
   * @returns {string[]} Array of detected frameworks
   */
  static detect() {
    const frameworks = [];
    
    try {
      require.resolve('express');
      frameworks.push('express');
    } catch {
      // Express not available
    }
    
    try {
      require.resolve('fastify');
      frameworks.push('fastify');
    } catch {
      // Fastify not available
    }
    
    try {
      require.resolve('koa');
      frameworks.push('koa');
    } catch {
      // Koa not available
    }
    
    try {
      require.resolve('next');
      frameworks.push('next');
    } catch {
      // Next.js not available
    }
    
    return frameworks;
  }
  
  /**
   * Create an adapter for the specified framework
   * @param {string} framework - Framework name
   * @param {object} options - Adapter options
   * @returns {object} Framework adapter instance
   */
  static createAdapter(framework, options = {}) {
    switch (framework.toLowerCase()) {
    case 'express': {
      const ExpressAdapter = require('./express');
      return new ExpressAdapter(options);
    }
      
    case 'fastify': {
      const FastifyAdapter = require('./fastify');
      return new FastifyAdapter(options);
    }
      
    case 'koa': {
      const KoaAdapter = require('./koa');
      return new KoaAdapter(options);
    }
      
    case 'next': {
      const NextAdapter = require('./next');
      return new NextAdapter(options);
    }
      
    default:
      throw new Error(`Unknown framework: ${framework}`);
    }
  }
  
  /**
   * Auto-detect and create the appropriate adapter
   * @param {object} options - Adapter options
   * @returns {object} Framework adapter instance
   */
  static autoDetectAndCreate(options = {}) {
    const frameworks = this.detect();
    
    if (frameworks.length === 0) {
      throw new Error('No supported frameworks detected');
    }
    
    // Use the first detected framework
    return this.createAdapter(frameworks[0], options);
  }
}

module.exports = FrameworkDetector;
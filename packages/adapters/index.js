'use strict';

/**
 * @oxog/sentinel Framework Adapters
 * Zero-dependency framework integration adapters
 */

const ExpressAdapter = require('./express');
const FastifyAdapter = require('./fastify');
const KoaAdapter = require('./koa');
const NextAdapter = require('./next');
const FrameworkDetector = require('./detector');

/**
 * Create a Sentinel middleware for the specified framework
 * @param {string|object} frameworkOrOptions - Framework name or options object
 * @param {object} options - Additional options
 * @returns {Function} Middleware function
 */
function createSentinelMiddleware(frameworkOrOptions, options = {}) {
  let framework, finalOptions;
  
  if (typeof frameworkOrOptions === 'string') {
    framework = frameworkOrOptions;
    finalOptions = options;
  } else {
    framework = FrameworkDetector.detect()[0] || 'express';
    finalOptions = frameworkOrOptions || {};
  }
  
  const adapter = FrameworkDetector.createAdapter(framework, finalOptions);
  return adapter.middleware();
}

/**
 * Wrap an application with Sentinel monitoring
 * @param {object} app - Application instance
 * @param {string|object} frameworkOrOptions - Framework name or options object
 * @param {object} options - Additional options
 * @returns {object} Wrapped application
 */
function wrapApp(app, frameworkOrOptions, options = {}) {
  let framework, finalOptions;
  
  if (typeof frameworkOrOptions === 'string') {
    framework = frameworkOrOptions;
    finalOptions = options;
  } else {
    framework = FrameworkDetector.detect()[0] || 'express';
    finalOptions = frameworkOrOptions || {};
  }
  
  const adapter = FrameworkDetector.createAdapter(framework, finalOptions);
  return adapter.wrapApp(app);
}

module.exports = {
  ExpressAdapter,
  FastifyAdapter,
  KoaAdapter,
  NextAdapter,
  FrameworkDetector,
  createSentinelMiddleware,
  wrapApp
};
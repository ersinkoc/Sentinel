'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const { 
  formatBytes, 
  CircularBuffer 
} = require('./utils');

/**
 * Advanced alerting system for Sentinel
 * Provides intelligent, contextual alerts with smart filtering and escalation
 */
class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Alert levels
      levels: {
        info: { priority: 1, color: 'blue', threshold: 0 },
        warning: { priority: 2, color: 'yellow', threshold: 5 },
        error: { priority: 3, color: 'orange', threshold: 10 },
        critical: { priority: 4, color: 'red', threshold: 20 }
      },
      
      // Throttling and batching
      throttling: {
        enabled: config.throttling?.enabled !== false,
        windowMs: config.throttling?.windowMs || 60000, // 1 minute
        maxAlertsPerWindow: config.throttling?.maxAlertsPerWindow || 10,
        batchSimilar: config.throttling?.batchSimilar !== false
      },
      
      // Escalation rules
      escalation: {
        enabled: config.escalation?.enabled !== false,
        timeouts: config.escalation?.timeouts || {
          warning: 300000, // 5 minutes
          error: 180000,   // 3 minutes
          critical: 60000  // 1 minute
        },
        maxEscalations: config.escalation?.maxEscalations || 3
      },
      
      // Silence/suppression
      suppression: {
        enabled: config.suppression?.enabled !== false,
        maxDuration: config.suppression?.maxDuration || 3600000, // 1 hour
        rules: config.suppression?.rules || []
      },
      
      // Notification channels
      channels: config.channels || {},
      
      // Smart filtering
      smartFiltering: {
        enabled: config.smartFiltering?.enabled !== false,
        duplicateWindow: config.smartFiltering?.duplicateWindow || 300000, // 5 minutes
        similarityThreshold: config.smartFiltering?.similarityThreshold || 0.8,
        learningEnabled: config.smartFiltering?.learningEnabled !== false
      }
    };
    
    this.alerts = new Map(); // Active alerts
    this.alertHistory = new CircularBuffer(1000); // Alert history
    this.suppressions = new Map(); // Active suppressions
    this.escalations = new Map(); // Escalation tracking
    this.throttleCounters = new Map(); // Throttling counters
    this.similarityCache = new Map(); // For duplicate detection
    
    this.stats = {
      totalAlerts: 0,
      alertsByLevel: { info: 0, warning: 0, error: 0, critical: 0 },
      suppressed: 0,
      escalated: 0,
      resolved: 0
    };
    
    this._setupThrottling();
    this._setupEscalation();
  }
  
  _setupThrottling() {
    if (this.config.throttling.enabled) {
      // Reset throttle counters periodically
      this.throttleResetTimer = setInterval(() => {
        this.throttleCounters.clear();
      }, this.config.throttling.windowMs);
    }
  }
  
  _setupEscalation() {
    if (this.config.escalation.enabled) {
      // Check for escalations periodically
      this.escalationTimer = setInterval(() => {
        this._processEscalations();
      }, 30000); // Check every 30 seconds
    }
  }
  
  // Main alert creation method
  createAlert(data) {
    const alert = this._normalizeAlert(data);
    
    // Apply smart filtering
    if (this._shouldSuppressAlert(alert)) {
      this.stats.suppressed++;
      this.emit('alert-suppressed', alert);
      return null;
    }
    
    // Apply throttling
    if (this._isThrottled(alert)) {
      this.stats.suppressed++;
      this.emit('alert-throttled', alert);
      return null;
    }
    
    // Generate unique ID and timestamps
    alert.id = alert.id || crypto.randomUUID();
    alert.createdAt = Date.now();
    alert.updatedAt = alert.createdAt;
    
    // Store alert
    this.alerts.set(alert.id, alert);
    this.alertHistory.push({ ...alert });
    
    // Update statistics
    this.stats.totalAlerts++;
    this.stats.alertsByLevel[alert.level]++;
    
    // Setup escalation if needed
    if (this.config.escalation.enabled && alert.level !== 'info') {
      this._setupAlertEscalation(alert);
    }
    
    // Send notifications
    this._sendNotifications(alert);
    
    this.emit('alert-created', alert);
    return alert;
  }
  
  _normalizeAlert(data) {
    const alert = {
      id: data.id,
      level: data.level || 'info',
      title: data.title || 'Memory Alert',
      message: data.message || '',
      source: data.source || 'sentinel',
      category: data.category || 'memory',
      tags: data.tags || [],
      metadata: data.metadata || {},
      metrics: data.metrics || {},
      recommendations: data.recommendations || [],
      context: data.context || {},
      severity: this._calculateSeverity(data),
      fingerprint: this._generateFingerprint(data)
    };
    
    // Enhance with memory-specific data
    if (alert.metrics.heapUsed) {
      alert.enhancedMessage = this._enhanceMemoryMessage(alert);
    }
    
    return alert;
  }
  
  _calculateSeverity(data) {
    const levelPriority = this.config.levels[data.level]?.priority || 1;
    
    // Factor in metrics
    let severityMultiplier = 1;
    
    if (data.metrics) {
      // Memory pressure factor
      if (data.metrics.heapUsed && data.metrics.heapTotal) {
        const memoryPressure = data.metrics.heapUsed / data.metrics.heapTotal;
        if (memoryPressure > 0.9) severityMultiplier += 2;
        else if (memoryPressure > 0.8) severityMultiplier += 1;
      }
      
      // GC pressure factor
      if (data.metrics.gcFrequency > 10) {
        severityMultiplier += 1;
      }
      
      // Growth rate factor
      if (data.metrics.growthRate > 0.2) {
        severityMultiplier += 1;
      }
    }
    
    return levelPriority * severityMultiplier;
  }
  
  _generateFingerprint(data) {
    // Create a fingerprint for deduplication
    const fingerprintData = {
      level: data.level,
      source: data.source,
      category: data.category,
      title: data.title
    };
    
    return crypto
      .createHash('md5')
      .update(JSON.stringify(fingerprintData))
      .digest('hex');
  }
  
  _enhanceMemoryMessage(alert) {
    const { metrics } = alert;
    let enhanced = alert.message;
    
    if (metrics.heapUsed) {
      enhanced += `\nHeap Usage: ${formatBytes(metrics.heapUsed)}`;
    }
    
    if (metrics.heapTotal) {
      const percentage = ((metrics.heapUsed / metrics.heapTotal) * 100).toFixed(1);
      enhanced += ` (${percentage}% of total)`;
    }
    
    if (metrics.growthRate) {
      enhanced += `\nGrowth Rate: ${(metrics.growthRate * 100).toFixed(1)}%/min`;
    }
    
    if (metrics.gcFrequency) {
      enhanced += `\nGC Frequency: ${metrics.gcFrequency} cycles/min`;
    }
    
    if (alert.recommendations.length > 0) {
      enhanced += '\n\nRecommendations:';
      alert.recommendations.forEach((rec, i) => {
        enhanced += `\n${i + 1}. ${rec}`;
      });
    }
    
    return enhanced;
  }
  
  _shouldSuppressAlert(alert) {
    // Check suppression rules
    for (const rule of this.config.suppression.rules) {
      if (this._matchesSuppressionRule(alert, rule)) {
        return true;
      }
    }
    
    // Check smart filtering for duplicates
    if (this.config.smartFiltering.enabled) {
      return this._isDuplicateAlert(alert);
    }
    
    return false;
  }
  
  _matchesSuppressionRule(alert, rule) {
    if (rule.level && alert.level !== rule.level) return false;
    if (rule.source && alert.source !== rule.source) return false;
    if (rule.category && alert.category !== rule.category) return false;
    
    if (rule.tags) {
      const hasRequiredTags = rule.tags.every(tag => alert.tags.includes(tag));
      if (!hasRequiredTags) return false;
    }
    
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern, 'i');
      if (!regex.test(alert.message)) return false;
    }
    
    return true;
  }
  
  _isDuplicateAlert(alert) {
    const now = Date.now();
    const window = this.config.smartFiltering.duplicateWindow;
    
    // Clean old entries
    for (const [fingerprint, lastSeen] of this.similarityCache.entries()) {
      if (now - lastSeen > window) {
        this.similarityCache.delete(fingerprint);
      }
    }
    
    // Check if we've seen this fingerprint recently
    const lastSeen = this.similarityCache.get(alert.fingerprint);
    if (lastSeen && (now - lastSeen) < window) {
      return true;
    }
    
    // Update cache
    this.similarityCache.set(alert.fingerprint, now);
    return false;
  }
  
  _isThrottled(alert) {
    if (!this.config.throttling.enabled) return false;
    
    const key = `${alert.level}:${alert.source}:${alert.category}`;
    const current = this.throttleCounters.get(key) || 0;
    
    if (current >= this.config.throttling.maxAlertsPerWindow) {
      return true;
    }
    
    this.throttleCounters.set(key, current + 1);
    return false;
  }
  
  _setupAlertEscalation(alert) {
    const timeout = this.config.escalation.timeouts[alert.level];
    if (!timeout) return;
    
    const escalationTimer = setTimeout(() => {
      this._escalateAlert(alert.id);
    }, timeout);
    
    this.escalations.set(alert.id, {
      timer: escalationTimer,
      count: 0,
      nextLevel: this._getNextEscalationLevel(alert.level)
    });
  }
  
  _getNextEscalationLevel(currentLevel) {
    const levels = ['info', 'warning', 'error', 'critical'];
    const currentIndex = levels.indexOf(currentLevel);
    return levels[Math.min(currentIndex + 1, levels.length - 1)];
  }
  
  _escalateAlert(alertId) {
    const alert = this.alerts.get(alertId);
    const escalation = this.escalations.get(alertId);
    
    if (!alert || !escalation) return;
    
    escalation.count++;
    
    if (escalation.count >= this.config.escalation.maxEscalations) {
      // Max escalations reached
      this.escalations.delete(alertId);
      this.emit('alert-max-escalation', alert);
      return;
    }
    
    // Escalate to next level
    const oldLevel = alert.level;
    alert.level = escalation.nextLevel;
    alert.updatedAt = Date.now();
    alert.escalated = true;
    alert.escalationCount = escalation.count;
    
    this.stats.escalated++;
    this.stats.alertsByLevel[oldLevel]--;
    this.stats.alertsByLevel[alert.level]++;
    
    // Setup next escalation
    escalation.nextLevel = this._getNextEscalationLevel(alert.level);
    const timeout = this.config.escalation.timeouts[alert.level];
    
    if (timeout && escalation.count < this.config.escalation.maxEscalations) {
      escalation.timer = setTimeout(() => {
        this._escalateAlert(alertId);
      }, timeout);
    }
    
    // Send escalated notification
    this._sendNotifications(alert, 'escalated');
    
    this.emit('alert-escalated', alert, oldLevel);
  }
  
  _processEscalations() {
    // This method is called periodically to handle any escalation logic
    // Currently, escalations are handled via timers, but this could be extended
    // for more complex escalation rules
  }
  
  _sendNotifications(alert, type = 'created') {
    const channels = this._getRelevantChannels(alert);
    
    for (const [channelName, channel] of Object.entries(channels)) {
      try {
        this._sendToChannel(channelName, channel, alert, type);
      } catch (error) {
        this.emit('notification-error', { channel: channelName, error, alert });
      }
    }
  }
  
  _getRelevantChannels(alert) {
    const relevantChannels = {};
    
    for (const [name, channel] of Object.entries(this.config.channels)) {
      if (this._shouldSendToChannel(alert, channel)) {
        relevantChannels[name] = channel;
      }
    }
    
    return relevantChannels;
  }
  
  _shouldSendToChannel(alert, channel) {
    // Check level threshold
    if (channel.minLevel) {
      const alertPriority = this.config.levels[alert.level]?.priority || 1;
      const channelPriority = this.config.levels[channel.minLevel]?.priority || 1;
      if (alertPriority < channelPriority) return false;
    }
    
    // Check filters
    if (channel.filters) {
      if (channel.filters.sources && !channel.filters.sources.includes(alert.source)) return false;
      if (channel.filters.categories && !channel.filters.categories.includes(alert.category)) return false;
      if (channel.filters.tags) {
        const hasRequiredTag = channel.filters.tags.some(tag => alert.tags.includes(tag));
        if (!hasRequiredTag) return false;
      }
    }
    
    return true;
  }
  
  _sendToChannel(channelName, channel, alert, type) {
    switch (channel.type) {
    case 'webhook':
      this._sendWebhook(channel, alert, type);
      break;
    case 'email':
      this._sendEmail(channel, alert, type);
      break;
    case 'console':
      this._sendConsole(channel, alert, type);
      break;
    case 'file':
      this._sendFile(channel, alert, type);
      break;
    default:
      this.emit('unknown-channel-type', { channelName, channel, alert });
    }
  }
  
  _sendWebhook(channel, alert, type) {
    const payload = {
      alert: alert,
      type: type,
      timestamp: Date.now()
    };
    
    // This would typically make an HTTP request
    // For now, emit an event that can be handled externally
    this.emit('webhook-notification', { channel, payload });
  }
  
  _sendEmail(channel, alert, type) {
    const emailData = {
      to: channel.recipients,
      subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
      body: alert.enhancedMessage || alert.message,
      alert: alert,
      type: type
    };
    
    this.emit('email-notification', { channel, emailData });
  }
  
  _sendConsole(channel, alert, type) {
    const levelColors = {
      info: '\x1b[36m',    // Cyan
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      critical: '\x1b[35m' // Magenta
    };
    
    const color = levelColors[alert.level] || '\x1b[0m';
    const reset = '\x1b[0m';
    
    const prefix = type === 'escalated' ? '[ESCALATED] ' : '';
    console.log(`${color}[${alert.level.toUpperCase()}]${reset} ${prefix}${alert.title}`);
    console.log(`${alert.enhancedMessage || alert.message}`);
    
    if (alert.recommendations.length > 0) {
      console.log('\nRecommendations:');
      alert.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }
    console.log('---');
  }
  
  _sendFile(channel, alert, type) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      alert: alert,
      type: type
    };
    
    this.emit('file-notification', { channel, logEntry });
  }
  
  // Public API methods
  resolveAlert(alertId, resolution = {}) {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;
    
    alert.resolved = true;
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;
    alert.updatedAt = alert.resolvedAt;
    
    // Clear escalation
    const escalation = this.escalations.get(alertId);
    if (escalation) {
      clearTimeout(escalation.timer);
      this.escalations.delete(alertId);
    }
    
    this.alerts.delete(alertId);
    this.stats.resolved++;
    
    this.emit('alert-resolved', alert);
    return true;
  }
  
  suppressAlert(alertId, duration = 3600000) { // 1 hour default
    const maxDuration = this.config.suppression.maxDuration;
    const suppressDuration = Math.min(duration, maxDuration);
    
    this.suppressions.set(alertId, {
      suppressedAt: Date.now(),
      duration: suppressDuration,
      expiresAt: Date.now() + suppressDuration
    });
    
    // Auto-remove suppression
    setTimeout(() => {
      this.suppressions.delete(alertId);
    }, suppressDuration);
    
    this.emit('alert-suppressed', { alertId, duration: suppressDuration });
    return true;
  }
  
  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.alerts.values());
    
    if (filters.level) {
      alerts = alerts.filter(alert => alert.level === filters.level);
    }
    
    if (filters.source) {
      alerts = alerts.filter(alert => alert.source === filters.source);
    }
    
    if (filters.category) {
      alerts = alerts.filter(alert => alert.category === filters.category);
    }
    
    if (filters.tags) {
      alerts = alerts.filter(alert => 
        filters.tags.some(tag => alert.tags.includes(tag))
      );
    }
    
    return alerts.sort((a, b) => b.severity - a.severity);
  }
  
  getAlertHistory(limit = 100) {
    return this.alertHistory.toArray().slice(-limit);
  }
  
  getStats() {
    return {
      ...this.stats,
      activeAlerts: this.alerts.size,
      activeSuppressions: this.suppressions.size,
      activeEscalations: this.escalations.size
    };
  }
  
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this;
  }
  
  destroy() {
    if (this.throttleResetTimer) {
      clearInterval(this.throttleResetTimer);
    }
    
    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
    }
    
    // Clear all escalation timers
    for (const escalation of this.escalations.values()) {
      clearTimeout(escalation.timer);
    }
    
    this.removeAllListeners();
  }
}

module.exports = AlertManager;
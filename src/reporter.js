'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);
const mkdir = promisify(fs.mkdir);

class Reporter {
  constructor(config) {
    this.config = config;
    this.reports = [];
    this.logFile = null;
    this.reportDir = path.join(process.cwd(), '.sentinel');
    
    this._initializeReporting();
  }
  
  async _initializeReporting() {
    if (this.config.reporting.file) {
      try {
        await mkdir(this.reportDir, { recursive: true });
        this.logFile = path.join(this.reportDir, `sentinel-${process.pid}-${Date.now()}.log`);
        await writeFile(this.logFile, `Sentinel Memory Monitor - Started at ${new Date().toISOString()}\n\n`);
      } catch (error) {
        console.error('Failed to initialize file reporting:', error.message);
      }
    }
  }
  
  async reportLeak(leak) {
    const report = this._formatLeakReport(leak);
    
    if (this.config.reporting.console) {
      this._consoleReport(report);
    }
    
    if (this.config.reporting.file && this.logFile) {
      await this._fileReport(report);
    }
    
    if (this.config.reporting.webhook) {
      await this._webhookReport(report);
    }
    
    this.reports.push(report);
  }
  
  async reportWarning(warning) {
    const report = this._formatWarningReport(warning);
    
    if (this.config.reporting.console) {
      console.warn('\x1b[33m[Sentinel Warning]\x1b[0m', report.message);
    }
    
    if (this.config.reporting.file && this.logFile) {
      await this._fileReport(report);
    }
  }
  
  _formatLeakReport(leak) {
    const report = {
      type: 'memory-leak',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      probability: leak.probability,
      factors: leak.factors,
      metrics: leak.metrics,
      recommendations: leak.recommendations,
      message: this._buildLeakMessage(leak)
    };
    
    return report;
  }
  
  _formatWarningReport(warning) {
    return {
      type: 'warning',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      warningType: warning.type,
      message: warning.message,
      details: warning
    };
  }
  
  _buildLeakMessage(leak) {
    const prob = Math.round(leak.probability * 100);
    const heap = (leak.metrics.heapUsed / 1024 / 1024).toFixed(2);
    
    let message = `Memory leak detected (${prob}% probability)\n`;
    message += `Heap: ${heap}MB | Factors: ${leak.factors.join(', ')}\n`;
    
    if (leak.recommendations.length > 0) {
      message += 'Recommendations:\n';
      leak.recommendations.forEach((rec, i) => {
        message += `  ${i + 1}. ${rec}\n`;
      });
    }
    
    return message;
  }
  
  _consoleReport(report) {
    const separator = '='.repeat(60);
    
    console.error('\x1b[31m%s\x1b[0m', separator);
    console.error('\x1b[31m[Sentinel Alert] Memory Leak Detected!\x1b[0m');
    console.error('\x1b[31m%s\x1b[0m', separator);
    
    console.error(`Timestamp: ${report.timestamp}`);
    console.error(`Probability: ${Math.round(report.probability * 100)}%`);
    console.error(`Heap Used: ${(report.metrics.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.error(`Factors: ${report.factors.join(', ')}`);
    
    if (report.recommendations.length > 0) {
      console.error('\nRecommendations:');
      report.recommendations.forEach((rec, i) => {
        console.error(`  ${i + 1}. ${rec}`);
      });
    }
    
    console.error('\x1b[31m%s\x1b[0m', separator);
  }
  
  async _fileReport(report) {
    try {
      const content = JSON.stringify(report, null, 2) + '\n\n';
      await appendFile(this.logFile, content);
    } catch (error) {
      console.error('Failed to write report to file:', error.message);
    }
  }
  
  async _webhookReport(report) {
    try {
      const webhookUrl = new URL(this.config.reporting.webhook);
      const data = JSON.stringify(report);
      
      const options = {
        hostname: webhookUrl.hostname,
        port: webhookUrl.port,
        path: webhookUrl.pathname + webhookUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'Sentinel/1.0'
        }
      };
      
      const client = webhookUrl.protocol === 'https:' ? https : http;
      
      await new Promise((resolve, reject) => {
        const req = client.request(options, (res) => {
          res.on('data', () => {}); // Consume response
          res.on('end', resolve);
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Webhook timeout'));
        });
        
        req.write(data);
        req.end();
      });
    } catch (error) {
      console.error('Failed to send webhook report:', error.message);
    }
  }
  
  async generateReport() {
    const summary = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      runtime: process.uptime(),
      totalReports: this.reports.length,
      leakReports: this.reports.filter(r => r.type === 'memory-leak').length,
      warningReports: this.reports.filter(r => r.type === 'warning').length,
      reports: this.reports
    };
    
    if (this.config.reporting.file) {
      const reportFile = path.join(this.reportDir, `sentinel-summary-${process.pid}-${Date.now()}.json`);
      await writeFile(reportFile, JSON.stringify(summary, null, 2));
      return reportFile;
    }
    
    return summary;
  }
  
  async flush() {
    // Ensure all pending reports are written
    if (this.logFile) {
      const summary = `\nSentinel monitoring ended at ${new Date().toISOString()}\n`;
      try {
        await appendFile(this.logFile, summary);
      } catch (error) {
        // Fallback to sync if async fails (e.g., during process shutdown)
        try {
          fs.appendFileSync(this.logFile, summary);
        } catch {
          // Ignore errors during shutdown
        }
      }
    }
  }
  
  configure(config) {
    this.config = config;
  }
  
  getReports() {
    return this.reports;
  }
  
  clearReports() {
    this.reports = [];
  }
  
  reset() {
    this.reports = [];
    this.metrics = [];
    if (this.logFile) {
      // Close current log file
      this.logFile = null;
    }
  }
}

module.exports = Reporter;
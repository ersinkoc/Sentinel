#!/usr/bin/env node
'use strict';

/**
 * Security Check Script for @oxog/sentinel
 * Performs comprehensive security validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityChecker {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.passed = [];
  }

  log(level, message, details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, details };
    
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    if (details) {
      console.log(`  Details: ${JSON.stringify(details, null, 2)}`);
    }

    switch (level) {
      case 'error':
        this.issues.push(logEntry);
        break;
      case 'warn':
        this.warnings.push(logEntry);
        break;
      case 'info':
        this.passed.push(logEntry);
        break;
    }
  }

  // Check for hardcoded secrets
  checkHardcodedSecrets() {
    this.log('info', 'Checking for hardcoded secrets...');
    
    const patterns = [
      /(?:password|pwd|pass)\s*[:=]\s*['"]\w+['"]/gi,
      /(?:secret|key|token)\s*[:=]\s*['"]\w+['"]/gi,
      /api[_-]?key\s*[:=]\s*['"]\w+['"]/gi,
      /(?:aws|s3)[_-]?(?:access|secret)[_-]?key/gi,
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi
    ];

    const filesToCheck = this.getJSFiles();
    let secretsFound = false;

    filesToCheck.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        patterns.forEach((pattern, index) => {
          const matches = content.match(pattern);
          if (matches) {
            secretsFound = true;
            this.log('error', `Potential secret found in ${file}`, {
              pattern: pattern.toString(),
              matches: matches.slice(0, 3) // Limit matches shown
            });
          }
        });
      } catch (error) {
        this.log('warn', `Could not read file: ${file}`, { error: error.message });
      }
    });

    if (!secretsFound) {
      this.log('info', 'No hardcoded secrets detected');
    }
  }

  // Check for vulnerable dependencies
  checkVulnerableDependencies() {
    this.log('info', 'Checking for vulnerable dependencies...');
    
    try {
      const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
      const audit = JSON.parse(auditResult);
      
      if (audit.vulnerabilities && Object.keys(audit.vulnerabilities).length > 0) {
        Object.entries(audit.vulnerabilities).forEach(([name, vuln]) => {
          const severity = vuln.severity;
          if (severity === 'high' || severity === 'critical') {
            this.log('error', `${severity.toUpperCase()} vulnerability in ${name}`, vuln);
          } else {
            this.log('warn', `${severity} vulnerability in ${name}`, vuln);
          }
        });
      } else {
        this.log('info', 'No vulnerable dependencies found');
      }
    } catch (error) {
      this.log('warn', 'Could not run npm audit', { error: error.message });
    }
  }

  // Check file permissions
  checkFilePermissions() {
    this.log('info', 'Checking file permissions...');
    
    const sensitiveFiles = [
      'package.json',
      'index.js',
      'src/',
      'bin/',
      '.env'
    ];

    sensitiveFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          const stats = fs.statSync(file);
          const mode = stats.mode.toString(8);
          
          // Check if file is world-writable
          if (mode.endsWith('2') || mode.endsWith('6')) {
            this.log('warn', `File ${file} is world-writable`, { permissions: mode });
          } else {
            this.log('info', `File ${file} has appropriate permissions`, { permissions: mode });
          }
        }
      } catch (error) {
        this.log('warn', `Could not check permissions for ${file}`, { error: error.message });
      }
    });
  }

  // Check for unsafe code patterns
  checkUnsafePatterns() {
    this.log('info', 'Checking for unsafe code patterns...');
    
    const unsafePatterns = [
      { pattern: /eval\s*\(/gi, description: 'Use of eval()' },
      { pattern: /Function\s*\(/gi, description: 'Use of Function constructor' },
      { pattern: /setTimeout\s*\(\s*['"`][^'"`]*['"`]/gi, description: 'setTimeout with string' },
      { pattern: /setInterval\s*\(\s*['"`][^'"`]*['"`]/gi, description: 'setInterval with string' },
      { pattern: /\.innerHTML\s*=/gi, description: 'Use of innerHTML assignment' },
      { pattern: /document\.write\s*\(/gi, description: 'Use of document.write' },
      { pattern: /process\.env\[\s*req\./gi, description: 'Dynamic environment variable access' }
    ];

    const filesToCheck = this.getJSFiles();
    let unsafePatternsFound = false;

    filesToCheck.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        unsafePatterns.forEach(({ pattern, description }) => {
          const matches = content.match(pattern);
          if (matches) {
            unsafePatternsFound = true;
            this.log('warn', `Unsafe pattern found in ${file}: ${description}`, {
              matches: matches.slice(0, 3)
            });
          }
        });
      } catch (error) {
        this.log('warn', `Could not analyze file: ${file}`, { error: error.message });
      }
    });

    if (!unsafePatternsFound) {
      this.log('info', 'No unsafe code patterns detected');
    }
  }

  // Check package.json security
  checkPackageJsonSecurity() {
    this.log('info', 'Checking package.json security...');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      // Check for scripts that might be dangerous
      if (packageJson.scripts) {
        Object.entries(packageJson.scripts).forEach(([name, script]) => {
          if (script.includes('rm -rf') || script.includes('del /s')) {
            this.log('warn', `Potentially dangerous script: ${name}`, { script });
          }
          if (script.includes('curl') || script.includes('wget')) {
            this.log('warn', `Script downloads content: ${name}`, { script });
          }
        });
      }

      // Check for repository URL
      if (!packageJson.repository || !packageJson.repository.url) {
        this.log('warn', 'No repository URL specified in package.json');
      } else {
        this.log('info', 'Repository URL is specified');
      }

      // Check for license
      if (!packageJson.license) {
        this.log('warn', 'No license specified in package.json');
      } else {
        this.log('info', `License specified: ${packageJson.license}`);
      }

    } catch (error) {
      this.log('error', 'Could not read package.json', { error: error.message });
    }
  }

  // Check for insecure dependencies
  checkInsecureDependencies() {
    this.log('info', 'Checking for known insecure dependencies...');
    
    const knownInsecurePackages = [
      'lodash',  // Check for specific versions
      'handlebars',
      'yargs-parser',
      'minimist',
      'node-forge'
    ];

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      knownInsecurePackages.forEach(pkg => {
        if (allDeps[pkg]) {
          this.log('warn', `Using package with known security issues: ${pkg}`, {
            version: allDeps[pkg],
            recommendation: 'Check for security advisories and update if needed'
          });
        }
      });

      this.log('info', 'Insecure dependency check completed');
    } catch (error) {
      this.log('error', 'Could not check dependencies', { error: error.message });
    }
  }

  // Get all JavaScript files in the project
  getJSFiles(dir = '.', files = []) {
    const ignorePatterns = [
      'node_modules',
      '.git',
      'coverage',
      'docs',
      'tmp',
      'temp'
    ];

    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !ignorePatterns.includes(item)) {
          this.getJSFiles(fullPath, files);
        } else if (stat.isFile() && item.endsWith('.js')) {
          files.push(fullPath);
        }
      });
    } catch (error) {
      // Ignore permission errors
    }

    return files;
  }

  // Generate security report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_issues: this.issues.length,
        total_warnings: this.warnings.length,
        total_passed: this.passed.length,
        security_score: this.calculateSecurityScore()
      },
      issues: this.issues,
      warnings: this.warnings,
      passed: this.passed
    };

    fs.writeFileSync('security-report.json', JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY ASSESSMENT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Issues Found: ${this.issues.length}`);
    console.log(`Warnings: ${this.warnings.length}`);
    console.log(`Tests Passed: ${this.passed.length}`);
    console.log(`Security Score: ${report.summary.security_score}/100`);
    console.log(`Report saved to: security-report.json`);
    console.log('='.repeat(60));

    return report.summary.security_score >= 80;
  }

  calculateSecurityScore() {
    const totalChecks = this.issues.length + this.warnings.length + this.passed.length;
    if (totalChecks === 0) return 100;

    const criticalWeight = 10;
    const warningWeight = 3;
    const passedWeight = 1;

    const totalWeight = (this.issues.length * criticalWeight) + 
                       (this.warnings.length * warningWeight) + 
                       (this.passed.length * passedWeight);

    const maxPossibleScore = totalChecks * passedWeight;
    const actualScore = this.passed.length * passedWeight;

    return Math.round((actualScore / maxPossibleScore) * 100);
  }

  // Run all security checks
  async runAllChecks() {
    console.log('🔒 Starting security assessment...\n');

    this.checkHardcodedSecrets();
    this.checkVulnerableDependencies();
    this.checkFilePermissions();
    this.checkUnsafePatterns();
    this.checkPackageJsonSecurity();
    this.checkInsecureDependencies();

    const passed = this.generateReport();
    
    if (!passed) {
      console.log('\n⚠️  Security assessment failed. Please review the issues above.');
      process.exit(1);
    } else {
      console.log('\n✅ Security assessment passed!');
      process.exit(0);
    }
  }
}

// Run security check if this script is executed directly
if (require.main === module) {
  const checker = new SecurityChecker();
  checker.runAllChecks().catch(console.error);
}

module.exports = SecurityChecker;
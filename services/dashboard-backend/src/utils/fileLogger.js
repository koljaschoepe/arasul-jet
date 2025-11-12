/**
 * Arasul Platform - File Logger Utility
 *
 * Centralized file logging with rotation support
 * Logs to /arasul/logs/ directory with structured format
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const LOG_DIR = process.env.LOG_DIR || '/arasul/logs';
const SERVICE_LOG_DIR = path.join(LOG_DIR, 'service');

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

// Current log level (can be set via env)
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

class FileLogger {
  /**
   * Create a new file logger
   * @param {string} logFile - Name of log file (e.g., 'system.log')
   * @param {object} options - Logger options
   */
  constructor(logFile, options = {}) {
    this.logFile = path.join(LOG_DIR, logFile);
    this.options = {
      includeTimestamp: true,
      includeLevel: true,
      includeSource: true,
      jsonFormat: false,
      ...options
    };

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directories exist
   */
  ensureLogDirectory() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o755 });
      }
      if (!fs.existsSync(SERVICE_LOG_DIR)) {
        fs.mkdirSync(SERVICE_LOG_DIR, { recursive: true, mode: 0o755 });
      }
    } catch (err) {
      console.error('Failed to create log directory:', err);
    }
  }

  /**
   * Format log message
   */
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();

    if (this.options.jsonFormat) {
      // JSON format for structured logging
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...metadata,
        service: 'dashboard-backend',
        pid: process.pid
      });
    } else {
      // Human-readable format
      let formatted = '';

      if (this.options.includeTimestamp) {
        formatted += `[${timestamp}] `;
      }

      if (this.options.includeLevel) {
        formatted += `[${level.toUpperCase()}] `;
      }

      if (this.options.includeSource && metadata.source) {
        formatted += `[${metadata.source}] `;
      }

      formatted += message;

      // Add metadata if present
      if (Object.keys(metadata).length > 0) {
        const metaCopy = { ...metadata };
        delete metaCopy.source; // Already included above
        if (Object.keys(metaCopy).length > 0) {
          formatted += ` ${JSON.stringify(metaCopy)}`;
        }
      }

      return formatted;
    }
  }

  /**
   * Write to log file
   */
  writeLog(level, message, metadata = {}) {
    // Check log level
    if (LOG_LEVELS[level.toUpperCase()] < CURRENT_LOG_LEVEL) {
      return; // Skip logs below current level
    }

    const formattedMessage = this.formatMessage(level, message, metadata);

    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n', { mode: 0o644 });
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  /**
   * Log methods
   */
  debug(message, metadata) {
    this.writeLog('debug', message, metadata);
  }

  info(message, metadata) {
    this.writeLog('info', message, metadata);
  }

  warn(message, metadata) {
    this.writeLog('warn', message, metadata);
  }

  error(message, metadata) {
    this.writeLog('error', message, metadata);
  }

  critical(message, metadata) {
    this.writeLog('critical', message, metadata);
  }
}

/**
 * System Logger - General system events
 */
class SystemLogger extends FileLogger {
  constructor() {
    super('system.log', { includeSource: true });
  }

  serverStart(port) {
    this.info(`Server started on port ${port}`, { source: 'server', port });
  }

  serverStop() {
    this.info('Server stopped', { source: 'server' });
  }

  apiRequest(method, path, statusCode, duration) {
    this.info(`${method} ${path} ${statusCode} ${duration}ms`, {
      source: 'api',
      method,
      path,
      statusCode,
      duration
    });
  }

  apiError(method, path, error) {
    this.error(`${method} ${path} - ${error.message}`, {
      source: 'api',
      method,
      path,
      error: error.message,
      stack: error.stack
    });
  }

  dbConnection(status) {
    this.info(`Database connection ${status}`, {
      source: 'database',
      status
    });
  }

  dbError(error) {
    this.error(`Database error: ${error.message}`, {
      source: 'database',
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Self-Healing Logger - Self-healing events
 */
class SelfHealingLogger extends FileLogger {
  constructor() {
    super('self_healing.log', { jsonFormat: true });
  }

  event(eventType, severity, description, actionTaken, metadata = {}) {
    this.writeLog('info', description, {
      eventType,
      severity,
      actionTaken,
      ...metadata
    });
  }

  serviceRestart(serviceName, reason) {
    this.event(
      'service_restart',
      'WARNING',
      `Restarting service: ${serviceName}`,
      `Service restart initiated`,
      { serviceName, reason }
    );
  }

  resourceWarning(resourceType, currentValue, threshold) {
    this.event(
      'resource_warning',
      'WARNING',
      `${resourceType} usage at ${currentValue}% (threshold: ${threshold}%)`,
      'Monitoring',
      { resourceType, currentValue, threshold }
    );
  }

  criticalError(description, metadata) {
    this.event(
      'critical_error',
      'CRITICAL',
      description,
      'System alert triggered',
      metadata
    );
  }

  recoverySuccess(serviceName, duration) {
    this.event(
      'recovery_success',
      'INFO',
      `Service ${serviceName} recovered successfully`,
      `Recovery completed in ${duration}ms`,
      { serviceName, duration }
    );
  }
}

/**
 * Update Logger - System updates
 */
class UpdateLogger extends FileLogger {
  constructor() {
    super('update.log', { includeSource: true });
  }

  uploadStarted(filename, size) {
    this.info(`Update upload started: ${filename} (${size} bytes)`, {
      source: 'upload',
      filename,
      size
    });
  }

  uploadCompleted(filename, duration) {
    this.info(`Update upload completed: ${filename} (${duration}ms)`, {
      source: 'upload',
      filename,
      duration
    });
  }

  validationStarted(filename) {
    this.info(`Validating update package: ${filename}`, {
      source: 'validation',
      filename
    });
  }

  validationPassed(filename, version) {
    this.info(`Validation passed: ${filename} (version ${version})`, {
      source: 'validation',
      filename,
      version
    });
  }

  validationFailed(filename, reason) {
    this.error(`Validation failed: ${filename} - ${reason}`, {
      source: 'validation',
      filename,
      reason
    });
  }

  applyStarted(version) {
    this.info(`Applying update to version ${version}`, {
      source: 'apply',
      version
    });
  }

  applyStep(step, description) {
    this.info(`Update step: ${step} - ${description}`, {
      source: 'apply',
      step,
      description
    });
  }

  applyCompleted(version, duration) {
    this.info(`Update completed: version ${version} (${duration}ms)`, {
      source: 'apply',
      version,
      duration
    });
  }

  applyFailed(version, error) {
    this.error(`Update failed: version ${version} - ${error}`, {
      source: 'apply',
      version,
      error
    });
  }

  rollbackStarted(fromVersion, toVersion) {
    this.warn(`Rollback initiated: ${fromVersion} → ${toVersion}`, {
      source: 'rollback',
      fromVersion,
      toVersion
    });
  }

  rollbackCompleted(version) {
    this.info(`Rollback completed: reverted to ${version}`, {
      source: 'rollback',
      version
    });
  }
}

/**
 * Service Logger - Per-service logging
 */
class ServiceLogger extends FileLogger {
  constructor(serviceName) {
    super(path.join('service', `${serviceName}.log`), { includeSource: false });
    this.serviceName = serviceName;
  }

  logWithService(level, message, metadata = {}) {
    this.writeLog(level, message, {
      service: this.serviceName,
      ...metadata
    });
  }

  info(message, metadata) {
    this.logWithService('info', message, metadata);
  }

  warn(message, metadata) {
    this.logWithService('warn', message, metadata);
  }

  error(message, metadata) {
    this.logWithService('error', message, metadata);
  }
}

// Singleton instances
const systemLogger = new SystemLogger();
const selfHealingLogger = new SelfHealingLogger();
const updateLogger = new UpdateLogger();

// Export logger instances and classes
module.exports = {
  FileLogger,
  SystemLogger,
  SelfHealingLogger,
  UpdateLogger,
  ServiceLogger,
  systemLogger,
  selfHealingLogger,
  updateLogger,
  LOG_LEVELS,
  createServiceLogger: (serviceName) => new ServiceLogger(serviceName)
};

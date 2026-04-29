/**
 * Winston logger configuration
 *
 * Console transport always-on. File transport via winston-daily-rotate-file
 * is enabled by default in non-test envs and writes to LOG_DIR (default
 * /app/logs, mounted as host volume in compose). Two streams:
 *   - backend-YYYY-MM-DD.log       — all levels
 *   - backend-error-YYYY-MM-DD.log — errors only
 *
 * Retention via LOG_RETENTION_DAYS (default 14d), per-file cap via
 * LOG_MAX_SIZE (default 50m). Rotated files are gzip-compressed.
 *
 * In Jest (NODE_ENV=test) file transport is auto-disabled so the test
 * runner doesn't pollute the host. Force-enable via LOG_FILE_ENABLED=true.
 */

const winston = require('winston');
require('winston-daily-rotate-file');

const isTest = process.env.NODE_ENV === 'test';
const logDir = process.env.LOG_DIR || '/app/logs';
const logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '14', 10);
const logMaxSize = process.env.LOG_MAX_SIZE || '50m';

const logFileEnabled =
  typeof process.env.LOG_FILE_ENABLED === 'string'
    ? process.env.LOG_FILE_ENABLED.toLowerCase() === 'true'
    : !isTest;

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, service }) => {
        return `${timestamp} [${service}] ${level}: ${message}`;
      })
    ),
  }),
];

if (logFileEnabled) {
  const rotateOpts = {
    dirname: logDir,
    datePattern: 'YYYY-MM-DD',
    maxFiles: `${logRetentionDays}d`,
    maxSize: logMaxSize,
    zippedArchive: true,
  };
  transports.push(
    new winston.transports.DailyRotateFile({
      ...rotateOpts,
      filename: 'backend-%DATE%.log',
    }),
    new winston.transports.DailyRotateFile({
      ...rotateOpts,
      filename: 'backend-error-%DATE%.log',
      level: 'error',
    })
  );
}

const logger = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'dashboard-backend' },
  transports,
});

module.exports = logger;

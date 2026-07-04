/**
 * PostgreSQL database connection with advanced pooling and monitoring
 */

const { Pool } = require('pg');
const logger = require('./utils/logger');
const { retryDatabaseQuery } = require('./utils/retry');

// Validate required database credentials
if (!process.env.POSTGRES_PASSWORD) {
  logger.error('FATAL: POSTGRES_PASSWORD environment variable is not set');
  logger.error('Run ./arasul bootstrap or set POSTGRES_PASSWORD in /arasul/config/.env');
  process.exit(1);
}

// Pool configuration with advanced settings
const poolConfig = {
  host: process.env.POSTGRES_HOST || 'postgres-db',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'arasul',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'arasul_db',

  // Pool size configuration
  max: parseInt(process.env.POSTGRES_POOL_MAX || '20'),
  min: parseInt(process.env.POSTGRES_POOL_MIN || '2'),

  // Timeout configuration (POOL-001: reduced connection timeout for faster fail)
  idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '5000'),

  // POOL-002: Long-running connection recycling (prevents stale connections over months of uptime)
  maxUses: 7500, // Recycle connection after 7500 queries
  maxLifetimeMillis: 3600000, // Recycle connection after 60 minutes

  // Application name for PostgreSQL monitoring
  application_name: 'arasul-dashboard-backend',

  // Keep connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Pool statistics tracking
const poolStats = {
  totalConnections: 0,
  totalQueries: 0,
  totalErrors: 0,
  slowQueries: 0,
  connectionErrors: 0,
  queryErrors: 0,
  leakWarnings: 0,
  startTime: Date.now(),
};

// POOL-001: Connection leak detection - track checked-out connections
const checkedOutConnections = new Map(); // client → { acquiredAt, stack }
const LEAK_WARN_MS = 60000; // Warn if connection checked out > 60s

// Event: New connection established
// BUG-005 FIX: Handle promise rejections from client.query()
pool.on('connect', async client => {
  poolStats.totalConnections++;
  logger.debug(`New database connection established (total: ${poolStats.totalConnections})`);

  // Set client encoding, timezone, and statement timeout
  try {
    await client.query('SET client_encoding TO UTF8');
    await client.query('SET timezone TO UTC');
    await client.query(
      `SET statement_timeout = ${process.env.POSTGRES_STATEMENT_TIMEOUT || '30000'}`
    );
  } catch (err) {
    logger.error('Error setting up client connection:', err);
    // Connection will still be usable, just without these settings
  }
});

// Event: Connection error
pool.on('error', (err, client) => {
  poolStats.totalErrors++;
  poolStats.connectionErrors++;
  logger.error(`Unexpected database pool error: ${err.message}`, {
    code: err.code,
    severity: err.severity,
    stack: err.stack,
  });
});

// Event: Connection removed from pool
pool.on('remove', client => {
  checkedOutConnections.delete(client);
  logger.debug('Database connection removed from pool');
});

// Event: Connection released back to pool
// LEAK-FIX: previous code only listened for 'connect'/'remove' which fire on
// physical socket lifecycle, not on logical pool checkout/checkin. Without
// this 'release' handler, every successful db.query() left the client in the
// checkedOutConnections Map forever, producing endless false-positive
// "Possible connection leak" warnings as the idle clock kept ticking.
pool.on('release', (_err, client) => {
  checkedOutConnections.delete(client);
});

// Event: Connection acquired from pool
// PERFORMANCE FIX: Warn when pool utilization is high
pool.on('acquire', client => {
  // POOL-001: Track checkout time for leak detection
  checkedOutConnections.set(client, { acquiredAt: Date.now() });

  const utilization = pool.totalCount / poolConfig.max;
  if (utilization >= 0.8) {
    logger.warn(
      `Database pool utilization high: ${pool.totalCount}/${poolConfig.max} (${(utilization * 100).toFixed(0)}%)`
    );
  }
  if (pool.waitingCount >= 5) {
    logger.error(`Database connections waiting in queue: ${pool.waitingCount}`);
  }
  logger.debug('Database connection acquired from pool');
});

// POOL-001: Periodic leak detection (every 30s)
const leakCheckInterval = setInterval(() => {
  const now = Date.now();
  for (const [client, info] of checkedOutConnections) {
    const elapsed = now - info.acquiredAt;
    if (elapsed > LEAK_WARN_MS) {
      poolStats.leakWarnings++;
      logger.warn(
        `Possible connection leak: connection checked out for ${Math.round(elapsed / 1000)}s`
      );
    }
  }
}, 30000);
// Don't let this monitoring timer keep the process (or a Jest worker) alive —
// it's a background nicety, not a reason to block a graceful shutdown.
leakCheckInterval.unref();

async function initialize() {
  return retryDatabaseQuery(
    async () => {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      logger.info(`Database connected at ${result.rows[0].now}`);
      client.release();
    },
    {
      maxAttempts: 10,
      initialDelay: 2000,
      maxDelay: 10000,
      onRetry: (attempt, error, delay) => {
        logger.warn(
          `Database initialization attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`
        );
      },
    }
  );
}

// Conservatively decide whether a statement is safe to re-run after an
// AMBIGUOUS connection drop (one that may have occurred after the server already
// executed the statement). Only plain read statements qualify. Anything that
// could have a side effect — writes, DDL, or a SELECT that calls a function
// (e.g. `SELECT record_login_attempt(...)`) — is treated as non-idempotent.
function isStatementReadOnly(text) {
  if (typeof text !== 'string') {
    return false;
  }
  const startsRead = /^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(?:select|show|explain)\b/i.test(text);
  const hasWriteKeyword =
    /\b(insert|update|delete|merge|call|create|alter|drop|truncate|grant|revoke|nextval|setval|into)\b/i.test(
      text
    );
  // `SELECT some_func(...)` may have side effects — exclude it.
  const callsFunction = /\bselect\s+[a-z_][\w.]*\s*\(/i.test(text);
  return startsRead && !hasWriteKeyword && !callsFunction;
}

/**
 * Run a query with connection-failure retries.
 * @param {string} text - SQL
 * @param {Array} [params]
 * @param {object} [options]
 * @param {boolean} [options.retryable] - Explicit opt-in/out for retrying after an
 *   ambiguous mid-flight connection drop. Defaults to a conservative read-only
 *   heuristic. Set `true` for idempotent writes, `false` to force no such retry.
 */
async function query(text, params, options = {}) {
  const start = Date.now();
  poolStats.totalQueries++;

  // POOL-001: Fast-fail when pool is saturated (prevents cascading hangs)
  if (pool.waitingCount > 10) {
    const err = new Error('Database pool saturated - too many waiting connections');
    err.statusCode = 503;
    throw err;
  }

  const retryAmbiguous = options.retryable ?? isStatementReadOnly(text);

  return retryDatabaseQuery(
    async () => {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;

      // Track slow queries (>1 second)
      if (duration > 1000) {
        poolStats.slowQueries++;
        logger.warn(`Slow query detected (${duration}ms): ${text.substring(0, 100)}`);
      } else {
        logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 100)}`);
      }

      return res;
    },
    {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 5000,
      // Split retryable errors into "query never reached the server" (always safe)
      // vs. "connection dropped mid-flight" (only safe for idempotent/read-only
      // statements — otherwise a committed write could be silently duplicated).
      shouldRetry: error => {
        const preExecutionCodes = [
          'ECONNREFUSED',
          'ETIMEDOUT',
          'ENOTFOUND',
          '57P03', // cannot_connect_now
          '08006', // connection_failure
          '08001', // unable_to_establish_sqlconnection
          '08003', // connection_does_not_exist
          '08000', // connection_exception
        ];
        if (preExecutionCodes.includes(error.code)) {
          return true;
        }

        const ambiguous =
          error.code === 'ECONNRESET' ||
          error.message?.includes('Connection terminated') ||
          error.message?.includes('Connection lost');
        if (ambiguous) {
          return retryAmbiguous;
        }

        return false;
      },
      onRetry: (attempt, error, delay) => {
        poolStats.queryErrors++;
        logger.warn(`Query retry ${attempt}: ${error.message}`);
      },
    }
  );
}

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Async function that receives a client
 * @returns {Promise} Result of the transaction
 * BUG-010 FIX: Improved error handling for transaction rollback
 */
async function transaction(callback) {
  let client;

  try {
    client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // BUG-010 FIX: Only attempt ROLLBACK if client is defined
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error(`Rollback failed: ${rollbackError.message}`);
        }
      }
      logger.error(`Transaction rolled back: ${error.message}`);
      throw error;
    }
  } finally {
    // BUG-010 FIX: Only release client if it was successfully acquired
    if (client) {
      checkedOutConnections.delete(client);
      client.release();
    }
  }
}

/**
 * Get pool statistics
 * @returns {Object} Current pool statistics
 */
function getPoolStats() {
  const uptimeSeconds = Math.floor((Date.now() - poolStats.startTime) / 1000);

  return {
    // Current pool state
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,

    // Configuration
    maxConnections: poolConfig.max,
    minConnections: poolConfig.min,
    idleTimeoutMs: poolConfig.idleTimeoutMillis,
    connectionTimeoutMs: poolConfig.connectionTimeoutMillis,

    // Statistics
    totalConnections: poolStats.totalConnections,
    totalQueries: poolStats.totalQueries,
    totalErrors: poolStats.totalErrors,
    slowQueries: poolStats.slowQueries,
    connectionErrors: poolStats.connectionErrors,
    queryErrors: poolStats.queryErrors,
    leakWarnings: poolStats.leakWarnings,

    // Performance metrics
    queriesPerSecond: uptimeSeconds > 0 ? (poolStats.totalQueries / uptimeSeconds).toFixed(2) : 0,
    errorRate:
      poolStats.totalQueries > 0
        ? ((poolStats.queryErrors / poolStats.totalQueries) * 100).toFixed(2) + '%'
        : '0%',

    // Health indicators
    poolUtilization:
      poolConfig.max > 0 ? ((pool.totalCount / poolConfig.max) * 100).toFixed(2) + '%' : '0%',

    uptimeSeconds: uptimeSeconds,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check pool health
 * @returns {Promise<Object>} Health check result
 */
async function healthCheck() {
  const start = Date.now();

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as health');
    client.release();

    const latency = Date.now() - start;

    return {
      healthy: true,
      latency: latency,
      poolStats: getPoolStats(),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Database health check failed: ${error.message}`);
    return {
      healthy: false,
      error: error.message,
      poolStats: getPoolStats(),
      timestamp: new Date().toISOString(),
    };
  }
}

async function close() {
  clearInterval(leakCheckInterval);
  checkedOutConnections.clear();
  await pool.end();
  logger.info('Database pool closed');
}

module.exports = {
  initialize,
  query,
  transaction,
  getPoolStats,
  healthCheck,
  close,
  pool,
  // Exported for unit testing of the retry-safety heuristic.
  isStatementReadOnly,
};

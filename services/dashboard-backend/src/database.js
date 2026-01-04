/**
 * PostgreSQL database connection with advanced pooling and monitoring
 */

const { Pool } = require('pg');
const logger = require('./utils/logger');
const { retryDatabaseQuery } = require('./utils/retry');

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

    // Timeout configuration
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '10000'),

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
    startTime: Date.now()
};

// Event: New connection established
// BUG-005 FIX: Handle promise rejections from client.query()
pool.on('connect', async (client) => {
    poolStats.totalConnections++;
    logger.debug(`New database connection established (total: ${poolStats.totalConnections})`);

    // Set client encoding, timezone, and statement timeout
    try {
        await client.query('SET client_encoding TO UTF8');
        await client.query('SET timezone TO UTC');
        await client.query(`SET statement_timeout = ${process.env.POSTGRES_STATEMENT_TIMEOUT || '30000'}`);
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
        stack: err.stack
    });
});

// Event: Connection removed from pool
pool.on('remove', (client) => {
    logger.debug('Database connection removed from pool');
});

// Event: Connection acquired from pool
// PERFORMANCE FIX: Warn when pool utilization is high
pool.on('acquire', (client) => {
    const utilization = pool.totalCount / poolConfig.max;
    if (utilization >= 0.8) {
        logger.warn(`Database pool utilization high: ${pool.totalCount}/${poolConfig.max} (${(utilization * 100).toFixed(0)}%)`);
    }
    if (pool.waitingCount >= 5) {
        logger.error(`Database connections waiting in queue: ${pool.waitingCount}`);
    }
    logger.debug('Database connection acquired from pool');
});

async function initialize() {
    return retryDatabaseQuery(async () => {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        logger.info(`Database connected at ${result.rows[0].now}`);
        client.release();
    }, {
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 10000,
        onRetry: (attempt, error, delay) => {
            logger.warn(`Database initialization attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        }
    });
}

async function query(text, params) {
    const start = Date.now();
    poolStats.totalQueries++;

    return retryDatabaseQuery(async () => {
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
    }, {
        maxAttempts: 3,
        initialDelay: 500,
        maxDelay: 5000,
        onRetry: (attempt, error, delay) => {
            poolStats.queryErrors++;
            logger.warn(`Query retry ${attempt}: ${error.message}`);
        }
    });
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

        // Performance metrics
        queriesPerSecond: uptimeSeconds > 0 ? (poolStats.totalQueries / uptimeSeconds).toFixed(2) : 0,
        errorRate: poolStats.totalQueries > 0
            ? ((poolStats.queryErrors / poolStats.totalQueries) * 100).toFixed(2) + '%'
            : '0%',

        // Health indicators
        poolUtilization: poolConfig.max > 0
            ? ((pool.totalCount / poolConfig.max) * 100).toFixed(2) + '%'
            : '0%',

        uptimeSeconds: uptimeSeconds,
        timestamp: new Date().toISOString()
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
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error(`Database health check failed: ${error.message}`);
        return {
            healthy: false,
            error: error.message,
            poolStats: getPoolStats(),
            timestamp: new Date().toISOString()
        };
    }
}

async function close() {
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
    pool
};

/**
 * Data Database Connection Pool
 * Separate connection for arasul_data_db (user-created dynamic tables)
 */

const { Pool } = require('pg');
const logger = require('./utils/logger');
const { retryDatabaseQuery } = require('./utils/retry');

// Pool configuration for data database
const poolConfig = {
    host: process.env.ARASUL_DATA_DB_HOST || 'postgres-db',
    port: parseInt(process.env.ARASUL_DATA_DB_PORT || '5432'),
    user: process.env.ARASUL_DATA_DB_USER || 'arasul_data',
    password: process.env.ARASUL_DATA_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.ARASUL_DATA_DB_NAME || 'arasul_data_db',

    // Smaller pool for data database (less frequent access)
    max: parseInt(process.env.DATA_DB_POOL_MAX || '10'),
    min: parseInt(process.env.DATA_DB_POOL_MIN || '1'),

    // Timeout configuration
    idleTimeoutMillis: parseInt(process.env.DATA_DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DATA_DB_CONNECTION_TIMEOUT || '10000'),

    // Application name for PostgreSQL monitoring
    application_name: 'arasul-datentabellen',

    // Keep connections alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
};

let pool = null;
let initialized = false;

// Pool statistics
const poolStats = {
    totalConnections: 0,
    totalQueries: 0,
    totalErrors: 0,
    slowQueries: 0,
    startTime: null
};

/**
 * Initialize the data database connection pool
 * Call this during application startup
 */
async function initialize() {
    if (initialized) {
        logger.debug('[DataDB] Already initialized');
        return true;
    }

    try {
        pool = new Pool(poolConfig);
        poolStats.startTime = Date.now();

        // Event handlers
        pool.on('connect', async (client) => {
            poolStats.totalConnections++;
            logger.debug(`[DataDB] New connection (total: ${poolStats.totalConnections})`);

            try {
                await client.query('SET client_encoding TO UTF8');
                await client.query('SET timezone TO UTC');
            } catch (err) {
                logger.warn('[DataDB] Error setting up client connection:', err.message);
            }
        });

        pool.on('error', (err) => {
            poolStats.totalErrors++;
            logger.error(`[DataDB] Pool error: ${err.message}`);
        });

        pool.on('remove', () => {
            logger.debug('[DataDB] Connection removed from pool');
        });

        // Test connection
        await retryDatabaseQuery(async () => {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW() as time, current_database() as db');
            logger.info(`[DataDB] Connected to ${result.rows[0].db} at ${result.rows[0].time}`);
            client.release();
        }, {
            maxAttempts: 5,
            initialDelay: 2000,
            maxDelay: 10000,
            onRetry: (attempt, error, delay) => {
                logger.warn(`[DataDB] Connection attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
            }
        });

        initialized = true;
        return true;
    } catch (error) {
        logger.error(`[DataDB] Failed to initialize: ${error.message}`);
        return false;
    }
}

/**
 * Execute a query on the data database
 */
async function query(text, params) {
    if (!initialized || !pool) {
        throw new Error('Data database not initialized. Call initialize() first.');
    }

    const start = Date.now();
    poolStats.totalQueries++;

    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;

        if (duration > 1000) {
            poolStats.slowQueries++;
            logger.warn(`[DataDB] Slow query (${duration}ms): ${text.substring(0, 100)}`);
        } else {
            logger.debug(`[DataDB] Query (${duration}ms): ${text.substring(0, 80)}`);
        }

        return res;
    } catch (error) {
        poolStats.totalErrors++;
        logger.error(`[DataDB] Query error: ${error.message}`, { query: text.substring(0, 100) });
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
    if (!initialized || !pool) {
        throw new Error('Data database not initialized. Call initialize() first.');
    }
    return pool.connect();
}

/**
 * Execute a transaction
 * @param {Function} callback - Async function receiving client
 */
async function transaction(callback) {
    const client = await getClient();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            logger.error(`[DataDB] Rollback failed: ${rollbackError.message}`);
        }
        logger.error(`[DataDB] Transaction rolled back: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check if initialized
 */
function isInitialized() {
    return initialized;
}

/**
 * Get pool statistics
 */
function getPoolStats() {
    if (!pool) {
        return { initialized: false };
    }

    const uptimeSeconds = poolStats.startTime
        ? Math.floor((Date.now() - poolStats.startTime) / 1000)
        : 0;

    return {
        initialized,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        maxConnections: poolConfig.max,
        totalConnections: poolStats.totalConnections,
        totalQueries: poolStats.totalQueries,
        totalErrors: poolStats.totalErrors,
        slowQueries: poolStats.slowQueries,
        uptimeSeconds,
        timestamp: new Date().toISOString()
    };
}

/**
 * Health check
 */
async function healthCheck() {
    if (!initialized || !pool) {
        return { healthy: false, error: 'Not initialized' };
    }

    const start = Date.now();

    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        return {
            healthy: true,
            latency: Date.now() - start,
            stats: getPoolStats(),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message,
            stats: getPoolStats(),
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Close the pool
 */
async function close() {
    if (pool) {
        await pool.end();
        initialized = false;
        logger.info('[DataDB] Pool closed');
    }
}

module.exports = {
    initialize,
    query,
    getClient,
    transaction,
    isInitialized,
    getPoolStats,
    healthCheck,
    close
};

/**
 * Database connection pool monitoring routes
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/database/pool - Get connection pool statistics
router.get('/pool', requireAuth, asyncHandler(async (req, res) => {
    const stats = db.getPoolStats();

    res.json({
        status: 'success',
        pool_stats: stats,
        timestamp: new Date().toISOString()
    });
}));

// GET /api/database/health - Database health check with pool status
router.get('/health', requireAuth, asyncHandler(async (req, res) => {
    const healthResult = await db.healthCheck();

    const status = healthResult.healthy ? 200 : 503;

    res.status(status).json({
        status: healthResult.healthy ? 'healthy' : 'unhealthy',
        latency_ms: healthResult.latency,
        pool_stats: healthResult.poolStats,
        error: healthResult.error || null,
        timestamp: healthResult.timestamp
    });
}));

// GET /api/database/connections - Get PostgreSQL connection information
router.get('/connections', requireAuth, asyncHandler(async (req, res) => {
    // Query PostgreSQL for current connections
    const query = `
        SELECT
            COUNT(*) as total_connections,
            COUNT(*) FILTER (WHERE state = 'active') as active_connections,
            COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
            COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
            COUNT(*) FILTER (WHERE application_name LIKE 'arasul-%') as arasul_connections
        FROM pg_stat_activity
        WHERE datname = $1
    `;

    const result = await db.query(query, [process.env.POSTGRES_DB || 'arasul_db']);
    const connections = result.rows[0];

    // Get max_connections setting
    const maxConnQuery = await db.query('SHOW max_connections');
    const maxConnections = parseInt(maxConnQuery.rows[0].max_connections);

    // Calculate connection usage
    const connectionUsage = ((connections.total_connections / maxConnections) * 100).toFixed(2);

    res.json({
        status: 'success',
        database: process.env.POSTGRES_DB || 'arasul_db',
        connections: {
            total: parseInt(connections.total_connections),
            active: parseInt(connections.active_connections),
            idle: parseInt(connections.idle_connections),
            idle_in_transaction: parseInt(connections.idle_in_transaction),
            arasul_apps: parseInt(connections.arasul_connections)
        },
        limits: {
            max_connections: maxConnections,
            usage_percent: connectionUsage + '%'
        },
        pool_stats: db.getPoolStats(),
        timestamp: new Date().toISOString()
    });
}));

// GET /api/database/queries - Get slow query statistics
router.get('/queries', requireAuth, asyncHandler(async (req, res) => {
    // Get slow queries from pg_stat_statements if available
    const extensionCheck = await db.query(`
        SELECT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
        ) as has_extension
    `);

    const hasExtension = extensionCheck.rows[0].has_extension;

    let slowQueries = [];
    if (hasExtension) {
        const slowQueryResult = await db.query(`
            SELECT
                query,
                calls,
                ROUND(total_exec_time::numeric, 2) as total_time_ms,
                ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
                ROUND(max_exec_time::numeric, 2) as max_time_ms
            FROM pg_stat_statements
            WHERE mean_exec_time > 100
            ORDER BY mean_exec_time DESC
            LIMIT 10
        `);

        slowQueries = slowQueryResult.rows.map(row => ({
            query: row.query.substring(0, 200),
            calls: parseInt(row.calls),
            total_time_ms: parseFloat(row.total_time_ms),
            mean_time_ms: parseFloat(row.mean_time_ms),
            max_time_ms: parseFloat(row.max_time_ms)
        }));
    }

    const poolStats = db.getPoolStats();

    res.json({
        status: 'success',
        pg_stat_statements_enabled: hasExtension,
        slow_queries: slowQueries,
        pool_slow_queries: poolStats.slowQueries,
        pool_total_queries: poolStats.totalQueries,
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

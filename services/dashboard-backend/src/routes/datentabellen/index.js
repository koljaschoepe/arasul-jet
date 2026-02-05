/**
 * Datentabellen Routes Index
 * Combines all datentabellen-related routes
 */

const express = require('express');
const router = express.Router();
const tablesRouter = require('./tables');
const rowsRouter = require('./rows');
const quotesRouter = require('./quotes');
const dataDb = require('../../dataDatabase');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');
const logger = require('../../utils/logger');

/**
 * Middleware: Check if data database is initialized
 * Returns 503 Service Unavailable if not ready
 */
const checkDataDbInitialized = (req, res, next) => {
    if (!dataDb.isInitialized()) {
        logger.warn(`[Datentabellen] Request to ${req.path} rejected - database not initialized`);
        return res.status(503).json({
            success: false,
            error: 'Datendatenbank wird initialisiert. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
            code: 'DATA_DB_NOT_INITIALIZED',
            timestamp: new Date().toISOString()
        });
    }
    next();
};

// Apply initialization check to ALL datentabellen routes
router.use(checkDataDbInitialized);

// Mount sub-routers
router.use('/tables', tablesRouter);
router.use('/tables', rowsRouter); // rows are under /tables/:slug/rows
router.use('/quotes', quotesRouter);

/**
 * GET /api/v1/datentabellen/health
 * Health check for data database
 */
router.get('/health', requireAuth, asyncHandler(async (req, res) => {
    const health = await dataDb.healthCheck();

    res.json({
        success: health.healthy,
        data: health,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/stats
 * Get overview statistics
 */
router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
    if (!dataDb.isInitialized()) {
        return res.json({
            success: false,
            error: 'Datenbank nicht initialisiert',
            timestamp: new Date().toISOString()
        });
    }

    // Get table count
    const tablesResult = await dataDb.query('SELECT COUNT(*)::int as count FROM dt_tables');

    // Get total row count across all tables
    const tableListResult = await dataDb.query('SELECT slug FROM dt_tables');
    let totalRows = 0;
    for (const table of tableListResult.rows) {
        try {
            const rowCountResult = await dataDb.query(`SELECT COUNT(*)::int as count FROM data_${table.slug}`);
            totalRows += rowCountResult.rows[0].count;
        } catch (err) {
            // Table might not exist yet
        }
    }

    // Get quote stats
    const quoteStatsResult = await dataDb.query(`
        SELECT
            COUNT(*)::int as total_quotes,
            COUNT(*) FILTER (WHERE status = 'draft')::int as draft_quotes,
            COUNT(*) FILTER (WHERE status = 'sent')::int as sent_quotes,
            COUNT(*) FILTER (WHERE status = 'accepted')::int as accepted_quotes,
            COALESCE(SUM(total) FILTER (WHERE status = 'accepted'), 0)::numeric as accepted_value
        FROM dt_quotes
    `);

    res.json({
        success: true,
        data: {
            tables: tablesResult.rows[0].count,
            total_rows: totalRows,
            quotes: quoteStatsResult.rows[0]
        },
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

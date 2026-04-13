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
const llmDataAccess = require('../../services/context/llmDataAccessService');
const { isValidSlug, escapeTableName } = require('../../utils/sqlIdentifier');
const { ValidationError } = require('../../utils/errors');
const indexingService = require('../../services/datentabellen/indexingService');

/**
 * Middleware: Check if data database is initialized
 * Attempts lazy re-initialization with cooldown if not ready
 */
let lastRetryAt = 0;
const RETRY_COOLDOWN_MS = 30000; // 30s between retry attempts

const checkDataDbInitialized = async (req, res, next) => {
  if (dataDb.isInitialized()) {
    return next();
  }

  // Attempt lazy re-initialization (max once per cooldown period)
  const now = Date.now();
  if (now - lastRetryAt > RETRY_COOLDOWN_MS) {
    lastRetryAt = now;
    logger.info('[Datentabellen] Attempting lazy re-initialization of data database...');
    const success = await dataDb.initialize();
    if (success) {
      logger.info('[Datentabellen] Lazy re-initialization successful');
      return next();
    }
  }

  const retryAfter = Math.max(0, Math.ceil((RETRY_COOLDOWN_MS - (now - lastRetryAt)) / 1000));
  logger.warn(`[Datentabellen] Request to ${req.path} rejected - database not initialized`);
  return res.status(503).json({
    success: false,
    error:
      'Datendatenbank wird initialisiert. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
    code: 'DATA_DB_NOT_INITIALIZED',
    retryAfter,
    timestamp: new Date().toISOString(),
  });
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
router.get(
  '/health',
  requireAuth,
  asyncHandler(async (req, res) => {
    const health = await dataDb.healthCheck();

    res.json({
      success: health.healthy,
      data: health,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/datentabellen/stats
 * Get overview statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dataDb.isInitialized()) {
      return res.json({
        success: false,
        error: 'Datenbank nicht initialisiert',
        timestamp: new Date().toISOString(),
      });
    }

    // Get table count
    const tablesResult = await dataDb.query('SELECT COUNT(*)::int as count FROM dt_tables');

    // Get estimated total row count across all tables (using pg_class for O(1) lookup)
    const totalRowsResult = await dataDb.query(`
      SELECT COALESCE(SUM(c.reltuples::bigint), 0)::int as total_rows
      FROM dt_tables t
      JOIN pg_class c ON c.relname = t.slug
      WHERE c.reltuples >= 0
    `);
    const totalRows = totalRowsResult.rows[0]?.total_rows || 0;

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
        quotes: quoteStatsResult.rows[0],
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/datentabellen/tables/:slug/index
 * Index table data for RAG/LLM queries
 */
router.post(
  '/tables/:slug/index',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    logger.info(`[Datentabellen] Starting RAG indexing for table: ${slug}`);
    const result = await indexingService.indexTable(slug);
    logger.info(`[Datentabellen] Indexed ${result.indexed} rows for table ${slug}`);

    res.json({
      success: true,
      message: `${result.indexed} Datensätze indexiert`,
      indexed: result.indexed,
      table: result.tableName,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/v1/datentabellen/tables/:slug/index
 * Remove table data from RAG index
 */
router.delete(
  '/tables/:slug/index',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    const result = await indexingService.removeTableIndex(slug);
    logger.info(`[Datentabellen] Removed RAG index for table ${slug}`);

    res.json({
      success: true,
      message: 'Index erfolgreich entfernt',
      table: result.tableName,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/datentabellen/tables/:slug/index/status
 * Get indexing status for a table
 */
router.get(
  '/tables/:slug/index/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    const status = await indexingService.getIndexStatus(slug);

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================
// Natural Language Query Endpoints (Phase 3)
// ============================================================

/**
 * POST /api/v1/datentabellen/query/natural
 * Execute a natural language query using AI-generated SQL
 *
 * @body {string} query - Natural language query (e.g., "Zeige mir alle Produkte über 100€")
 * @body {string} tableSlug - Target table slug (optional)
 * @returns {Object} { sql, results, explanation, rowCount }
 */
router.post(
  '/query/natural',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { query, tableSlug } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (query.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Query is too short (minimum 5 characters)',
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `[Datentabellen] Natural language query: "${query}" for table: ${tableSlug || 'auto'}`
    );

    const result = await llmDataAccess.generateAndExecuteSQL(query, tableSlug);

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details,
        sql: result.sql,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        sql: result.sql,
        results: result.results,
        explanation: result.explanation,
        rowCount: result.rowCount,
        table: result.table,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/datentabellen/query/sql
 * Execute a validated SQL query (SELECT only)
 *
 * @body {string} sql - SQL query
 * @returns {Object} { results, rowCount }
 */
router.post(
  '/query/sql',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'SQL parameter is required',
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`[Datentabellen] Direct SQL query: ${sql.substring(0, 100)}...`);

    const result = await llmDataAccess.executeValidatedSQL(sql);

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        results: result.results,
        rowCount: result.rowCount,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/datentabellen/schema/:tableSlug
 * Get the schema of a table for AI/SQL purposes
 *
 * @param {string} tableSlug - Table slug
 * @returns {Object} Table schema with fields
 */
router.get(
  '/schema/:tableSlug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tableSlug } = req.params;

    const schema = await llmDataAccess.getTableSchema(tableSlug);

    if (schema.error) {
      return res.status(404).json({
        success: false,
        error: schema.error,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: schema,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/datentabellen/schemas
 * Get all table schemas for AI/SQL purposes
 *
 * @returns {Array} All table schemas
 */
router.get(
  '/schemas',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schemas = await llmDataAccess.getAllTableSchemas();

    res.json({
      success: true,
      data: schemas,
      count: schemas.length,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;

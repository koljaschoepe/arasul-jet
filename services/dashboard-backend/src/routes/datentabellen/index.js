/**
 * Datentabellen Routes Index
 * Combines all datentabellen-related routes
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const tablesRouter = require('./tables');
const rowsRouter = require('./rows');
const quotesRouter = require('./quotes');
const dataDb = require('../../dataDatabase');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const services = require('../../config/services');
const llmDataAccess = require('../../services/llmDataAccessService');

// RAG/Embedding configuration
const QDRANT_HOST = services.qdrant?.host || 'qdrant';
const QDRANT_PORT = services.qdrant?.port || 6333;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_HOST = services.embedding?.host || 'embedding-service';
const EMBEDDING_PORT = services.embedding?.port || 11435;

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

/**
 * POST /api/v1/datentabellen/tables/:slug/index
 * Index table data for RAG/LLM queries
 * Creates embeddings for each row and stores in Qdrant
 */
router.post('/tables/:slug/index', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    logger.info(`[Datentabellen] Starting RAG indexing for table: ${slug}`);

    // Get table metadata
    const tableResult = await dataDb.query(
        'SELECT * FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Tabelle nicht gefunden',
            timestamp: new Date().toISOString()
        });
    }

    const table = tableResult.rows[0];

    // Get fields
    const fieldsResult = await dataDb.query(
        'SELECT * FROM dt_fields WHERE table_id = $1 ORDER BY field_order',
        [table.id]
    );
    const fields = fieldsResult.rows;

    // Get all rows
    const rowsResult = await dataDb.query(`SELECT * FROM data_${slug}`);
    const rows = rowsResult.rows;

    if (rows.length === 0) {
        return res.json({
            success: true,
            message: 'Keine Daten zum Indexieren',
            indexed: 0,
            timestamp: new Date().toISOString()
        });
    }

    // Convert rows to text for embedding
    const rowTexts = rows.map(row => {
        const parts = [`Tabelle: ${table.name}`];
        fields.forEach(field => {
            const value = row[field.slug];
            if (value !== null && value !== undefined && value !== '') {
                parts.push(`${field.name}: ${value}`);
            }
        });
        return parts.join('\n');
    });

    // Batch embed (10 at a time)
    const batchSize = 10;
    const allPoints = [];

    for (let i = 0; i < rowTexts.length; i += batchSize) {
        const batch = rowTexts.slice(i, i + batchSize);
        const batchRows = rows.slice(i, i + batchSize);

        try {
            // Get embeddings
            const embeddingResponse = await axios.post(
                `http://${EMBEDDING_HOST}:${EMBEDDING_PORT}/embed`,
                { texts: batch },
                { timeout: 60000 }
            );

            const vectors = embeddingResponse.data.vectors || embeddingResponse.data.embeddings;

            // Create points for Qdrant
            vectors.forEach((vector, idx) => {
                const row = batchRows[idx];
                const pointId = crypto.createHash('md5')
                    .update(`datentabelle:${table.id}:${row._id}`)
                    .digest('hex');

                allPoints.push({
                    id: pointId,
                    vector: vector,
                    payload: {
                        source_type: 'datentabelle',
                        table_id: table.id,
                        table_slug: slug,
                        table_name: table.name,
                        row_id: row._id,
                        text: batch[idx],
                        indexed_at: Date.now() / 1000,
                        // Include key field values for display
                        preview: fields.slice(0, 3).map(f => row[f.slug]).filter(v => v).join(' | ')
                    }
                });
            });
        } catch (err) {
            logger.error(`[Datentabellen] Embedding failed for batch ${i}: ${err.message}`);
            throw err;
        }
    }

    // Delete old points for this table first
    try {
        await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
            {
                filter: {
                    must: [
                        { key: 'source_type', match: { value: 'datentabelle' } },
                        { key: 'table_id', match: { value: table.id } }
                    ]
                }
            },
            { timeout: 30000 }
        );
    } catch (err) {
        // Ignore delete errors (might not exist)
        logger.warn(`[Datentabellen] Delete old vectors failed: ${err.message}`);
    }

    // Upsert to Qdrant
    try {
        await axios.put(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points`,
            { points: allPoints },
            { timeout: 60000 }
        );
    } catch (err) {
        logger.error(`[Datentabellen] Qdrant upsert failed: ${err.message}`);
        throw err;
    }

    logger.info(`[Datentabellen] Indexed ${allPoints.length} rows for table ${slug}`);

    res.json({
        success: true,
        message: `${allPoints.length} Datensätze indexiert`,
        indexed: allPoints.length,
        table: table.name,
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/v1/datentabellen/tables/:slug/index
 * Remove table data from RAG index
 */
router.delete('/tables/:slug/index', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // Get table metadata
    const tableResult = await dataDb.query(
        'SELECT id, name FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Tabelle nicht gefunden',
            timestamp: new Date().toISOString()
        });
    }

    const table = tableResult.rows[0];

    // Delete from Qdrant
    try {
        await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
            {
                filter: {
                    must: [
                        { key: 'source_type', match: { value: 'datentabelle' } },
                        { key: 'table_id', match: { value: table.id } }
                    ]
                }
            },
            { timeout: 30000 }
        );
    } catch (err) {
        logger.error(`[Datentabellen] Delete from Qdrant failed: ${err.message}`);
        throw err;
    }

    logger.info(`[Datentabellen] Removed RAG index for table ${slug}`);

    res.json({
        success: true,
        message: 'Index erfolgreich entfernt',
        table: table.name,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/tables/:slug/index/status
 * Get indexing status for a table
 */
router.get('/tables/:slug/index/status', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // Get table metadata
    const tableResult = await dataDb.query(
        'SELECT id, name FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Tabelle nicht gefunden',
            timestamp: new Date().toISOString()
        });
    }

    const table = tableResult.rows[0];

    // Count vectors in Qdrant
    try {
        const countResponse = await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/count`,
            {
                filter: {
                    must: [
                        { key: 'source_type', match: { value: 'datentabelle' } },
                        { key: 'table_id', match: { value: table.id } }
                    ]
                }
            },
            { timeout: 10000 }
        );

        const indexedCount = countResponse.data.result?.count || 0;

        // Get total row count
        const rowCountResult = await dataDb.query(`SELECT COUNT(*)::int as count FROM data_${slug}`);
        const totalRows = rowCountResult.rows[0].count;

        res.json({
            success: true,
            data: {
                table: table.name,
                indexed_rows: indexedCount,
                total_rows: totalRows,
                is_indexed: indexedCount > 0,
                is_complete: indexedCount === totalRows
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        // Qdrant might not be available
        res.json({
            success: true,
            data: {
                table: table.name,
                indexed_rows: 0,
                total_rows: 0,
                is_indexed: false,
                is_complete: false,
                error: 'Qdrant nicht erreichbar'
            },
            timestamp: new Date().toISOString()
        });
    }
}));

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
router.post('/query/natural', requireAuth, asyncHandler(async (req, res) => {
    const { query, tableSlug } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Query parameter is required',
            timestamp: new Date().toISOString()
        });
    }

    if (query.trim().length < 5) {
        return res.status(400).json({
            success: false,
            error: 'Query is too short (minimum 5 characters)',
            timestamp: new Date().toISOString()
        });
    }

    logger.info(`[Datentabellen] Natural language query: "${query}" for table: ${tableSlug || 'auto'}`);

    const result = await llmDataAccess.generateAndExecuteSQL(query, tableSlug);

    if (result.error) {
        return res.status(400).json({
            success: false,
            error: result.error,
            details: result.details,
            sql: result.sql,
            timestamp: new Date().toISOString()
        });
    }

    res.json({
        success: true,
        data: {
            sql: result.sql,
            results: result.results,
            explanation: result.explanation,
            rowCount: result.rowCount,
            table: result.table
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/query/sql
 * Execute a validated SQL query (SELECT only)
 *
 * @body {string} sql - SQL query
 * @returns {Object} { results, rowCount }
 */
router.post('/query/sql', requireAuth, asyncHandler(async (req, res) => {
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'SQL parameter is required',
            timestamp: new Date().toISOString()
        });
    }

    logger.info(`[Datentabellen] Direct SQL query: ${sql.substring(0, 100)}...`);

    const result = await llmDataAccess.executeValidatedSQL(sql);

    if (result.error) {
        return res.status(400).json({
            success: false,
            error: result.error,
            details: result.details,
            timestamp: new Date().toISOString()
        });
    }

    res.json({
        success: true,
        data: {
            results: result.results,
            rowCount: result.rowCount
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/schema/:tableSlug
 * Get the schema of a table for AI/SQL purposes
 *
 * @param {string} tableSlug - Table slug
 * @returns {Object} Table schema with fields
 */
router.get('/schema/:tableSlug', requireAuth, asyncHandler(async (req, res) => {
    const { tableSlug } = req.params;

    const schema = await llmDataAccess.getTableSchema(tableSlug);

    if (schema.error) {
        return res.status(404).json({
            success: false,
            error: schema.error,
            timestamp: new Date().toISOString()
        });
    }

    res.json({
        success: true,
        data: schema,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/schemas
 * Get all table schemas for AI/SQL purposes
 *
 * @returns {Array} All table schemas
 */
router.get('/schemas', requireAuth, asyncHandler(async (req, res) => {
    const schemas = await llmDataAccess.getAllTableSchemas();

    res.json({
        success: true,
        data: schemas,
        count: schemas.length,
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

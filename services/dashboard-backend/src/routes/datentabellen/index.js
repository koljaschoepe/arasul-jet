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

module.exports = router;

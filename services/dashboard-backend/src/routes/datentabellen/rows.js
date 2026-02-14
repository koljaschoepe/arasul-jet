/**
 * Datentabellen - Rows API Routes
 * CRUD operations for data in dynamic tables
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const dataDb = require('../../dataDatabase');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');

/**
 * SQL Reserved Keywords - blocked from use in identifiers
 */
const SQL_RESERVED_KEYWORDS = new Set([
    'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate',
    'table', 'index', 'view', 'database', 'schema', 'grant', 'revoke', 'cascade',
    'union', 'intersect', 'except', 'join', 'where', 'from', 'into', 'values',
    'set', 'null', 'not', 'and', 'or', 'true', 'false', 'is', 'in', 'like',
    'between', 'exists', 'all', 'any', 'some', 'order', 'by', 'group', 'having',
    'limit', 'offset', 'as', 'on', 'using', 'natural', 'left', 'right', 'inner',
    'outer', 'cross', 'full', 'primary', 'foreign', 'key', 'references', 'unique',
    'check', 'default', 'constraint', 'exec', 'execute', 'declare', 'cursor'
]);

/**
 * Helper: Validate slug format
 * Strict validation: only lowercase letters, numbers, and underscores
 * Must start with a letter, max 100 chars, no SQL keywords
 */
function isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    if (slug.length > 100) return false;
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) return false;
    if (SQL_RESERVED_KEYWORDS.has(slug)) return false;
    return true;
}

/**
 * Helper: Get table and fields metadata
 */
async function getTableMeta(slug) {
    const tableResult = await dataDb.query(
        'SELECT * FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const table = tableResult.rows[0];

    const fieldsResult = await dataDb.query(`
        SELECT slug, name, field_type, is_required, is_unique, default_value, options
        FROM dt_fields
        WHERE table_id = $1
        ORDER BY field_order
    `, [table.id]);

    return { table, fields: fieldsResult.rows };
}

/**
 * Helper: Build WHERE clause from filters
 */
function buildWhereClause(filters, fields, startParamIndex = 1) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
        return { clause: '', params: [], nextIndex: startParamIndex };
    }

    const validFields = new Set(fields.map(f => f.slug));
    validFields.add('_id');
    validFields.add('_created_at');
    validFields.add('_updated_at');
    validFields.add('_created_by');

    const conditions = [];
    const params = [];
    let paramIndex = startParamIndex;

    for (const filter of filters) {
        const { field, operator, value } = filter;

        if (!validFields.has(field)) {
            continue; // Skip invalid fields
        }

        switch (operator) {
            case 'eq':
                conditions.push(`${field} = $${paramIndex++}`);
                params.push(value);
                break;
            case 'neq':
                conditions.push(`${field} != $${paramIndex++}`);
                params.push(value);
                break;
            case 'gt':
                conditions.push(`${field} > $${paramIndex++}`);
                params.push(value);
                break;
            case 'gte':
                conditions.push(`${field} >= $${paramIndex++}`);
                params.push(value);
                break;
            case 'lt':
                conditions.push(`${field} < $${paramIndex++}`);
                params.push(value);
                break;
            case 'lte':
                conditions.push(`${field} <= $${paramIndex++}`);
                params.push(value);
                break;
            case 'like':
                conditions.push(`${field} ILIKE $${paramIndex++}`);
                params.push(`%${value}%`);
                break;
            case 'in':
                if (Array.isArray(value) && value.length > 0) {
                    const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
                    conditions.push(`${field} IN (${placeholders})`);
                    params.push(...value);
                }
                break;
            case 'is_null':
                conditions.push(`${field} IS NULL`);
                break;
            case 'is_not_null':
                conditions.push(`${field} IS NOT NULL`);
                break;
        }
    }

    return {
        clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        params,
        nextIndex: paramIndex
    };
}

/**
 * GET /api/v1/datentabellen/tables/:slug/rows
 * List rows with pagination, filtering, sorting
 */
router.get('/:slug/rows', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
        page = 1,
        limit = 50,
        sort = '_created_at',
        order = 'desc',
        filters,
        search
    } = req.query;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    const { table, fields } = await getTableMeta(slug);

    // Validate sort field
    const validFields = new Set(fields.map(f => f.slug));
    validFields.add('_id');
    validFields.add('_created_at');
    validFields.add('_updated_at');
    validFields.add('_created_by');

    const sortField = validFields.has(sort) ? sort : '_created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Parse filters from query string
    let parsedFilters = [];
    if (filters) {
        try {
            parsedFilters = JSON.parse(filters);
        } catch (err) {
            throw new ValidationError('Ungültiges Filter-Format');
        }
    }

    // Add search filter if provided
    if (search && search.trim()) {
        const primaryField = fields.find(f => f.is_primary_display) || fields[0];
        if (primaryField) {
            parsedFilters.push({
                field: primaryField.slug,
                operator: 'like',
                value: search.trim()
            });
        }
    }

    // Build query
    const { clause: whereClause, params: whereParams, nextIndex } = buildWhereClause(parsedFilters, fields);

    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const countResult = await dataDb.query(
        `SELECT COUNT(*)::int as total FROM data_${slug} ${whereClause}`,
        whereParams
    );
    const total = countResult.rows[0].total;

    // Get rows
    const rowsResult = await dataDb.query(`
        SELECT * FROM data_${slug}
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
    `, [...whereParams, limitNum, offset]);

    res.json({
        success: true,
        data: rowsResult.rows,
        meta: {
            table_id: table.id,
            table_name: table.name,
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
            sort: sortField,
            order: sortOrder.toLowerCase()
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/tables/:slug/rows/:rowId
 * Get single row
 */
router.get('/:slug/rows/:rowId', requireAuth, asyncHandler(async (req, res) => {
    const { slug, rowId } = req.params;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rowId)) {
        throw new ValidationError('Ungültige Zeilen-ID');
    }

    const { table } = await getTableMeta(slug);

    const result = await dataDb.query(
        `SELECT * FROM data_${slug} WHERE _id = $1`,
        [rowId]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Datensatz nicht gefunden');
    }

    res.json({
        success: true,
        data: result.rows[0],
        meta: {
            table_id: table.id,
            table_name: table.name
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/tables/:slug/rows
 * Create new row
 */
router.post('/:slug/rows', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const data = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    const { table, fields } = await getTableMeta(slug);

    // Validate required fields
    for (const field of fields) {
        if (field.is_required && (data[field.slug] === undefined || data[field.slug] === null || data[field.slug] === '')) {
            throw new ValidationError(`Feld "${field.name}" ist erforderlich`);
        }
    }

    // Build insert query
    const validFields = new Set(fields.map(f => f.slug));
    const columns = ['_created_by'];
    const values = [req.user?.username || 'system'];
    const placeholders = ['$1'];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(data)) {
        if (validFields.has(key) && value !== undefined) {
            columns.push(key);
            values.push(value);
            placeholders.push(`$${paramIndex++}`);
        }
    }

    const result = await dataDb.query(`
        INSERT INTO data_${slug} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
    `, values);

    logger.info(`[Datentabellen] Created row in ${slug}: ${result.rows[0]._id}`);

    res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Datensatz erfolgreich erstellt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PATCH /api/v1/datentabellen/tables/:slug/rows/:rowId
 * Update a row with optimistic locking support
 */
router.patch('/:slug/rows/:rowId', requireAuth, asyncHandler(async (req, res) => {
    const { slug, rowId } = req.params;
    const { _expected_updated_at, ...data } = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rowId)) {
        throw new ValidationError('Ungültige Zeilen-ID');
    }

    const { table, fields } = await getTableMeta(slug);

    // Check if row exists and get current state
    const existingResult = await dataDb.query(
        `SELECT _id, _updated_at FROM data_${slug} WHERE _id = $1`,
        [rowId]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Datensatz nicht gefunden');
    }

    // Optimistic locking: check if row was modified since client loaded it
    if (_expected_updated_at) {
        const currentUpdatedAt = existingResult.rows[0]._updated_at;
        const expectedDate = new Date(_expected_updated_at);
        const currentDate = new Date(currentUpdatedAt);

        // Allow 1 second tolerance for timestamp comparison
        if (Math.abs(currentDate.getTime() - expectedDate.getTime()) > 1000) {
            throw new ConflictError('Konflikt: Der Datensatz wurde von einem anderen Benutzer geändert');
        }
    }

    // Build update query
    const validFields = new Set(fields.map(f => f.slug));
    const updates = ['_updated_at = NOW()'];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
        if (validFields.has(key)) {
            updates.push(`${key} = $${paramIndex++}`);
            params.push(value);
        }
    }

    if (updates.length === 1) { // Only _updated_at
        throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(rowId);

    const result = await dataDb.query(`
        UPDATE data_${slug}
        SET ${updates.join(', ')}
        WHERE _id = $${paramIndex}
        RETURNING *
    `, params);

    logger.info(`[Datentabellen] Updated row in ${slug}: ${rowId}`);

    res.json({
        success: true,
        data: result.rows[0],
        message: 'Datensatz erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/v1/datentabellen/tables/:slug/rows/:rowId
 * Delete a row
 */
router.delete('/:slug/rows/:rowId', requireAuth, asyncHandler(async (req, res) => {
    const { slug, rowId } = req.params;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rowId)) {
        throw new ValidationError('Ungültige Zeilen-ID');
    }

    await getTableMeta(slug); // Verify table exists

    const result = await dataDb.query(
        `DELETE FROM data_${slug} WHERE _id = $1 RETURNING _id`,
        [rowId]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Datensatz nicht gefunden');
    }

    logger.info(`[Datentabellen] Deleted row from ${slug}: ${rowId}`);

    res.json({
        success: true,
        message: 'Datensatz erfolgreich gelöscht',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/tables/:slug/rows/bulk
 * Bulk create rows (e.g., for import)
 */
router.post('/:slug/rows/bulk', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { rows } = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('Keine Daten zum Importieren');
    }

    if (rows.length > 1000) {
        throw new ValidationError('Maximal 1000 Zeilen pro Import');
    }

    const { table, fields } = await getTableMeta(slug);
    const validFields = new Set(fields.map(f => f.slug));
    const username = req.user?.username || 'system';

    // Process in transaction
    const result = await dataDb.transaction(async (client) => {
        const insertedRows = [];
        let errorCount = 0;

        for (const rowData of rows) {
            try {
                const columns = ['_created_by'];
                const values = [username];
                const placeholders = ['$1'];
                let paramIndex = 2;

                for (const [key, value] of Object.entries(rowData)) {
                    if (validFields.has(key) && value !== undefined) {
                        columns.push(key);
                        values.push(value);
                        placeholders.push(`$${paramIndex++}`);
                    }
                }

                const rowResult = await client.query(`
                    INSERT INTO data_${slug} (${columns.join(', ')})
                    VALUES (${placeholders.join(', ')})
                    RETURNING _id
                `, values);

                insertedRows.push(rowResult.rows[0]._id);
            } catch (err) {
                errorCount++;
                logger.warn(`[Datentabellen] Bulk insert error: ${err.message}`);
            }
        }

        return { inserted: insertedRows.length, errors: errorCount };
    });

    logger.info(`[Datentabellen] Bulk import to ${slug}: ${result.inserted} inserted, ${result.errors} errors`);

    res.status(201).json({
        success: true,
        data: result,
        message: `${result.inserted} Datensätze importiert`,
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/v1/datentabellen/tables/:slug/rows/bulk
 * Bulk delete rows
 */
router.delete('/:slug/rows/bulk', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { ids } = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    if (!Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('Keine IDs zum Löschen angegeben');
    }

    if (ids.length > 100) {
        throw new ValidationError('Maximal 100 Zeilen pro Löschvorgang');
    }

    // Validate all UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of ids) {
        if (!uuidRegex.test(id)) {
            throw new ValidationError(`Ungültige ID: ${id}`);
        }
    }

    await getTableMeta(slug); // Verify table exists

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await dataDb.query(
        `DELETE FROM data_${slug} WHERE _id IN (${placeholders}) RETURNING _id`,
        ids
    );

    logger.info(`[Datentabellen] Bulk delete from ${slug}: ${result.rows.length} deleted`);

    res.json({
        success: true,
        data: { deleted: result.rows.length },
        message: `${result.rows.length} Datensätze gelöscht`,
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

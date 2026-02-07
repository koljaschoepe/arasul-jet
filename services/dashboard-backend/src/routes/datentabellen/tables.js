/**
 * Datentabellen - Tables API Routes
 * CRUD operations for dynamic table schema management
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
    'check', 'default', 'constraint', 'exec', 'execute', 'declare', 'cursor',
    'fetch', 'open', 'close', 'begin', 'end', 'commit', 'rollback', 'savepoint',
    'trigger', 'function', 'procedure', 'return', 'returns', 'language', 'security',
    'definer', 'invoker', 'volatile', 'stable', 'immutable', 'parallel', 'safe'
]);

/**
 * Helper: Generate URL-safe slug from name
 */
function generateSlug(name) {
    let slug = name
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 100);

    // Ensure slug doesn't start with a number
    if (/^[0-9]/.test(slug)) {
        slug = 't_' + slug;
    }

    // Ensure slug is not a SQL reserved keyword
    if (SQL_RESERVED_KEYWORDS.has(slug)) {
        slug = 'tbl_' + slug;
    }

    return slug;
}

/**
 * Helper: Validate slug format
 * Strict validation: only lowercase letters, numbers, and underscores
 * Must start with a letter, max 100 chars
 */
function isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    if (slug.length > 100) return false;
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) return false;
    if (SQL_RESERVED_KEYWORDS.has(slug)) return false;
    return true;
}

/**
 * Helper: Escape identifier for safe use in dynamic SQL
 * Double-quotes the identifier and escapes any existing double quotes
 */
function escapeIdentifier(identifier) {
    if (!isValidSlug(identifier)) {
        throw new ValidationError(`Invalid identifier: ${identifier}`);
    }
    // Even though we validate, double-quote for extra safety
    return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * GET /api/v1/datentabellen/tables
 * List all tables with statistics
 * Optimized: Batch query for row counts instead of N+1
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const result = await dataDb.query(`
        SELECT
            t.id, t.name, t.slug, t.description, t.icon, t.color,
            t.is_system, t.created_at, t.updated_at, t.created_by,
            COUNT(DISTINCT f.id)::int as field_count
        FROM dt_tables t
        LEFT JOIN dt_fields f ON f.table_id = t.id
        GROUP BY t.id, t.name, t.slug, t.description, t.icon, t.color,
                 t.is_system, t.created_at, t.updated_at, t.created_by
        ORDER BY t.created_at DESC
    `);

    // Optimized: Get row counts using pg_stat_user_tables for existing tables
    // This is much faster than counting rows directly
    let rowCounts = {};

    if (result.rows.length > 0) {
        const validTables = result.rows.filter(t => isValidSlug(t.slug));

        if (validTables.length > 0) {
            // Use pg_stat_user_tables for approximate but fast row counts
            // Falls back to 0 for tables that don't exist yet
            const tableNames = validTables.map(t => `data_${t.slug}`);
            const placeholders = tableNames.map((_, i) => `$${i + 1}`).join(', ');

            try {
                const statsResult = await dataDb.query(`
                    SELECT
                        relname as table_name,
                        n_live_tup::int as row_count
                    FROM pg_stat_user_tables
                    WHERE relname IN (${placeholders})
                `, tableNames);

                // Map table names back to slugs
                statsResult.rows.forEach(row => {
                    const slug = row.table_name.replace(/^data_/, '');
                    rowCounts[slug] = row.row_count;
                });
            } catch (err) {
                logger.warn(`[Datentabellen] Error fetching row counts from pg_stat: ${err.message}`);

                // Fallback: batch fetch with error handling per table
                const BATCH_SIZE = 10;
                for (let i = 0; i < validTables.length; i += BATCH_SIZE) {
                    const batch = validTables.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (table) => {
                        try {
                            const countResult = await dataDb.query(
                                `SELECT COUNT(*)::int as count FROM data_${table.slug}`
                            );
                            rowCounts[table.slug] = countResult.rows[0].count;
                        } catch {
                            rowCounts[table.slug] = 0;
                        }
                    }));
                }
            }
        }
    }

    // Merge row counts with table data
    const tables = result.rows.map(table => ({
        ...table,
        row_count: rowCounts[table.slug] || 0
    }));

    res.json({
        success: true,
        data: tables,
        total: tables.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/tables/:slug
 * Get single table with fields
 */
router.get('/:slug', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Get table
    const tableResult = await dataDb.query(
        'SELECT * FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const table = tableResult.rows[0];

    // Get fields
    const fieldsResult = await dataDb.query(`
        SELECT * FROM dt_fields
        WHERE table_id = $1
        ORDER BY field_order, created_at
    `, [table.id]);

    // Get views
    const viewsResult = await dataDb.query(`
        SELECT * FROM dt_views
        WHERE table_id = $1
        ORDER BY is_default DESC, name
    `, [table.id]);

    // Get row count
    let rowCount = 0;
    try {
        const countResult = await dataDb.query(
            `SELECT COUNT(*)::int as count FROM data_${slug}`
        );
        rowCount = countResult.rows[0].count;
    } catch (err) {
        // Ignore - table might not exist yet
    }

    res.json({
        success: true,
        data: {
            ...table,
            fields: fieldsResult.rows,
            views: viewsResult.rows,
            row_count: rowCount
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/tables
 * Create a new table
 * Optionally creates a default "Name" field if createDefaultField is true
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { name, description, icon, color, createDefaultField } = req.body;

    // Validation
    if (!name || !name.trim()) {
        throw new ValidationError('Tabellenname erforderlich');
    }

    const slug = generateSlug(name);

    if (!isValidSlug(slug)) {
        throw new ValidationError('Tabellenname enthält ungültige Zeichen');
    }

    // Start transaction
    const result = await dataDb.transaction(async (client) => {
        // Check if slug exists
        const existingResult = await client.query(
            'SELECT id FROM dt_tables WHERE slug = $1',
            [slug]
        );

        if (existingResult.rows.length > 0) {
            throw new ConflictError('Eine Tabelle mit diesem Namen existiert bereits');
        }

        // Create meta entry
        const tableResult = await client.query(`
            INSERT INTO dt_tables (name, slug, description, icon, color, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            name.trim(),
            slug,
            description || null,
            icon || '📦',
            color || '#45ADFF',
            req.user?.username || 'system'
        ]);

        const table = tableResult.rows[0];

        // Create physical data table with optional default "name" column
        if (createDefaultField) {
            await client.query(`
                CREATE TABLE data_${slug} (
                    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    _created_at TIMESTAMPTZ DEFAULT NOW(),
                    _updated_at TIMESTAMPTZ DEFAULT NOW(),
                    _created_by VARCHAR(100),
                    name TEXT
                )
            `);

            // Create default "Name" field metadata
            await client.query(`
                INSERT INTO dt_fields (table_id, name, slug, field_type, field_order, is_primary_display)
                VALUES ($1, 'Name', 'name', 'text', 0, true)
            `, [table.id]);

            logger.info(`[Datentabellen] Created table with default field: ${name} (${slug})`);
        } else {
            await client.query(`
                CREATE TABLE data_${slug} (
                    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    _created_at TIMESTAMPTZ DEFAULT NOW(),
                    _updated_at TIMESTAMPTZ DEFAULT NOW(),
                    _created_by VARCHAR(100)
                )
            `);

            logger.info(`[Datentabellen] Created table: ${name} (${slug})`);
        }

        // Create update trigger
        await client.query(`
            CREATE TRIGGER trigger_data_${slug}_updated_at
                BEFORE UPDATE ON data_${slug}
                FOR EACH ROW
                EXECUTE FUNCTION update_dt_updated_at()
        `);

        return table;
    });

    res.status(201).json({
        success: true,
        data: result,
        message: 'Tabelle erfolgreich erstellt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PATCH /api/v1/datentabellen/tables/:slug
 * Update table metadata
 */
router.patch('/:slug', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { name, description, icon, color } = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Check if table exists
    const existingResult = await dataDb.query(
        'SELECT * FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // Cannot rename system tables
    if (existing.is_system && name && name !== existing.name) {
        throw new ValidationError('Systemtabellen können nicht umbenannt werden');
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined && name.trim() && name !== existing.name) {
        updates.push(`name = $${paramIndex++}`);
        params.push(name.trim());
    }

    if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(description);
    }

    if (icon !== undefined) {
        updates.push(`icon = $${paramIndex++}`);
        params.push(icon);
    }

    if (color !== undefined) {
        updates.push(`color = $${paramIndex++}`);
        params.push(color);
    }

    if (updates.length === 0) {
        throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(slug);
    const result = await dataDb.query(`
        UPDATE dt_tables
        SET ${updates.join(', ')}
        WHERE slug = $${paramIndex}
        RETURNING *
    `, params);

    logger.info(`[Datentabellen] Updated table: ${slug}`);

    res.json({
        success: true,
        data: result.rows[0],
        message: 'Tabelle erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/v1/datentabellen/tables/:slug
 * Delete a table and all its data
 */
router.delete('/:slug', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    // Check if table exists
    const existingResult = await dataDb.query(
        'SELECT * FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // Cannot delete system tables
    if (existing.is_system) {
        throw new ValidationError('Systemtabellen können nicht gelöscht werden');
    }

    // Delete in transaction
    await dataDb.transaction(async (client) => {
        // Drop data table (CASCADE handles trigger)
        await client.query(`DROP TABLE IF EXISTS data_${slug} CASCADE`);

        // Delete meta entry (CASCADE handles fields, views, relations)
        await client.query('DELETE FROM dt_tables WHERE slug = $1', [slug]);
    });

    logger.info(`[Datentabellen] Deleted table: ${slug}`);

    res.json({
        success: true,
        message: 'Tabelle erfolgreich gelöscht',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/tables/:slug/fields
 * Add a field to a table
 */
router.post('/:slug/fields', requireAuth, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
        name, field_type, is_required, is_unique, is_primary_display,
        default_value, options, validation
    } = req.body;

    if (!isValidSlug(slug)) {
        throw new ValidationError('Ungültiger Tabellenname');
    }

    if (!name || !name.trim()) {
        throw new ValidationError('Feldname erforderlich');
    }

    if (!field_type) {
        throw new ValidationError('Feldtyp erforderlich');
    }

    // Get table
    const tableResult = await dataDb.query(
        'SELECT id FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const tableId = tableResult.rows[0].id;
    const fieldSlug = generateSlug(name);

    // Map field type to PostgreSQL type
    const pgTypeMap = {
        'text': 'TEXT',
        'textarea': 'TEXT',
        'number': 'NUMERIC',
        'currency': 'NUMERIC(12,2)',
        'date': 'DATE',
        'datetime': 'TIMESTAMPTZ',
        'select': 'TEXT',
        'multiselect': 'TEXT[]',
        'checkbox': 'BOOLEAN',
        'relation': 'UUID',
        'file': 'TEXT',
        'image': 'TEXT',
        'email': 'TEXT',
        'url': 'TEXT',
        'phone': 'TEXT',
        'formula': 'TEXT'
    };

    const pgType = pgTypeMap[field_type];
    if (!pgType) {
        throw new ValidationError(`Ungültiger Feldtyp: ${field_type}`);
    }

    // Start transaction
    const result = await dataDb.transaction(async (client) => {
        // Get next field order
        const orderResult = await client.query(`
            SELECT COALESCE(MAX(field_order), -1) + 1 as next_order
            FROM dt_fields WHERE table_id = $1
        `, [tableId]);
        const fieldOrder = orderResult.rows[0].next_order;

        // Check for duplicate field slug
        const existingField = await client.query(`
            SELECT id FROM dt_fields WHERE table_id = $1 AND slug = $2
        `, [tableId, fieldSlug]);

        if (existingField.rows.length > 0) {
            throw new ConflictError('Ein Feld mit diesem Namen existiert bereits');
        }

        // Add column to physical table
        let columnDef = `${fieldSlug} ${pgType}`;
        if (is_required) {
            columnDef += ' NOT NULL';
        }
        if (is_unique) {
            columnDef += ' UNIQUE';
        }

        await client.query(`ALTER TABLE data_${slug} ADD COLUMN ${columnDef}`);

        // Add meta entry
        const fieldResult = await client.query(`
            INSERT INTO dt_fields (
                table_id, name, slug, field_type, field_order,
                is_required, is_unique, is_primary_display,
                default_value, options, validation
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            tableId,
            name.trim(),
            fieldSlug,
            field_type,
            fieldOrder,
            is_required || false,
            is_unique || false,
            is_primary_display || false,
            default_value ? JSON.stringify(default_value) : null,
            options ? JSON.stringify(options) : '{}',
            validation ? JSON.stringify(validation) : null
        ]);

        logger.info(`[Datentabellen] Added field ${fieldSlug} to ${slug}`);

        return fieldResult.rows[0];
    });

    res.status(201).json({
        success: true,
        data: result,
        message: 'Feld erfolgreich hinzugefügt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
 * Remove a field from a table
 */
router.delete('/:slug/fields/:fieldSlug', requireAuth, asyncHandler(async (req, res) => {
    const { slug, fieldSlug } = req.params;

    if (!isValidSlug(slug) || !isValidSlug(fieldSlug)) {
        throw new ValidationError('Ungültiger Tabellen- oder Feldname');
    }

    // Get table and field
    const tableResult = await dataDb.query(
        'SELECT id FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const tableId = tableResult.rows[0].id;

    const fieldResult = await dataDb.query(
        'SELECT id FROM dt_fields WHERE table_id = $1 AND slug = $2',
        [tableId, fieldSlug]
    );

    if (fieldResult.rows.length === 0) {
        throw new NotFoundError('Feld nicht gefunden');
    }

    // Delete in transaction
    await dataDb.transaction(async (client) => {
        // Drop column from physical table
        await client.query(`ALTER TABLE data_${slug} DROP COLUMN IF EXISTS ${fieldSlug}`);

        // Delete meta entry
        await client.query(
            'DELETE FROM dt_fields WHERE table_id = $1 AND slug = $2',
            [tableId, fieldSlug]
        );
    });

    logger.info(`[Datentabellen] Removed field ${fieldSlug} from ${slug}`);

    res.json({
        success: true,
        message: 'Feld erfolgreich entfernt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PATCH /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
 * Update a field (limited - cannot change type)
 */
router.patch('/:slug/fields/:fieldSlug', requireAuth, asyncHandler(async (req, res) => {
    const { slug, fieldSlug } = req.params;
    const { name, is_required, is_primary_display, default_value, options, validation } = req.body;

    if (!isValidSlug(slug) || !isValidSlug(fieldSlug)) {
        throw new ValidationError('Ungültiger Tabellen- oder Feldname');
    }

    // Get table and field
    const tableResult = await dataDb.query(
        'SELECT id FROM dt_tables WHERE slug = $1',
        [slug]
    );

    if (tableResult.rows.length === 0) {
        throw new NotFoundError('Tabelle nicht gefunden');
    }

    const tableId = tableResult.rows[0].id;

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined && name.trim()) {
        updates.push(`name = $${paramIndex++}`);
        params.push(name.trim());
    }

    if (is_required !== undefined) {
        updates.push(`is_required = $${paramIndex++}`);
        params.push(is_required);
    }

    if (is_primary_display !== undefined) {
        updates.push(`is_primary_display = $${paramIndex++}`);
        params.push(is_primary_display);
    }

    if (default_value !== undefined) {
        updates.push(`default_value = $${paramIndex++}`);
        params.push(JSON.stringify(default_value));
    }

    if (options !== undefined) {
        updates.push(`options = $${paramIndex++}`);
        params.push(JSON.stringify(options));
    }

    if (validation !== undefined) {
        updates.push(`validation = $${paramIndex++}`);
        params.push(JSON.stringify(validation));
    }

    if (updates.length === 0) {
        throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(tableId, fieldSlug);

    const result = await dataDb.query(`
        UPDATE dt_fields
        SET ${updates.join(', ')}
        WHERE table_id = $${paramIndex} AND slug = $${paramIndex + 1}
        RETURNING *
    `, params);

    if (result.rows.length === 0) {
        throw new NotFoundError('Feld nicht gefunden');
    }

    logger.info(`[Datentabellen] Updated field ${fieldSlug} in ${slug}`);

    res.json({
        success: true,
        data: result.rows[0],
        message: 'Feld erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

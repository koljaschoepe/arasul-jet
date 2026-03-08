/**
 * Datentabellen - Tables API Routes
 * CRUD operations for dynamic table schema management
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const dataDb = require('../../dataDatabase');
const pool = require('../../database');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const {
  SQL_RESERVED_KEYWORDS,
  isValidSlug,
  escapeIdentifier,
  escapeTableName,
} = require('../../utils/sqlIdentifier');

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
 * GET /api/v1/datentabellen/tables
 * List all tables with statistics
 * Optimized: Batch query for row counts instead of N+1
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { space_id, status, category, search, limit = 100, offset = 0 } = req.query;

    // Build dynamic WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (space_id) {
      conditions.push(`t.space_id = $${paramIndex++}`);
      params.push(space_id);
    }

    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status);
    }

    if (category) {
      conditions.push(`t.category = $${paramIndex++}`);
      params.push(category);
    }

    if (search) {
      conditions.push(`(t.name ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await dataDb.query(
      `SELECT COUNT(*)::int as total FROM dt_tables t ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    // Get filtered tables with field counts
    const result = await dataDb.query(
      `
        SELECT
            t.id, t.name, t.slug, t.description, t.icon, t.color,
            t.is_system, t.created_at, t.updated_at, t.created_by,
            t.space_id, t.status, t.category,
            COUNT(DISTINCT f.id)::int as field_count
        FROM dt_tables t
        LEFT JOIN dt_fields f ON f.table_id = t.id
        ${whereClause}
        GROUP BY t.id, t.name, t.slug, t.description, t.icon, t.color,
                 t.is_system, t.created_at, t.updated_at, t.created_by,
                 t.space_id, t.status, t.category
        ORDER BY t.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Optimized: Get row counts using pg_stat_user_tables for existing tables
    const rowCounts = {};

    if (result.rows.length > 0) {
      const validTables = result.rows.filter(t => isValidSlug(t.slug));

      if (validTables.length > 0) {
        const tableNames = validTables.map(t => `data_${t.slug}`);
        const placeholders = tableNames.map((_, i) => `$${i + 1}`).join(', ');

        try {
          const statsResult = await dataDb.query(
            `
                    SELECT
                        relname as table_name,
                        n_live_tup::int as row_count
                    FROM pg_stat_user_tables
                    WHERE relname IN (${placeholders})
                `,
            tableNames
          );

          statsResult.rows.forEach(row => {
            const slug = row.table_name.replace(/^data_/, '');
            rowCounts[slug] = row.row_count;
          });
        } catch (err) {
          logger.warn(`[Datentabellen] Error fetching row counts from pg_stat: ${err.message}`);

          const BATCH_SIZE = 10;
          for (let i = 0; i < validTables.length; i += BATCH_SIZE) {
            const batch = validTables.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(async table => {
                try {
                  const countResult = await dataDb.query(
                    `SELECT COUNT(*)::int as count FROM ${escapeTableName(table.slug)}`
                  );
                  rowCounts[table.slug] = countResult.rows[0].count;
                } catch {
                  rowCounts[table.slug] = 0;
                }
              })
            );
          }
        }
      }
    }

    // Merge row counts with table data
    const tables = result.rows.map(table => ({
      ...table,
      row_count: rowCounts[table.slug] || 0,
    }));

    res.json({
      success: true,
      data: tables,
      tables: tables, // backward compat
      total,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/datentabellen/tables/:slug
 * Get single table with fields
 */
router.get(
  '/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    // Get table
    const tableResult = await dataDb.query('SELECT * FROM dt_tables WHERE slug = $1', [slug]);

    if (tableResult.rows.length === 0) {
      throw new NotFoundError('Tabelle nicht gefunden');
    }

    const table = tableResult.rows[0];

    // Get fields
    const fieldsResult = await dataDb.query(
      `
        SELECT * FROM dt_fields
        WHERE table_id = $1
        ORDER BY field_order, created_at
    `,
      [table.id]
    );

    // Get views
    const viewsResult = await dataDb.query(
      `
        SELECT * FROM dt_views
        WHERE table_id = $1
        ORDER BY is_default DESC, name
    `,
      [table.id]
    );

    // Get row count
    let rowCount = 0;
    try {
      const countResult = await dataDb.query(
        `SELECT COUNT(*)::int as count FROM ${escapeTableName(slug)}`
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
        row_count: rowCount,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/datentabellen/tables
 * Create a new table
 * Optionally creates a default "Name" field if createDefaultField is true
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, icon, color, createDefaultField, space_id, category } = req.body;

    // Validation
    if (!name || !name.trim()) {
      throw new ValidationError('Tabellenname erforderlich');
    }

    const slug = generateSlug(name);

    if (!isValidSlug(slug)) {
      throw new ValidationError('Tabellenname enthält ungültige Zeichen');
    }

    // Validate space_id against main-db if provided
    if (space_id) {
      const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        space_id,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Ungültiger Wissensbereich');
      }
    }

    // Start transaction
    const result = await dataDb.transaction(async client => {
      // Check if slug exists
      const existingResult = await client.query('SELECT id FROM dt_tables WHERE slug = $1', [slug]);

      if (existingResult.rows.length > 0) {
        throw new ConflictError('Eine Tabelle mit diesem Namen existiert bereits');
      }

      // Create meta entry
      const tableResult = await client.query(
        `
            INSERT INTO dt_tables (name, slug, description, icon, color, created_by, space_id, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `,
        [
          name.trim(),
          slug,
          description || null,
          icon || '📦',
          color || '#45ADFF',
          req.user?.username || 'system',
          space_id || null,
          category || null,
        ]
      );

      const table = tableResult.rows[0];

      // Create physical data table with optional default "name" column
      if (createDefaultField) {
        await client.query(`
                CREATE TABLE ${escapeTableName(slug)} (
                    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    _created_at TIMESTAMPTZ DEFAULT NOW(),
                    _updated_at TIMESTAMPTZ DEFAULT NOW(),
                    _created_by VARCHAR(100),
                    name TEXT
                )
            `);

        // Create default "Name" field metadata
        await client.query(
          `
                INSERT INTO dt_fields (table_id, name, slug, field_type, field_order, is_primary_display)
                VALUES ($1, 'Name', 'name', 'text', 0, true)
            `,
          [table.id]
        );

        logger.info(`[Datentabellen] Created table with default field: ${name} (${slug})`);
      } else {
        await client.query(`
                CREATE TABLE ${escapeTableName(slug)} (
                    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    _created_at TIMESTAMPTZ DEFAULT NOW(),
                    _updated_at TIMESTAMPTZ DEFAULT NOW(),
                    _created_by VARCHAR(100)
                )
            `);

        logger.info(`[Datentabellen] Created table: ${name} (${slug})`);
      }

      // Create update trigger (slug already validated above)
      await client.query(`
            CREATE TRIGGER "trigger_data_${slug}_updated_at"
                BEFORE UPDATE ON ${escapeTableName(slug)}
                FOR EACH ROW
                EXECUTE FUNCTION update_dt_updated_at()
        `);

      return table;
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Tabelle erfolgreich erstellt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PATCH /api/v1/datentabellen/tables/:slug
 * Update table metadata
 */
router.patch(
  '/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { name, description, icon, color, space_id, status, category } = req.body;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    // Check if table exists
    const existingResult = await dataDb.query('SELECT * FROM dt_tables WHERE slug = $1', [slug]);

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

    if (space_id !== undefined) {
      // Validate space_id against main-db if not null
      if (space_id) {
        const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
          space_id,
        ]);
        if (spaceCheck.rows.length === 0) {
          throw new ValidationError('Ungültiger Wissensbereich');
        }
      }
      updates.push(`space_id = $${paramIndex++}`);
      params.push(space_id || null);
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'draft', 'archived'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`Ungültiger Status. Erlaubt: ${validStatuses.join(', ')}`);
      }
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category || null);
    }

    if (updates.length === 0) {
      throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(slug);
    const result = await dataDb.query(
      `
        UPDATE dt_tables
        SET ${updates.join(', ')}
        WHERE slug = $${paramIndex}
        RETURNING *
    `,
      params
    );

    logger.info(`[Datentabellen] Updated table: ${slug}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Tabelle erfolgreich aktualisiert',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/v1/datentabellen/tables/:slug
 * Delete a table and all its data
 */
router.delete(
  '/:slug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!isValidSlug(slug)) {
      throw new ValidationError('Ungültiger Tabellenname');
    }

    // Check if table exists
    const existingResult = await dataDb.query('SELECT * FROM dt_tables WHERE slug = $1', [slug]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Tabelle nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // Cannot delete system tables
    if (existing.is_system) {
      throw new ValidationError('Systemtabellen können nicht gelöscht werden');
    }

    // Delete in transaction
    await dataDb.transaction(async client => {
      // Drop data table (CASCADE handles trigger)
      await client.query(`DROP TABLE IF EXISTS ${escapeTableName(slug)} CASCADE`);

      // Delete meta entry (CASCADE handles fields, views, relations)
      await client.query('DELETE FROM dt_tables WHERE slug = $1', [slug]);
    });

    logger.info(`[Datentabellen] Deleted table: ${slug}`);

    res.json({
      success: true,
      message: 'Tabelle erfolgreich gelöscht',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/datentabellen/tables/:slug/fields
 * Add a field to a table
 */
router.post(
  '/:slug/fields',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
      name,
      field_type,
      unit,
      is_required,
      is_unique,
      is_primary_display,
      default_value,
      options,
      validation,
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
    const tableResult = await dataDb.query('SELECT id FROM dt_tables WHERE slug = $1', [slug]);

    if (tableResult.rows.length === 0) {
      throw new NotFoundError('Tabelle nicht gefunden');
    }

    const tableId = tableResult.rows[0].id;
    const fieldSlug = generateSlug(name);

    // Map field type to PostgreSQL type
    const pgTypeMap = {
      text: 'TEXT',
      textarea: 'TEXT',
      number: 'NUMERIC',
      currency: 'NUMERIC(12,2)',
      date: 'DATE',
      datetime: 'TIMESTAMPTZ',
      select: 'TEXT',
      multiselect: 'TEXT[]',
      checkbox: 'BOOLEAN',
      relation: 'UUID',
      file: 'TEXT',
      image: 'TEXT',
      email: 'TEXT',
      url: 'TEXT',
      phone: 'TEXT',
      formula: 'TEXT',
    };

    const pgType = pgTypeMap[field_type];
    if (!pgType) {
      throw new ValidationError(`Ungültiger Feldtyp: ${field_type}`);
    }

    // Start transaction
    const result = await dataDb.transaction(async client => {
      // Get next field order
      const orderResult = await client.query(
        `
            SELECT COALESCE(MAX(field_order), -1) + 1 as next_order
            FROM dt_fields WHERE table_id = $1
        `,
        [tableId]
      );
      const fieldOrder = orderResult.rows[0].next_order;

      // Check for duplicate field slug
      const existingField = await client.query(
        `
            SELECT id FROM dt_fields WHERE table_id = $1 AND slug = $2
        `,
        [tableId, fieldSlug]
      );

      if (existingField.rows.length > 0) {
        throw new ConflictError('Ein Feld mit diesem Namen existiert bereits');
      }

      // Add column to physical table
      let columnDef = `${escapeIdentifier(fieldSlug)} ${pgType}`;
      if (is_required) {
        columnDef += ' NOT NULL';
      }
      if (is_unique) {
        columnDef += ' UNIQUE';
      }

      await client.query(`ALTER TABLE ${escapeTableName(slug)} ADD COLUMN ${columnDef}`);

      // Add meta entry
      const fieldResult = await client.query(
        `
            INSERT INTO dt_fields (
                table_id, name, slug, field_type, field_order,
                is_required, is_unique, is_primary_display,
                default_value, options, validation, unit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `,
        [
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
          validation ? JSON.stringify(validation) : null,
          unit || null,
        ]
      );

      logger.info(`[Datentabellen] Added field ${fieldSlug} to ${slug}`);

      return fieldResult.rows[0];
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Feld erfolgreich hinzugefügt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
 * Remove a field from a table
 */
router.delete(
  '/:slug/fields/:fieldSlug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug, fieldSlug } = req.params;

    if (!isValidSlug(slug) || !isValidSlug(fieldSlug)) {
      throw new ValidationError('Ungültiger Tabellen- oder Feldname');
    }

    // Get table and field
    const tableResult = await dataDb.query('SELECT id FROM dt_tables WHERE slug = $1', [slug]);

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
    await dataDb.transaction(async client => {
      // Drop column from physical table
      await client.query(
        `ALTER TABLE ${escapeTableName(slug)} DROP COLUMN IF EXISTS ${escapeIdentifier(fieldSlug)}`
      );

      // Delete meta entry
      await client.query('DELETE FROM dt_fields WHERE table_id = $1 AND slug = $2', [
        tableId,
        fieldSlug,
      ]);
    });

    logger.info(`[Datentabellen] Removed field ${fieldSlug} from ${slug}`);

    res.json({
      success: true,
      message: 'Feld erfolgreich entfernt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PATCH /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
 * Update a field (limited - cannot change type)
 */
router.patch(
  '/:slug/fields/:fieldSlug',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug, fieldSlug } = req.params;
    const {
      name,
      field_type,
      unit,
      is_required,
      is_primary_display,
      default_value,
      options,
      validation,
    } = req.body;

    if (!isValidSlug(slug) || !isValidSlug(fieldSlug)) {
      throw new ValidationError('Ungültiger Tabellen- oder Feldname');
    }

    // Get table and field
    const tableResult = await dataDb.query('SELECT id FROM dt_tables WHERE slug = $1', [slug]);

    if (tableResult.rows.length === 0) {
      throw new NotFoundError('Tabelle nicht gefunden');
    }

    const tableId = tableResult.rows[0].id;

    // Map field type to PostgreSQL type (for ALTER COLUMN TYPE)
    const pgTypeMap = {
      text: 'TEXT',
      textarea: 'TEXT',
      number: 'NUMERIC',
      currency: 'NUMERIC(12,2)',
      date: 'DATE',
      datetime: 'TIMESTAMPTZ',
      select: 'TEXT',
      multiselect: 'TEXT[]',
      checkbox: 'BOOLEAN',
      relation: 'UUID',
      file: 'TEXT',
      image: 'TEXT',
      email: 'TEXT',
      url: 'TEXT',
      phone: 'TEXT',
      formula: 'TEXT',
    };

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined && name.trim()) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (field_type !== undefined) {
      const pgType = pgTypeMap[field_type];
      if (!pgType) {
        throw new ValidationError(`Ungültiger Feldtyp: ${field_type}`);
      }
      updates.push(`field_type = $${paramIndex++}`);
      params.push(field_type);
    }

    if (unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      params.push(unit || null);
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

    // Use transaction if field_type change requires ALTER TABLE
    if (field_type !== undefined) {
      const pgType = pgTypeMap[field_type];

      const result = await dataDb.transaction(async client => {
        // ALTER COLUMN TYPE on the physical table
        await client.query(
          `ALTER TABLE ${escapeTableName(slug)} ALTER COLUMN ${escapeIdentifier(fieldSlug)} TYPE ${pgType} USING ${escapeIdentifier(fieldSlug)}::${pgType}`
        );

        // Update dt_fields metadata
        params.push(tableId, fieldSlug);
        const fieldResult = await client.query(
          `UPDATE dt_fields SET ${updates.join(', ')} WHERE table_id = $${paramIndex} AND slug = $${paramIndex + 1} RETURNING *`,
          params
        );
        return fieldResult;
      });

      if (result.rows.length === 0) {
        throw new NotFoundError('Feld nicht gefunden');
      }

      logger.info(
        `[Datentabellen] Updated field ${fieldSlug} in ${slug} (type changed to ${field_type})`
      );

      return res.json({
        success: true,
        data: result.rows[0],
        message: 'Feld erfolgreich aktualisiert',
        timestamp: new Date().toISOString(),
      });
    }

    params.push(tableId, fieldSlug);

    const result = await dataDb.query(
      `
        UPDATE dt_fields
        SET ${updates.join(', ')}
        WHERE table_id = $${paramIndex} AND slug = $${paramIndex + 1}
        RETURNING *
    `,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Feld nicht gefunden');
    }

    logger.info(`[Datentabellen] Updated field ${fieldSlug} in ${slug}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Feld erfolgreich aktualisiert',
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;

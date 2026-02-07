/**
 * Datentabellen - Quotes API Routes
 * Quote generation, management, and PDF export
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const dataDb = require('../../dataDatabase');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const pdfService = require('../../services/pdfService');

/**
 * GET /api/v1/datentabellen/quotes
 * List all quotes with pagination and filtering
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 25,
        status,
        customer,
        sort = 'created_at',
        order = 'desc'
    } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(status);
    }

    if (customer) {
        conditions.push(`(customer_email ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR customer_company ILIKE $${paramIndex})`);
        params.push(`%${customer}%`);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Validate sort field
    const validSortFields = ['created_at', 'quote_number', 'total', 'customer_name', 'status', 'valid_until'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await dataDb.query(
        `SELECT COUNT(*)::int as total FROM dt_quotes ${whereClause}`,
        params
    );
    const total = countResult.rows[0].total;

    // Get quotes
    const quotesResult = await dataDb.query(`
        SELECT
            q.id, q.quote_number, q.customer_email, q.customer_name, q.customer_company,
            q.subtotal, q.tax_amount, q.total, q.currency, q.status,
            q.valid_until, q.sent_at, q.created_at, q.created_by,
            t.name as template_name,
            (SELECT COUNT(*)::int FROM dt_quote_positions WHERE quote_id = q.id) as position_count
        FROM dt_quotes q
        LEFT JOIN dt_quote_templates t ON q.template_id = t.id
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limitNum, offset]);

    res.json({
        success: true,
        data: quotesResult.rows,
        meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/quotes/:quoteId
 * Get single quote with positions
 */
router.get('/:quoteId', requireAuth, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(quoteId)) {
        throw new ValidationError('Ungültige Angebots-ID');
    }

    // Get quote
    const quoteResult = await dataDb.query(`
        SELECT q.*, t.name as template_name
        FROM dt_quotes q
        LEFT JOIN dt_quote_templates t ON q.template_id = t.id
        WHERE q.id = $1
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
        throw new NotFoundError('Angebot nicht gefunden');
    }

    const quote = quoteResult.rows[0];

    // Get positions
    const positionsResult = await dataDb.query(`
        SELECT * FROM dt_quote_positions
        WHERE quote_id = $1
        ORDER BY position_number
    `, [quoteId]);

    // Get history
    const historyResult = await dataDb.query(`
        SELECT * FROM dt_quote_history
        WHERE quote_id = $1
        ORDER BY performed_at DESC
        LIMIT 50
    `, [quoteId]);

    res.json({
        success: true,
        data: {
            ...quote,
            positions: positionsResult.rows,
            history: historyResult.rows
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/quotes
 * Create a new quote
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const {
        customer_email,
        customer_name,
        customer_company,
        customer_address,
        customer_phone,
        customer_reference,
        positions,
        introduction_text,
        notes,
        internal_notes,
        template_id,
        valid_days,
        discount_percent
    } = req.body;

    // Validation
    if (!customer_email || !customer_email.trim()) {
        throw new ValidationError('Kunden-E-Mail erforderlich');
    }

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
        throw new ValidationError('Mindestens eine Position erforderlich');
    }

    // Get template (or default)
    let template;
    if (template_id) {
        const templateResult = await dataDb.query(
            'SELECT * FROM dt_quote_templates WHERE id = $1',
            [template_id]
        );
        if (templateResult.rows.length === 0) {
            throw new NotFoundError('Vorlage nicht gefunden');
        }
        template = templateResult.rows[0];
    } else {
        const defaultResult = await dataDb.query(
            'SELECT * FROM dt_quote_templates WHERE is_default = TRUE LIMIT 1'
        );
        template = defaultResult.rows.length > 0 ? defaultResult.rows[0] : null;
    }

    const taxRate = template?.tax_rate || 19.00;
    const validityDays = valid_days || template?.pdf_validity_days || 30;
    const discountPct = parseFloat(discount_percent) || 0;

    // Calculate totals
    let subtotal = 0;
    const processedPositions = positions.map((pos, index) => {
        const quantity = parseFloat(pos.quantity) || 1;
        const unitPrice = parseFloat(pos.unit_price) || 0;
        const posDiscount = parseFloat(pos.discount_percent) || 0;
        const discountAmount = unitPrice * quantity * (posDiscount / 100);
        const totalPrice = (unitPrice * quantity) - discountAmount;

        if (!pos.is_optional && !pos.is_alternative) {
            subtotal += totalPrice;
        }

        return {
            position_number: index + 1,
            product_id: pos.product_id || null,
            product_table_slug: pos.product_table_slug || null,
            name: pos.name,
            description: pos.description || null,
            sku: pos.sku || null,
            quantity,
            unit: pos.unit || 'Stück',
            unit_price: unitPrice,
            discount_percent: posDiscount,
            discount_amount: discountAmount,
            total_price: totalPrice,
            is_optional: pos.is_optional || false,
            is_alternative: pos.is_alternative || false
        };
    });

    // Apply quote-level discount
    const quoteDiscountAmount = subtotal * (discountPct / 100);
    const discountedSubtotal = subtotal - quoteDiscountAmount;
    const taxAmount = discountedSubtotal * (taxRate / 100);
    const total = discountedSubtotal + taxAmount;

    // Calculate valid_until
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    // Create quote in transaction
    const result = await dataDb.transaction(async (client) => {
        // Insert quote (quote_number auto-generated by trigger)
        const quoteResult = await client.query(`
            INSERT INTO dt_quotes (
                customer_email, customer_name, customer_company, customer_address,
                customer_phone, customer_reference, positions, subtotal,
                discount_percent, discount_amount, tax_rate, tax_amount, total,
                currency, valid_until, introduction_text, notes, internal_notes,
                template_id, source_type, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *
        `, [
            customer_email.trim(),
            customer_name || null,
            customer_company || null,
            customer_address || null,
            customer_phone || null,
            customer_reference || null,
            JSON.stringify(processedPositions),
            discountedSubtotal,
            discountPct,
            quoteDiscountAmount,
            taxRate,
            taxAmount,
            total,
            template?.currency || 'EUR',
            validUntil,
            introduction_text || null,
            notes || null,
            internal_notes || null,
            template?.id || null,
            'manual',
            req.user?.username || 'system'
        ]);

        const quote = quoteResult.rows[0];

        // Insert positions
        for (const pos of processedPositions) {
            await client.query(`
                INSERT INTO dt_quote_positions (
                    quote_id, position_number, product_id, product_table_slug,
                    name, description, sku, quantity, unit, unit_price,
                    discount_percent, discount_amount, total_price,
                    is_optional, is_alternative
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [
                quote.id,
                pos.position_number,
                pos.product_id,
                pos.product_table_slug,
                pos.name,
                pos.description,
                pos.sku,
                pos.quantity,
                pos.unit,
                pos.unit_price,
                pos.discount_percent,
                pos.discount_amount,
                pos.total_price,
                pos.is_optional,
                pos.is_alternative
            ]);
        }

        // Add history entry
        await client.query(`
            INSERT INTO dt_quote_history (quote_id, action, new_status, performed_by)
            VALUES ($1, 'created', 'draft', $2)
        `, [quote.id, req.user?.username || 'system']);

        return quote;
    });

    logger.info(`[Datentabellen] Created quote: ${result.quote_number}`);

    res.status(201).json({
        success: true,
        data: result,
        message: 'Angebot erfolgreich erstellt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PATCH /api/v1/datentabellen/quotes/:quoteId
 * Update quote (only allowed for draft status)
 */
router.patch('/:quoteId', requireAuth, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(quoteId)) {
        throw new ValidationError('Ungültige Angebots-ID');
    }

    // Check quote exists and is draft
    const existingResult = await dataDb.query(
        'SELECT * FROM dt_quotes WHERE id = $1',
        [quoteId]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Angebot nicht gefunden');
    }

    const existing = existingResult.rows[0];

    if (existing.status !== 'draft') {
        throw new ValidationError('Nur Entwürfe können bearbeitet werden');
    }

    // Build update - only allow certain fields
    const allowedFields = [
        'customer_email', 'customer_name', 'customer_company', 'customer_address',
        'customer_phone', 'customer_reference', 'introduction_text', 'notes', 'internal_notes'
    ];

    const updates = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = $${paramIndex++}`);
            params.push(req.body[field]);
        }
    }

    if (updates.length === 0) {
        throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(quoteId);

    const result = await dataDb.query(`
        UPDATE dt_quotes
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);

    logger.info(`[Datentabellen] Updated quote: ${result.rows[0].quote_number}`);

    res.json({
        success: true,
        data: result.rows[0],
        message: 'Angebot erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/quotes/:quoteId/status
 * Update quote status
 */
router.post('/:quoteId/status', requireAuth, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const { status } = req.body;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(quoteId)) {
        throw new ValidationError('Ungültige Angebots-ID');
    }

    const validStatuses = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'];
    if (!validStatuses.includes(status)) {
        throw new ValidationError('Ungültiger Status');
    }

    // Get existing quote
    const existingResult = await dataDb.query(
        'SELECT * FROM dt_quotes WHERE id = $1',
        [quoteId]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Angebot nicht gefunden');
    }

    const oldStatus = existingResult.rows[0].status;

    // Update status with timestamps
    const updateFields = ['status = $1'];
    const updateParams = [status];
    let paramIndex = 2;

    if (status === 'sent' && oldStatus !== 'sent') {
        updateFields.push(`sent_at = NOW()`);
    } else if (status === 'accepted') {
        updateFields.push(`accepted_at = NOW()`);
    } else if (status === 'rejected') {
        updateFields.push(`rejected_at = NOW()`);
    }

    updateParams.push(quoteId);

    const result = await dataDb.transaction(async (client) => {
        const quoteResult = await client.query(`
            UPDATE dt_quotes
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, updateParams);

        // Add history entry
        await client.query(`
            INSERT INTO dt_quote_history (quote_id, action, old_status, new_status, performed_by)
            VALUES ($1, 'status_changed', $2, $3, $4)
        `, [quoteId, oldStatus, status, req.user?.username || 'system']);

        return quoteResult.rows[0];
    });

    logger.info(`[Datentabellen] Quote ${result.quote_number} status: ${oldStatus} -> ${status}`);

    res.json({
        success: true,
        data: result,
        message: `Status auf "${status}" geändert`,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/v1/datentabellen/quotes/:quoteId/pdf
 * Generate and download quote PDF
 */
router.get('/:quoteId/pdf', requireAuth, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(quoteId)) {
        throw new ValidationError('Ungültige Angebots-ID');
    }

    // Get quote with positions and template
    const quoteResult = await dataDb.query(`
        SELECT q.*, t.*
        FROM dt_quotes q
        LEFT JOIN dt_quote_templates t ON q.template_id = t.id
        WHERE q.id = $1
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
        throw new NotFoundError('Angebot nicht gefunden');
    }

    const quote = quoteResult.rows[0];

    // Get positions
    const positionsResult = await dataDb.query(`
        SELECT * FROM dt_quote_positions
        WHERE quote_id = $1
        ORDER BY position_number
    `, [quoteId]);

    const positions = positionsResult.rows;

    // Generate PDF
    const pdfBuffer = await pdfService.generateQuotePDF(quote, positions);

    // Set response headers
    const filename = `Angebot_${quote.quote_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    logger.info(`[Datentabellen] Generated PDF for quote: ${quote.quote_number}`);

    res.send(pdfBuffer);
}));

/**
 * GET /api/v1/datentabellen/quote-templates
 * List all quote templates
 */
router.get('/templates', requireAuth, asyncHandler(async (req, res) => {
    const result = await dataDb.query(`
        SELECT * FROM dt_quote_templates
        ORDER BY is_default DESC, name
    `);

    res.json({
        success: true,
        data: result.rows,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/v1/datentabellen/quote-templates
 * Create a new quote template
 */
router.post('/templates', requireAuth, asyncHandler(async (req, res) => {
    const {
        name,
        is_default,
        company_name,
        company_address,
        company_phone,
        company_email,
        company_website,
        company_tax_id,
        company_bank_details,
        primary_color,
        tax_rate,
        currency,
        pdf_validity_days,
        pdf_payment_terms,
        email_subject_template,
        email_body_template
    } = req.body;

    if (!name || !name.trim()) {
        throw new ValidationError('Vorlagenname erforderlich');
    }

    // If setting as default, unset other defaults
    if (is_default) {
        await dataDb.query('UPDATE dt_quote_templates SET is_default = FALSE WHERE is_default = TRUE');
    }

    const result = await dataDb.query(`
        INSERT INTO dt_quote_templates (
            name, is_default, company_name, company_address, company_phone,
            company_email, company_website, company_tax_id, company_bank_details,
            primary_color, tax_rate, currency, pdf_validity_days, pdf_payment_terms,
            email_subject_template, email_body_template
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
    `, [
        name.trim(),
        is_default || false,
        company_name || null,
        company_address || null,
        company_phone || null,
        company_email || null,
        company_website || null,
        company_tax_id || null,
        company_bank_details || null,
        primary_color || '#45ADFF',
        tax_rate || 19.00,
        currency || 'EUR',
        pdf_validity_days || 30,
        pdf_payment_terms || null,
        email_subject_template || null,
        email_body_template || null
    ]);

    logger.info(`[Datentabellen] Created quote template: ${name}`);

    res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Vorlage erfolgreich erstellt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PATCH /api/v1/datentabellen/quote-templates/:templateId
 * Update a quote template
 */
router.patch('/templates/:templateId', requireAuth, asyncHandler(async (req, res) => {
    const { templateId } = req.params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
        throw new ValidationError('Ungültige Vorlagen-ID');
    }

    // Check exists
    const existingResult = await dataDb.query(
        'SELECT id FROM dt_quote_templates WHERE id = $1',
        [templateId]
    );

    if (existingResult.rows.length === 0) {
        throw new NotFoundError('Vorlage nicht gefunden');
    }

    // If setting as default, unset other defaults
    if (req.body.is_default) {
        await dataDb.query('UPDATE dt_quote_templates SET is_default = FALSE WHERE is_default = TRUE AND id != $1', [templateId]);
    }

    // Build update
    const allowedFields = [
        'name', 'is_default', 'company_name', 'company_address', 'company_phone',
        'company_email', 'company_website', 'company_tax_id', 'company_bank_details',
        'primary_color', 'secondary_color', 'tax_rate', 'currency', 'currency_symbol',
        'pdf_validity_days', 'pdf_payment_terms', 'pdf_footer_text',
        'email_subject_template', 'email_body_template'
    ];

    const updates = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = $${paramIndex++}`);
            params.push(req.body[field]);
        }
    }

    if (updates.length === 0) {
        throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(templateId);

    const result = await dataDb.query(`
        UPDATE dt_quote_templates
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);

    logger.info(`[Datentabellen] Updated quote template: ${templateId}`);

    res.json({
        success: true,
        data: result.rows[0],
        message: 'Vorlage erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;

/**
 * Self-Healing API routes
 * Provides access to self-healing events and status
 */

const express = require('express');
const { dienstName } = require('../../utils/dienstNamen');
const router = express.Router();
const db = require('../../database');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');

const MAX_LIMIT = 500;
const boundLimit = (val, def = 20) => Math.min(Math.max(1, parseInt(val) || def), MAX_LIMIT);
const boundOffset = val => Math.max(0, parseInt(val) || 0);

// GET /api/self-healing/events - Get recent self-healing events
router.get(
  '/events',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { limit = 20, offset = 0, severity = null, event_type = null, since = null } = req.query;

    // Build query
    let query = 'SELECT * FROM self_healing_events WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filter by severity
    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity.toUpperCase());
      paramIndex++;
    }

    // Filter by event type
    if (event_type) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }

    // Filter by timestamp (since)
    if (since) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    // Order and limit
    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(boundLimit(limit), boundOffset(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM self_healing_events WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (severity) {
      countQuery += ` AND severity = $${countParamIndex}`;
      countParams.push(severity.toUpperCase());
      countParamIndex++;
    }

    if (event_type) {
      countQuery += ` AND event_type = $${countParamIndex}`;
      countParams.push(event_type);
      countParamIndex++;
    }

    if (since) {
      countQuery += ` AND timestamp >= $${countParamIndex}`;
      countParams.push(since);
      countParamIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      // Je Ereignis der deutsche Name des Dienstes (J35, `utils/dienstNamen`).
      events: result.rows.map(e => ({ ...e, dienst_anzeige: dienstName(e.service_name) })),
      count: result.rows.length,
      total: totalCount,
      limit: boundLimit(limit),
      offset: boundOffset(offset),
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;

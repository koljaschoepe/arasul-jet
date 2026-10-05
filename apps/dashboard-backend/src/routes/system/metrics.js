/**
 * Metrics API routes
 * Handles live metrics and historical data
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { metricsLimiter } = require('../../middleware/rateLimit');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError } = require('../../utils/errors');
const { holeLiveMetriken } = require('../../services/core/liveMetriken');

// GET /api/metrics/live
router.get(
  '/live',
  requireAuth,
  requireRole('admin'),
  metricsLimiter,
  asyncHandler(async (req, res) => {
    // Collector zuerst, sonst die letzten Werte aus der Datenbank; liefert
    // keiner von beiden, wirft der Dienst 503.
    res.json(await holeLiveMetriken());
  })
);

// GET /api/metrics/history
router.get(
  '/history',
  requireAuth,
  requireRole('admin'),
  metricsLimiter,
  asyncHandler(async (req, res) => {
    const range = req.query.range || '24h';

    // Parse range to hours with whitelist validation
    let hours = 24;
    const validRanges = {
      '1h': 1,
      '6h': 6,
      '12h': 12,
      '24h': 24,
      '48h': 48,
      '7d': 168,
      '30d': 720,
    };

    if (validRanges[range]) {
      hours = validRanges[range];
    } else {
      throw new ValidationError(
        'Der Zeitraum ist ungültig. Erlaubt sind 1h, 6h, 12h, 24h, 48h, 7d und 30d.'
      );
    }

    const intervalMinutes = Math.max(1, Math.floor(hours / 100));

    // Fetch historical data with parameterized query
    const result = await db.query(
      `
        WITH time_series AS (
            SELECT generate_series(
                NOW() - INTERVAL '1 hour' * $1,
                NOW(),
                INTERVAL '1 minute' * $2
            ) AS ts
        )
        SELECT
            ts as timestamp,
            (SELECT value FROM metrics_cpu WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as cpu,
            (SELECT value FROM metrics_ram WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as ram,
            (SELECT value FROM metrics_swap WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as swap,
            (SELECT value FROM metrics_gpu WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as gpu,
            (SELECT value FROM metrics_temperature WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as temperature,
            (SELECT percent FROM metrics_disk WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as disk_used
        FROM time_series
        ORDER BY ts ASC
    `,
      [hours, intervalMinutes]
    );

    const data = {
      range,
      timestamps: [],
      cpu: [],
      ram: [],
      swap: [],
      gpu: [],
      temperature: [],
      disk_used: [],
    };

    result.rows.forEach(row => {
      data.timestamps.push(row.timestamp);
      data.cpu.push(parseFloat(row.cpu) || 0);
      data.ram.push(parseFloat(row.ram) || 0);
      data.swap.push(parseFloat(row.swap) || 0);
      data.gpu.push(parseFloat(row.gpu) || 0);
      data.temperature.push(parseFloat(row.temperature) || 0);
      data.disk_used.push(parseFloat(row.disk_used) || 0);
    });

    data.timestamp = new Date().toISOString();
    res.json(data);
  })
);

module.exports = router;
